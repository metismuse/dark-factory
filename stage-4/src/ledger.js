"use strict";
/* Pocketful ledger — domain state and rules for all four stages.
 * Zero dependencies. All mutations run synchronously inside atomic(),
 * so concurrent requests serialize and balances never go negative
 * even transiently. Amounts are integer minor units.
 */
const crypto = require("crypto");

const STAGE = Math.min(4, Math.max(1, parseInt(process.env.POCKETFUL_STAGE || "4", 10) || 4));
const MAX_AMOUNT = 1000000000;

// ---------------------------------------------------------------- time ---
let lastMs = 0;
function nowMs() {
  const t = Date.now();
  lastMs = t > lastMs ? t : lastMs + 1;
  return lastMs;
}
function iso(ms) {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, "+00:00");
}
function parseInstant(s) {
  if (typeof s !== "string" || !s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------- errors --
function fail(status, code, message) {
  const e = new Error(message || code);
  e.status = status; e.code = code;
  return e;
}

// ---------------------------------------------------------------- state ---
function freshState() {
  return {
    currency: "EUR", minor_units: 2, authTtl: 600,
    users: {}, handles: {}, emails: {}, tokens: {},
    operators: [],
    payments: {}, paymentSeq: [],
    requests: {}, requestSeq: [],
    splits: {},
    auths: {}, authSeq: [],
    settlements: {},
    batches: {},
    snapshots: {},
    idem: {},
    seq: { user: 0, payment: 0, request: 0, split: 0, auth: 0, settlement: 0, batch: 0, snapshot: 0 },
  };
}
let S = freshState();

// Async mutex: every state-mutating section runs inside atomic(). The work
// itself is synchronous, so the event loop cannot interleave two mutations.
let tail = Promise.resolve();
function atomic(fn) {
  const run = tail.then(() => fn());
  tail = run.then(() => undefined, () => undefined);
  return run;
}

// --------------------------------------------------------------- crypto ---
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${h}`;
}
function verifyPassword(pw, stored) {
  try {
    const parts = String(stored).split("$");
    if (parts[0] !== "scrypt" || parts.length !== 6) return false;
    const h = crypto.scryptSync(pw, parts[4], 32,
      { N: +parts[1], r: +parts[2], p: +parts[3] }).toString("hex");
    const a = Buffer.from(h, "hex"), b = Buffer.from(parts[5], "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function newToken() { return crypto.randomBytes(24).toString("hex"); }
function deriveHandle(email) {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);
}
function pad(n) { return String(n).padStart(6, "0"); }
function nextId(prefix, key) { return `${prefix}_${pad(++S.seq[key])}`; }

// ------------------------------------------------------------- validators -
function vAmount(v, { min = 1 } = {}) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > MAX_AMOUNT)
    throw fail(422, "validation_failed", "amount must be an integer 1..1000000000");
  return v;
}
function vNote(v) {
  if (v === undefined) return "";
  if (typeof v !== "string" || [...v].length > 200)
    throw fail(422, "validation_failed", "note must be a string of at most 200 characters");
  return v;
}
function vVisibility(v) {
  if (v === undefined) return "public";
  if (v !== "public" && v !== "private")
    throw fail(422, "validation_failed", "visibility must be public or private");
  return v;
}
function vHandle(v) {
  if (typeof v !== "string" || !v) throw fail(422, "validation_failed", "handle is required");
  const u = S.handles[v] !== undefined ? S.users[S.handles[v]] : null;
  if (!u) throw fail(404, "not_found", "no user has that handle");
  return u;
}
function vRawHandle(v) { return vHandle(v); }
function vLimit(q, dflt) {
  if (q === null || q === undefined) return dflt;
  if (!/^\d+$/.test(q)) throw fail(422, "validation_failed", "limit must be an integer");
  const n = +q;
  if (n < 1 || n > 200) throw fail(422, "validation_failed", "limit must be 1..200");
  return n;
}
function vOffset(q) {
  if (q === null || q === undefined) return 0;
  if (!/^\d+$/.test(q)) throw fail(422, "validation_failed", "offset must be a non-negative integer");
  return +q;
}
function vEnum(q, allowed, dflt) {
  if (q === null || q === undefined) return dflt;
  if (!allowed.includes(q)) throw fail(422, "validation_failed", "bad filter value");
  return q;
}
function vInstant(q, name) {
  const ms = parseInstant(q);
  if (ms === null) throw fail(422, "validation_failed", `${name} must be an RFC 3339 instant`);
  return ms;
}

// ------------------------------------------------------- idempotency ------
function canonJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
}
function idemCheck(user, method, path, key, body) {
  const scope = `${user.id}\n${method}\n${path}\n${key}`;
  const canon = canonJson(body);
  const rec = S.idem[scope];
  if (rec) {
    if (rec.canon === canon) return { replay: rec.body };
    throw fail(409, "idempotency_key_reuse", "idempotency key already used with a different body");
  }
  return { scope, canon };
}
function idemClaim(scope, canon, body) { S.idem[scope] = { canon, body }; }
function idemKey(headers) {
  const k = headers["idempotency-key"];
  if (k === undefined || k === "") throw fail(400, "missing_idempotency_key", "Idempotency-Key is required");
  if (k.length > 255) throw fail(422, "validation_failed", "Idempotency-Key is 1..255 characters");
  return k;
}

// ---------------------------------------------------------------- views ---
function paymentView(p, amountOverride) {
  const from = S.users[p.from_id], to = S.users[p.to_id];
  const rev = p.revisions[p.revisions.length - 1];
  return {
    payment_id: p.id,
    from_user_id: from.id, from_handle: from.handle,
    to_user_id: to.id, to_handle: to.handle,
    amount: amountOverride !== undefined ? amountOverride : rev.amount,
    currency: S.currency, note: p.note, visibility: p.visibility,
    request_id: p.request_id || null,
    authorization_id: p.authorization_id || null,
    settlement_id: p.settlement_id || null,
    refund_of: p.refund_of || null,
    created_at: p.created_at,
  };
}
function requestView(r) {
  const rq = S.users[r.requester_id], py = S.users[r.payer_id];
  return {
    request_id: r.id, requester_id: rq.id, requester_handle: rq.handle,
    payer_id: py.id, payer_handle: py.handle,
    amount: r.amount, currency: S.currency, note: r.note,
    status: r.status, payment_id: r.payment_id || null, created_at: r.created_at,
  };
}
function authStatus(a, t) {
  if (a.status === "open" && a.expires_at <= t) return "expired";
  return a.status;
}
function authView(a, t) {
  const from = S.users[a.from_id], to = S.users[a.to_id];
  return {
    authorization_id: a.id,
    from_user_id: from.id, from_handle: from.handle,
    to_user_id: to.id, to_handle: to.handle,
    amount: a.amount, captured_amount: a.captured_amount, currency: S.currency,
    note: a.note, visibility: a.visibility,
    status: authStatus(a, t === undefined ? nowMs() : t),
    expires_at: iso(a.expires_at),
    payment_id: a.payment_id || null, payment_ids: [...a.payment_ids],
    remaining_amount: a.status === "open" ? a.amount - a.captured_amount : 0,
    closed_at: a.closed_at ? iso(a.closed_at) : null,
    created_at: a.created_at,
  };
}
function meView(u, extra) {
  const base = {
    user_id: u.id, display_name: u.display_name, handle: u.handle, email: u.email,
    balance: u.total, available: u.total - u.held, currency: S.currency,
    minor_units: S.minor_units, total: u.total,
  };
  if (STAGE >= 2) base.held = u.held;
  return Object.assign(base, extra || {});
}

// ------------------------------------------------------- money core -------
function newPayment({ from_id, to_id, amount, note, visibility, request_id, authorization_id, settlement_id, refund_of, created_at }) {
  const t = created_at !== undefined ? created_at : nowMs();
  const p = {
    id: nextId("p", "payment"), from_id, to_id, amount: undefined,
    note, visibility, request_id: request_id || null,
    authorization_id: authorization_id || null, settlement_id: settlement_id || null,
    refund_of: refund_of || null, created_at: iso(t), created_ms: t,
    revisions: [{ revision: 1, amount, effective_at: t, recorded_at: t, reason: "", batch_id: null }],
    lastRecorded: t, refund_ids: [],
  };
  S.payments[p.id] = p; S.paymentSeq.push(p.id);
  return p;
}
function move(from_id, to_id, amount) {
  const f = S.users[from_id], t = S.users[to_id];
  if (f.total - f.held < amount) throw fail(409, "insufficient_funds", "insufficient available funds");
  f.total -= amount; t.total += amount;
}
function newRequest({ requester_id, payer_id, amount, note, created_at }) {
  const t = created_at !== undefined ? created_at : nowMs();
  const r = {
    id: nextId("r", "request"), requester_id, payer_id, amount, note,
    status: "pending", payment_id: null, created_at: iso(t), created_ms: t,
  };
  S.requests[r.id] = r; S.requestSeq.push(r.id);
  return r;
}

// ------------------------------------------------------- authn ------------
function bearer(headers) {
  const h = headers["authorization"];
  if (!h) throw fail(401, "unauthenticated", "missing bearer token");
  const m = /^Bearer (.+)$/.exec(h);
  const uid = m && S.tokens[m[1]];
  if (!uid || !S.users[uid]) throw fail(401, "unauthenticated", "bad bearer token");
  return S.users[uid];
}
function signup(body) {
  const { email, password, display_name } = body;
  if (email === undefined || password === undefined || display_name === undefined)
    throw fail(422, "validation_failed", "email, password and display_name are required");
  if (typeof email !== "string" || typeof password !== "string" || typeof display_name !== "string")
    throw fail(400, "malformed_request", "signup fields must be strings");
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw fail(422, "validation_failed", "bad email form");
  if (password.length < 8) throw fail(422, "validation_failed", "password is too short");
  if (S.emails[email] !== undefined) throw fail(409, "email_taken", "email is taken");
  const handle = deriveHandle(email);
  if (S.handles[handle] !== undefined) throw fail(409, "handle_taken", "handle is taken");
  const u = {
    id: `u_${pad(++S.seq.user)}`, email, password_hash: hashPassword(password),
    display_name, handle, total: 0, held: 0, opening: 0,
  };
  S.users[u.id] = u; S.handles[handle] = u.id; S.emails[email] = u.id;
  const token = newToken(); S.tokens[token] = u.id;
  return { status: 201, body: { user_id: u.id, display_name, token } };
}
function login(body) {
  const { email, password } = body;
  if (email === undefined || password === undefined)
    throw fail(422, "validation_failed", "email and password are required");
  if (typeof email !== "string" || typeof password !== "string")
    throw fail(400, "malformed_request", "login fields must be strings");
  const u = S.emails[email] !== undefined ? S.users[S.emails[email]] : null;
  if (!u || !verifyPassword(password, u.password_hash))
    throw fail(401, "unauthenticated", "bad credentials");
  const token = newToken(); S.tokens[token] = u.id;
  return { status: 200, body: { user_id: u.id, display_name: u.display_name, token } };
}

// ------------------------------------------------------- payments ---------
function createPayment(user, body) {
  const to = vRawHandle(body.to_handle);
  const amount = vAmount(body.amount);
  const note = vNote(body.note);
  const visibility = vVisibility(body.visibility);
  if (to.id === user.id) throw fail(422, "self_payment", "cannot pay yourself");
  move(user.id, to.id, amount);
  const p = newPayment({ from_id: user.id, to_id: to.id, amount, note, visibility });
  return { status: 201, body: paymentView(p) };
}
function createRequest(user, body) {
  const payer = vRawHandle(body.payer_handle);
  const amount = vAmount(body.amount);
  const note = vNote(body.note);
  if (payer.id === user.id) throw fail(422, "self_request", "cannot request from yourself");
  const r = newRequest({ requester_id: user.id, payer_id: payer.id, amount, note });
  return { status: 201, body: requestView(r) };
}
function payRequest(user, id, body) {
  const r = S.requests[id];
  if (!r) throw fail(404, "not_found", "unknown request");
  if (r.payer_id !== user.id) throw fail(403, "forbidden", "only the payer may pay");
  const visibility = vVisibility(body.visibility);
  if (r.status !== "pending") throw fail(409, "request_not_pending", "request is not pending");
  move(user.id, r.requester_id, r.amount);
  const p = newPayment({
    from_id: user.id, to_id: r.requester_id, amount: r.amount,
    note: r.note, visibility, request_id: r.id,
  });
  r.status = "paid"; r.payment_id = p.id;
  return { status: 201, body: paymentView(p) };
}
function declineRequest(user, id) {
  const r = S.requests[id];
  if (!r) throw fail(404, "not_found", "unknown request");
  if (r.payer_id !== user.id) throw fail(403, "forbidden", "only the payer may decline");
  if (r.status === "paid" || r.status === "cancelled")
    throw fail(409, "request_not_pending", "request is not pending");
  r.status = "declined";
  return { status: 200, body: requestView(r) };
}
function cancelRequest(user, id) {
  const r = S.requests[id];
  if (!r) throw fail(404, "not_found", "unknown request");
  if (r.requester_id !== user.id) throw fail(403, "forbidden", "only the requester may cancel");
  if (r.status === "paid" || r.status === "declined")
    throw fail(409, "request_not_pending", "request is not pending");
  r.status = "cancelled";
  return { status: 200, body: requestView(r) };
}
function listRequests(user, q) {
  const direction = vEnum(q.direction, ["incoming", "outgoing"], null);
  const status = vEnum(q.status, ["pending", "paid", "declined", "cancelled"], null);
  const limit = vLimit(q.limit, 50), offset = vOffset(q.offset);
  let ids = S.requestSeq.filter(id => {
    const r = S.requests[id];
    if (direction === "incoming" && r.payer_id !== user.id) return false;
    if (direction === "outgoing" && r.requester_id !== user.id) return false;
    if (!direction && r.payer_id !== user.id && r.requester_id !== user.id) return false;
    if (status && r.status !== status) return false;
    return true;
  });
  ids.sort((a, b) => S.requests[b].created_ms - S.requests[a].created_ms);
  const page = ids.slice(offset, offset + limit);
  return { status: 200, body: { requests: page.map(id => requestView(S.requests[id])), has_more: offset + limit < ids.length } };
}
function equalSplit(amount, n) {
  const base = Math.floor(amount / n), rem = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
function createSplit(user, body) {
  const amount = vAmount(body.amount);
  const note = vNote(body.note);
  const ph = body.participant_handles;
  if (!Array.isArray(ph) || ph.length === 0)
    throw fail(422, "validation_failed", "participant_handles must be a non-empty array");
  const seen = new Set();
  const participants = ph.map(h => {
    if (typeof h !== "string" || !h) throw fail(422, "validation_failed", "participant handles must be strings");
    if (seen.has(h)) throw fail(422, "validation_failed", "duplicate participant handle");
    seen.add(h);
    return vHandle(h);
  });
  const shares = equalSplit(amount, participants.length);
  const t = nowMs();
  const sp = {
    id: nextId("sp", "split"), creator_id: user.id, amount, note,
    participant_ids: participants.map(u => u.id), created_at: iso(t), created_ms: t,
  };
  S.splits[sp.id] = sp;
  const requests = [];
  participants.forEach((u, i) => {
    if (u.id === user.id) return;
    requests.push(requestView(newRequest({
      requester_id: user.id, payer_id: u.id, amount: shares[i], note, created_at: t,
    })));
  });
  return {
    status: 201,
    body: {
      split_id: sp.id, amount, currency: S.currency, note,
      shares: participants.map((u, i) => ({ handle: u.handle, amount: shares[i] })),
      requests, created_at: sp.created_at,
    },
  };
}
function activity(user, q) {
  // Only limit/offset are validated here; request-only params such as
  // direction/status are ignored, never an error (§3.4).
  const rawDir = q.direction === "in" ? "in" : q.direction === "out" ? "out" : null;
  const limit = vLimit(q.limit, 50), offset = vOffset(q.offset);
  let ids = S.paymentSeq.filter(id => {
    const p = S.payments[id];
    if (p.visibility === "private" && p.from_id !== user.id && p.to_id !== user.id) return false;
    if (rawDir === "in" && p.to_id !== user.id) return false;
    if (rawDir === "out" && p.from_id !== user.id) return false;
    return true;
  });
  ids.sort((a, b) => S.payments[b].created_ms - S.payments[a].created_ms
    || (a < b ? 1 : -1));
  const page = ids.slice(offset, offset + limit);
  return { status: 200, body: { payments: page.map(id => paymentView(S.payments[id])), has_more: offset + limit < ids.length } };
}

// ------------------------------------------------------- settlements ------
function createSettlement(user, body) {
  if (!S.operators.includes(user.id)) throw fail(403, "forbidden", "settlement operator required");
  const tr = body.transfers;
  if (!Array.isArray(tr) || tr.length < 1 || tr.length > 32)
    throw fail(422, "validation_failed", "transfers must contain 1..32 objects");
  const legs = tr.map(e => {
    if (!e || typeof e !== "object" || Array.isArray(e))
      throw fail(422, "validation_failed", "each transfer must be an object");
    const from = vRawHandle(e.from_handle), to = vRawHandle(e.to_handle);
    if (from.id === to.id) throw fail(422, "self_payment", "self-transfer in settlement");
    const amount = vAmount(e.amount);
    return { from, to, amount, note: vNote(e.note), visibility: vVisibility(e.visibility) };
  });
  const net = {};
  legs.forEach(l => {
    net[l.from.id] = (net[l.from.id] || 0) - l.amount;
    net[l.to.id] = (net[l.to.id] || 0) + l.amount;
  });
  for (const [uid, d] of Object.entries(net)) {
    if (d < 0 && S.users[uid].total + d < 0)
      throw fail(409, "insufficient_funds", "settlement is not affordable");
  }
  const t = nowMs();
  const st = { id: nextId("st", "settlement"), committed_at: iso(t), committed_ms: t, payment_ids: [] };
  S.settlements[st.id] = st;
  const payments = legs.map(l => {
    S.users[l.from.id].total -= l.amount; S.users[l.to.id].total += l.amount;
    const p = newPayment({
      from_id: l.from.id, to_id: l.to.id, amount: l.amount, note: l.note,
      visibility: l.visibility, settlement_id: st.id, created_at: t,
    });
    st.payment_ids.push(p.id);
    return paymentView(p);
  });
  return { status: 201, body: { settlement_id: st.id, committed_at: st.committed_at, payments } };
}

// ------------------------------------------------------- authorizations ---
function expireSweep(t) {
  for (const id of S.authSeq) {
    const a = S.auths[id];
    if (a.status === "open" && a.expires_at <= t) {
      const u = S.users[a.from_id];
      const rem = a.amount - a.captured_amount;
      u.held -= rem;
      a.status = "expired"; a.closed_at = a.expires_at;
      a.hold_timeline.push({ t: a.expires_at, hold: 0 });
    }
  }
}
function createAuthorization(user, body) {
  const to = vRawHandle(body.to_handle);
  const amount = vAmount(body.amount);
  const note = vNote(body.note);
  const visibility = vVisibility(body.visibility);
  if (to.id === user.id) throw fail(422, "self_payment", "cannot authorize to yourself");
  if (user.total - user.held < amount) throw fail(409, "insufficient_funds", "insufficient available funds");
  const t = nowMs();
  const a = {
    id: nextId("a", "auth"), from_id: user.id, to_id: to.id, amount,
    captured_amount: 0, note, visibility, status: "open",
    expires_at: t + S.authTtl * 1000, created_at: iso(t), created_ms: t,
    closed_at: null, payment_id: null, payment_ids: [],
    hold_timeline: [{ t, hold: amount }],
  };
  S.auths[a.id] = a; S.authSeq.push(a.id);
  user.held += amount;
  return { status: 201, body: authView(a, t) };
}
function listAuthorizations(user, q) {
  const direction = vEnum(q.direction, ["outgoing", "incoming"], null);
  const status = vEnum(q.status, ["open", "captured", "voided", "expired"], null);
  const limit = vLimit(q.limit, 50), offset = vOffset(q.offset);
  const t = nowMs();
  let ids = S.authSeq.filter(id => {
    const a = S.auths[id];
    if (direction === "outgoing" && a.from_id !== user.id) return false;
    if (direction === "incoming" && a.to_id !== user.id) return false;
    if (!direction && a.from_id !== user.id && a.to_id !== user.id) return false;
    if (status && authStatus(a, t) !== status) return false;
    return true;
  });
  ids.sort((a, b) => S.auths[b].created_ms - S.auths[a].created_ms);
  const page = ids.slice(offset, offset + limit);
  return { status: 200, body: { authorizations: page.map(id => authView(S.auths[id], t)), has_more: offset + limit < ids.length } };
}
function captureAuthorization(user, id, body) {
  const a = S.auths[id];
  if (!a) throw fail(404, "not_found", "unknown authorization");
  if (a.to_id !== user.id) throw fail(403, "forbidden", "only the receiver may capture");
  const t = nowMs();
  const st = authStatus(a, t);
  if (st === "expired") throw fail(409, "authorization_expired", "authorization expired");
  if (st !== "open") throw fail(409, "authorization_not_open", "authorization is not open");
  const remaining = a.amount - a.captured_amount;
  let amount = remaining, final = true;
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isInteger(body.amount) || body.amount < 1)
      throw fail(422, "validation_failed", "capture amount must be a positive integer");
    if (body.amount > remaining) throw fail(422, "capture_exceeds_authorization", "capture exceeds remainder");
    amount = body.amount;
  }
  if (body.final !== undefined) {
    if (typeof body.final !== "boolean") throw fail(400, "malformed_request", "final must be boolean");
    final = body.final;
  }
  const payer = S.users[a.from_id];
  payer.total -= amount; payer.held -= amount;
  user.total += amount;
  const p = newPayment({
    from_id: a.from_id, to_id: a.to_id, amount, note: a.note,
    visibility: a.visibility, authorization_id: a.id, created_at: t,
  });
  a.captured_amount += amount;
  a.payment_id = p.id; a.payment_ids.push(p.id);
  const left = a.amount - a.captured_amount;
  if (final || left === 0) {
    payer.held -= left;
    a.status = "captured"; a.closed_at = t;
    a.hold_timeline.push({ t, hold: 0 });
  } else {
    a.hold_timeline.push({ t, hold: left });
  }
  return { status: 201, body: paymentView(p) };
}
function voidAuthorization(user, id) {
  const a = S.auths[id];
  if (!a) throw fail(404, "not_found", "unknown authorization");
  if (a.from_id !== user.id) throw fail(403, "forbidden", "only the payer may void");
  const t = nowMs();
  const st = authStatus(a, t);
  if (st === "voided") return { status: 200, body: authView(a, t) };
  if (st !== "open") throw fail(409, "authorization_not_open", "authorization is not open");
  const rem = a.amount - a.captured_amount;
  S.users[a.from_id].held -= rem;
  a.status = "voided"; a.closed_at = t;
  a.hold_timeline.push({ t, hold: 0 });
  return { status: 200, body: authView(a, t) };
}

// ------------------------------------------------------- history (stage 3)
function selectRevision(p, knownMs) {
  let sel = null;
  for (const r of p.revisions) {
    if (knownMs !== null && knownMs !== undefined && r.recorded_at > knownMs) break;
    sel = r;
  }
  return sel;
}
function signedAmount(uid, p, amount) {
  if (p.from_id === uid) return -amount;
  if (p.to_id === uid) return amount;
  return 0;
}
function balanceAt(uid, asOfMs, knownMs) {
  const u = S.users[uid];
  let bal = u.opening;
  for (const id of S.paymentSeq) {
    const p = S.payments[id];
    if (p.from_id !== uid && p.to_id !== uid) continue;
    const r = selectRevision(p, knownMs);
    if (!r || r.effective_at > asOfMs) continue;
    bal += signedAmount(uid, p, r.amount);
  }
  return bal;
}
function heldAt(uid, asOfMs, knownMs) {
  let held = 0;
  for (const id of S.authSeq) {
    const a = S.auths[id];
    if (a.from_id !== uid) continue;
    const known = knownMs === null || knownMs === undefined ? Infinity : knownMs;
    if (a.created_ms > known) continue; // creation not yet known
    const evs = [{ t: a.created_ms, hold: a.amount }];
    let closed = false;
    for (const e of a.hold_timeline.slice(1)) {
      if (e.t > known) continue; // event not yet known
      evs.push(e);
      if (e.hold === 0) closed = true;
    }
    // The expiry deadline is known once creation is known.
    if (!closed) evs.push({ t: a.expires_at, hold: 0 });
    evs.sort((x, y) => x.t - y.t);
    let value = 0;
    for (const e of evs) { if (e.t <= asOfMs) value = e.hold; else break; }
    held += value;
  }
  return held;
}
function boundariesFor(uid) {
  const set = new Set();
  for (const id of S.paymentSeq) {
    const p = S.payments[id];
    if (p.from_id !== uid && p.to_id !== uid) continue;
    for (const r of p.revisions) set.add(r.effective_at);
  }
  for (const id of S.authSeq) {
    const a = S.auths[id];
    if (a.from_id !== uid) continue;
    for (const e of a.hold_timeline) set.add(e.t);
  }
  return [...set].sort((x, y) => x - y);
}
function historicalCheck(uids) {
  for (const uid of uids) {
    for (const b of boundariesFor(uid)) {
      if (balanceAt(uid, b, null) < 0 || balanceAt(uid, b, null) - heldAt(uid, b, null) < 0)
        throw fail(409, "historical_overdraft", "correction would overdraw history");
    }
  }
}
function newRecordedAt(p) {
  const t = nowMs();
  p.lastRecorded = Math.max(t, p.lastRecorded + 1);
  return p.lastRecorded;
}
function refundedTotal(p) {
  return p.refund_ids.reduce((s, id) => s + S.payments[id].revisions.at(-1).amount, 0);
}
function validateCorrectionFields(body) {
  const { expected_revision, amount, effective_at, reason } = body;
  if (expected_revision === undefined || amount === undefined || effective_at === undefined || reason === undefined)
    throw fail(422, "validation_failed", "expected_revision, amount, effective_at and reason are required");
  if (typeof expected_revision !== "number" || !Number.isInteger(expected_revision) || expected_revision < 1)
    throw fail(422, "validation_failed", "expected_revision must be a positive integer");
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT)
    throw fail(422, "validation_failed", "amount must be an integer 0..1000000000");
  const eff = parseInstant(effective_at);
  if (eff === null) throw fail(422, "validation_failed", "effective_at must be an RFC 3339 instant");
  if (eff > nowMs()) throw fail(422, "validation_failed", "effective_at cannot be in the future");
  if (typeof reason !== "string" || [...reason].length < 1 || [...reason].length > 200)
    throw fail(422, "validation_failed", "reason must be 1..200 characters");
  return { expected_revision, amount, eff };
}
function linkedBlock(p) {
  if (p.authorization_id) throw fail(422, "linked_payment_immutable", "capture payments are immutable");
  if (p.refund_of) throw fail(422, "linked_payment_immutable", "refund payments are immutable");
}
function applyCorrection(p, amount, eff, reason, batchId, recordedAt) {
  const from = S.users[p.from_id], to = S.users[p.to_id];
  const old = p.revisions[p.revisions.length - 1].amount;
  const delta = amount - old;
  if (delta > 0) {
    if (from.total - from.held < delta) throw fail(409, "insufficient_funds", "correction debit unaffordable");
    from.total -= delta; to.total += delta;
  } else if (delta < 0) {
    if (to.total - to.held < -delta) throw fail(409, "insufficient_funds", "correction debit unaffordable");
    to.total += delta; from.total -= delta;
  }
  const rev = {
    revision: p.revisions.length + 1, amount, effective_at: eff,
    recorded_at: recordedAt !== undefined ? recordedAt : newRecordedAt(p),
    reason, batch_id: batchId || null,
  };
  p.revisions.push(rev);
  p.lastRecorded = Math.max(p.lastRecorded, rev.recorded_at);
  return rev;
}
function rollbackCorrections(applied) {
  for (const { p, rev, delta } of applied.reverse()) {
    p.revisions.pop();
    const from = S.users[p.from_id], to = S.users[p.to_id];
    from.total += delta; to.total -= delta;
  }
}
function createCorrection(user, pid, body) {
  const p = S.payments[pid];
  if (!p) throw fail(404, "not_found", "unknown payment");
  if (p.from_id !== user.id) throw fail(403, "forbidden", "only the sender may correct");
  const f = validateCorrectionFields(body);
  linkedBlock(p);
  if (p.settlement_id) throw fail(422, "linked_payment_immutable", "settlement members need a batch");
  if (f.expected_revision !== p.revisions.length)
    throw fail(409, "stale_revision", "expected_revision is stale");
  if (f.amount < refundedTotal(p))
    throw fail(422, "refund_exceeds_payment", "correction would undercut refunds");
  const applied = [];
  const old = p.revisions[p.revisions.length - 1].amount;
  try {
    const rev = applyCorrection(p, f.amount, f.eff, body.reason, null);
    applied.push({ p, rev, delta: f.amount - old });
    historicalCheck([p.from_id, p.to_id]);
  } catch (e) { rollbackCorrections(applied); throw e; }
  const rev = p.revisions[p.revisions.length - 1];
  return {
    status: 201,
    body: {
      payment_id: p.id, revision: rev.revision, amount: rev.amount,
      effective_at: iso(rev.effective_at), recorded_at: iso(rev.recorded_at), reason: rev.reason,
    },
  };
}
function getRevisions(user, pid) {
  const p = S.payments[pid];
  if (!p || (p.from_id !== user.id && p.to_id !== user.id))
    throw fail(404, "not_found", "unknown payment");
  return {
    status: 200,
    body: {
      revisions: p.revisions.map(r => ({
        payment_id: p.id, revision: r.revision, amount: r.amount,
        effective_at: iso(r.effective_at), recorded_at: iso(r.recorded_at),
        reason: r.reason, correction_batch_id: r.batch_id,
      })),
    },
  };
}
function computeStatement(user, q) {
  const fromMs = q.from !== undefined ? vInstant(q.from, "from") : null;
  const toMs = q.to !== undefined ? vInstant(q.to, "to") : nowMs();
  const knownRaw = q.known_at !== undefined ? q.known_at : null;
  const knownMs = knownRaw !== null ? vInstant(knownRaw, "known_at") : null;
  if (knownMs !== null && knownMs > nowMs())
    throw fail(422, "validation_failed", "known_at cannot be in the future");
  const limit = vLimit(q.limit, 50), offset = vOffset(q.offset);
  const entries = [];
  for (const id of S.paymentSeq) {
    const p = S.payments[id];
    if (p.from_id !== user.id && p.to_id !== user.id) continue;
    const r = selectRevision(p, knownMs);
    if (!r) continue;
    const eff = r.effective_at;
    const inWin = (fromMs === null || eff >= fromMs) && eff < toMs;
    const beforeFrom = fromMs !== null && eff < fromMs;
    const beforeTo = eff < toMs;
    entries.push({ p, r, eff, delta: signedAmount(user.id, p, r.amount), inWin, beforeFrom, beforeTo });
  }
  entries.sort((a, b) => a.eff - b.eff || (a.p.id < b.p.id ? -1 : 1));
  let opening_balance = S.users[user.id].opening;
  let closing_balance = S.users[user.id].opening;
  const win = [];
  for (const e of entries) {
    if (e.beforeFrom) opening_balance += e.delta;
    if (e.beforeTo) closing_balance += e.delta;
    if (e.inWin) win.push(e);
  }
  let running = opening_balance;
  const full = win.map(e => {
    running += e.delta;
    return {
      payment: paymentView(e.p, e.r.amount), delta: e.delta, balance_after: running,
      revision: e.r.revision, effective_at: iso(e.eff), recorded_at: iso(e.r.recorded_at),
    };
  });
  const page = full.slice(offset, offset + limit);
  return {
    full, opening_balance, closing_balance,
    body: {
      entries: page, opening_balance, closing_balance,
      has_more: offset + limit < full.length,
    },
    window: { fromMs, toMs, knownMs, knownRaw },
  };
}
function getStatement(user, q) {
  if (q.snapshot !== undefined) {
    if (q.from !== undefined || q.to !== undefined || q.known_at !== undefined)
      throw fail(422, "validation_failed", "only limit and offset may accompany a snapshot");
    const snap = S.snapshots[q.snapshot];
    if (!snap || snap.user_id !== user.id) throw fail(404, "not_found", "unknown snapshot");
    const limit = vLimit(q.limit, 50), offset = vOffset(q.offset);
    const page = snap.entries.slice(offset, offset + limit);
    return {
      status: 200,
      body: {
        entries: page, opening_balance: snap.opening_balance,
        closing_balance: snap.closing_balance, has_more: offset + limit < snap.entries.length,
      },
    };
  }
  const st = computeStatement(user, q);
  const token = `snap_${pad(++S.seq.snapshot)}${crypto.randomBytes(6).toString("hex")}`;
  S.snapshots[token] = {
    user_id: user.id, entries: st.full,
    opening_balance: st.opening_balance, closing_balance: st.closing_balance,
  };
  st.body.snapshot = token;
  if (st.window.knownRaw !== null) st.body.known_at = st.window.knownRaw;
  return { status: 200, body: st.body };
}
function meAsOf(user, q) {
  const asOfRaw = q.as_of, knownRaw = q.known_at !== undefined ? q.known_at : null;
  if (asOfRaw === undefined && knownRaw === null) return { status: 200, body: meView(user) };
  if (asOfRaw === undefined) throw fail(422, "validation_failed", "known_at needs as_of");
  const asOf = vInstant(asOfRaw, "as_of");
  const knownMs = knownRaw !== null ? vInstant(knownRaw, "known_at") : null;
  if (knownMs !== null && knownMs > nowMs())
    throw fail(422, "validation_failed", "known_at cannot be in the future");
  const total = balanceAt(user.id, asOf, knownMs);
  const held = heldAt(user.id, asOf, knownMs);
  const body = {
    user_id: user.id, display_name: user.display_name, handle: user.handle, email: user.email,
    balance: total, total, available: total - held, held,
    currency: S.currency, as_of: asOfRaw,
  };
  if (knownRaw !== null) body.known_at = knownRaw;
  return { status: 200, body };
}

// ------------------------------------------------------- refunds (stage 4)
function createRefund(user, pid, body) {
  const p = S.payments[pid];
  if (!p) throw fail(404, "not_found", "unknown payment");
  if (p.to_id !== user.id) throw fail(403, "forbidden", "only the receiver may refund");
  if (p.refund_of) throw fail(422, "invalid_refund_target", "cannot refund a refund");
  const amount = vAmount(body.amount);
  const current = p.revisions[p.revisions.length - 1].amount;
  if (refundedTotal(p) + amount > current)
    throw fail(422, "refund_exceeds_payment", "refunds exceed the payment amount");
  if (user.total - user.held < amount) throw fail(409, "insufficient_funds", "insufficient available funds");
  user.total -= amount; S.users[p.from_id].total += amount;
  const r = newPayment({
    from_id: user.id, to_id: p.from_id, amount, note: p.note,
    visibility: p.visibility, refund_of: p.id,
  });
  p.refund_ids.push(r.id);
  return { status: 201, body: paymentView(r) };
}
function createBatch(user, body) {
  if (!S.operators.includes(user.id)) throw fail(403, "forbidden", "settlement operator required");
  const items = body.corrections;
  if (!Array.isArray(items) || items.length < 1 || items.length > 32)
    throw fail(422, "validation_failed", "corrections must contain 1..32 objects");
  const seen = new Set();
  const parsed = items.map(e => {
    if (!e || typeof e !== "object" || Array.isArray(e))
      throw fail(422, "validation_failed", "each correction must be an object");
    if (typeof e.payment_id !== "string" || !e.payment_id)
      throw fail(422, "validation_failed", "payment_id is required");
    if (seen.has(e.payment_id)) throw fail(422, "validation_failed", "duplicate payment_id");
    seen.add(e.payment_id);
    const p = S.payments[e.payment_id];
    if (!p) throw fail(404, "not_found", "unknown payment");
    const f = validateCorrectionFields(e);
    linkedBlock(p);
    if (f.expected_revision !== p.revisions.length)
      throw fail(409, "stale_revision", "expected_revision is stale");
    if (f.amount < refundedTotal(p))
      throw fail(422, "refund_exceeds_payment", "correction would undercut refunds");
    return { p, f, reason: e.reason, old: p.revisions[p.revisions.length - 1].amount };
  });
  // identical effective instants within a settlement
  const bySettlement = new Map();
  for (const it of parsed) {
    if (it.p.settlement_id) {
      if (!bySettlement.has(it.p.settlement_id)) bySettlement.set(it.p.settlement_id, []);
      bySettlement.get(it.p.settlement_id).push(it);
    }
  }
  for (const [, group] of bySettlement) {
    const t0 = group[0].f.eff;
    if (!group.every(g => g.f.eff === t0))
      throw fail(422, "validation_failed", "settlement members need identical effective instants");
  }
  // completeness: every member of a touched settlement must be included
  for (const [sid, group] of bySettlement) {
    const members = S.settlements[sid].payment_ids;
    const inBatch = new Set(group.map(g => g.p.id));
    if (!members.every(id => inBatch.has(id)))
      throw fail(422, "incomplete_settlement", "batch must include every settlement member");
  }
  // current available funds, combined effect
  const net = {};
  for (const it of parsed) {
    const d = it.f.amount - it.old;
    net[it.p.from_id] = (net[it.p.from_id] || 0) - d;
    net[it.p.to_id] = (net[it.p.to_id] || 0) + d;
  }
  for (const [uid, d] of Object.entries(net)) {
    const u = S.users[uid];
    if (d < 0 && u.total - u.held < -d)
      throw fail(409, "insufficient_funds", "batch is not affordable");
  }
  const applied = [];
  const batchId = nextId("cb", "batch");
  const recordedAt = Math.max(nowMs(), ...parsed.map(it => it.p.lastRecorded + 1));
  try {
    for (const it of parsed) {
      const rev = applyCorrection(it.p, it.f.amount, it.f.eff, it.reason, batchId, recordedAt);
      applied.push({ p: it.p, rev, delta: it.f.amount - it.old });
    }
    historicalCheck([...new Set(parsed.flatMap(it => [it.p.from_id, it.p.to_id]))]);
  } catch (e) { rollbackCorrections(applied); throw e; }
  S.batches[batchId] = { id: batchId, recorded_at: recordedAt, payment_ids: parsed.map(it => it.p.id) };
  return {
    status: 201,
    body: {
      correction_batch_id: batchId, recorded_at: iso(recordedAt),
      revisions: parsed.map(it => {
        const r = it.p.revisions[it.p.revisions.length - 1];
        return {
          payment_id: it.p.id, revision: r.revision, amount: r.amount,
          effective_at: iso(r.effective_at), recorded_at: iso(r.recorded_at),
          reason: r.reason, correction_batch_id: batchId,
        };
      }),
    },
  };
}

// ------------------------------------------------------- export/import ----
function exportState() {
  return {
    track: "pocketful", format_version: 1,
    state: {
      currency: S.currency, minor_units: S.minor_units, authorization_ttl_seconds: S.authTtl,
      users: Object.values(S.users).map(u => ({
        id: u.id, email: u.email, password_hash: u.password_hash, display_name: u.display_name,
        handle: u.handle, total: u.total, held: u.held, opening: u.opening,
      })),
      tokens: Object.entries(S.tokens).map(([token, user_id]) => ({ token, user_id })),
      operators: [...S.operators],
      payments: S.paymentSeq.map(id => S.payments[id]),
      paymentSeq: [...S.paymentSeq],
      requests: S.requestSeq.map(id => S.requests[id]),
      requestSeq: [...S.requestSeq],
      splits: Object.values(S.splits),
      authorizations: S.authSeq.map(id => S.auths[id]),
      authSeq: [...S.authSeq],
      settlements: Object.values(S.settlements),
      batches: Object.values(S.batches),
      snapshots: Object.entries(S.snapshots).map(([token, s]) => ({ token, ...s })),
      idem: Object.entries(S.idem).map(([scope, r]) => ({ scope, canon: r.canon, body: r.body })),
      seq: { ...S.seq },
    },
  };
}
function importState(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw fail(422, "validation_failed", "bad import");
  if (doc.track !== "pocketful" || doc.format_version !== 1) throw fail(422, "validation_failed", "bad track/version");
  const st = doc.state;
  if (!st || typeof st !== "object") throw fail(422, "validation_failed", "bad state");
  const ns = freshState();
  ns.currency = st.currency; ns.minor_units = st.minor_units; ns.authTtl = st.authorization_ttl_seconds;
  if (typeof ns.currency !== "string" || !Number.isInteger(ns.minor_units)) throw fail(422, "validation_failed", "bad state");
  for (const u of st.users || []) {
    if (!u.id || !u.email || !u.handle) throw fail(422, "validation_failed", "bad user");
    ns.users[u.id] = { ...u }; ns.handles[u.handle] = u.id; ns.emails[u.email] = u.id;
  }
  for (const t of st.tokens || []) ns.tokens[t.token] = t.user_id;
  ns.operators = st.operators || [];
  for (const p of st.payments || []) { ns.payments[p.id] = p; }
  ns.paymentSeq = st.paymentSeq || (st.payments || []).map(p => p.id);
  for (const r of st.requests || []) ns.requests[r.id] = r;
  ns.requestSeq = st.requestSeq || (st.requests || []).map(r => r.id);
  for (const sp of st.splits || []) ns.splits[sp.id] = sp;
  for (const a of st.authorizations || []) ns.auths[a.id] = a;
  ns.authSeq = st.authSeq || (st.authorizations || []).map(a => a.id);
  for (const s of st.settlements || []) ns.settlements[s.id] = s;
  for (const b of st.batches || []) ns.batches[b.id] = b;
  for (const s of st.snapshots || []) ns.snapshots[s.token] = { user_id: s.user_id, entries: s.entries, opening_balance: s.opening_balance, closing_balance: s.closing_balance };
  for (const r of st.idem || []) ns.idem[r.scope] = { canon: r.canon, body: r.body };
  Object.assign(ns.seq, st.seq || {});
  S = ns;
}

// ------------------------------------------------------- reset ------------
function applyFixture(fx) {
  if (!fx || typeof fx !== "object" || Array.isArray(fx))
    throw fail(422, "validation_failed", "fixture must be an object");
  const ns = freshState();
  const keep = S; S = ns;
  try {
    if (typeof fx.currency !== "string" || !fx.currency) throw fail(422, "validation_failed", "currency required");
    ns.currency = fx.currency;
    ns.minor_units = fx.minor_units === undefined ? defaultMinorUnits(ns.currency) : fx.minor_units;
    if (!Number.isInteger(ns.minor_units) || ns.minor_units < 0 || ns.minor_units > 9)
      throw fail(422, "validation_failed", "minor_units must be an integer 0..9");
    if (fx.authorization_ttl_seconds !== undefined) {
      if (!Number.isInteger(fx.authorization_ttl_seconds) || fx.authorization_ttl_seconds < 1)
        throw fail(422, "validation_failed", "authorization_ttl_seconds must be a positive integer");
      ns.authTtl = fx.authorization_ttl_seconds;
    }
    const t = nowMs();
    const users = fx.users;
    if (!Array.isArray(users) || users.length === 0) throw fail(422, "validation_failed", "users required");
    for (const fu of users) {
      const id = fu.user_id || fu.id;
      if (!id || typeof id !== "string") throw fail(422, "validation_failed", "user id required");
      if (ns.users[id]) throw fail(422, "validation_failed", "duplicate user id");
      if (typeof fu.email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(fu.email))
        throw fail(422, "validation_failed", "bad email");
      if (ns.emails[fu.email] !== undefined) throw fail(422, "validation_failed", "duplicate email");
      const handle = fu.handle || deriveHandle(fu.email);
      if (ns.handles[handle] !== undefined) throw fail(422, "validation_failed", "duplicate handle");
      if (!Number.isInteger(fu.balance) || fu.balance < 0)
        throw fail(422, "validation_failed", "negative seeded balance");
      ns.users[id] = {
        id, email: fu.email, password_hash: hashPassword(String(fu.password ?? "")),
        display_name: fu.display_name || handle, handle, total: fu.balance, held: 0, opening: 0,
      };
      ns.handles[handle] = id; ns.emails[fu.email] = id;
    }
    const byHandle = h => {
      const id = ns.handles[h];
      if (id === undefined) throw fail(422, "validation_failed", "unknown seeded handle");
      return ns.users[id];
    };
    const byId = id => {
      if (!ns.users[id]) throw fail(422, "validation_failed", "unknown seeded user id");
      return ns.users[id];
    };
    // seeded payments (balances already reflect them; do not replay)
    for (const sp of fx.payments || []) {
      const from = sp.from_user_id !== undefined ? byId(sp.from_user_id) : byHandle(sp.from_handle);
      const to = sp.to_user_id !== undefined ? byId(sp.to_user_id) : byHandle(sp.to_handle);
      if (!Number.isInteger(sp.amount) || sp.amount < 1 || sp.amount > MAX_AMOUNT)
        throw fail(422, "validation_failed", "bad seeded payment amount");
      const ct = sp.created_at === undefined ? t : parseInstant(sp.created_at);
      if (ct === null || ct > nowMs()) throw fail(422, "validation_failed", "bad seeded created_at");
      const p = {
        id: sp.id || sp.payment_id || nextId("p", "payment"), from_id: from.id, to_id: to.id,
        note: sp.note || "", visibility: sp.visibility === "private" ? "private" : "public",
        request_id: sp.request_id || null, authorization_id: null, settlement_id: null,
        refund_of: null, created_at: iso(ct), created_ms: ct,
        revisions: [{ revision: 1, amount: sp.amount, effective_at: ct, recorded_at: ct, reason: "", batch_id: null }],
        lastRecorded: ct, refund_ids: [],
      };
      if (ns.payments[p.id]) throw fail(422, "validation_failed", "duplicate seeded payment id");
      ns.payments[p.id] = p; ns.paymentSeq.push(p.id);
    }
    // openings = seeded balance minus net effect of original seeded payments
    for (const u of Object.values(ns.users)) {
      let net = 0;
      for (const id of ns.paymentSeq) {
        const p = ns.payments[id];
        net += signedAmount(u.id, p, p.revisions[0].amount);
      }
      u.opening = u.total - net;
    }
    // seeded requests
    for (const sr of fx.requests || []) {
      const rq = sr.requester_id !== undefined ? byId(sr.requester_id) : byHandle(sr.requester_handle);
      const py = sr.payer_id !== undefined ? byId(sr.payer_id) : byHandle(sr.payer_handle);
      if (!["pending", "paid", "declined", "cancelled"].includes(sr.status))
        throw fail(422, "validation_failed", "bad seeded request status");
      const ct = sr.created_at === undefined ? t : parseInstant(sr.created_at);
      if (ct === null) throw fail(422, "validation_failed", "bad seeded request created_at");
      const r = {
        id: sr.id || sr.request_id || nextId("r", "request"), requester_id: rq.id, payer_id: py.id,
        amount: sr.amount, note: sr.note || "", status: sr.status,
        payment_id: sr.payment_id || null,
        created_at: iso(ct), created_ms: ct,
      };
      ns.requests[r.id] = r; ns.requestSeq.push(r.id);
    }
    // seeded authorizations
    for (const sa of fx.authorizations || []) {
      const from = byId(sa.from_user_id), to = byId(sa.to_user_id);
      if (!Number.isInteger(sa.amount) || sa.amount < 1 || sa.amount > MAX_AMOUNT)
        throw fail(422, "validation_failed", "bad seeded authorization amount");
      if (!["open", "captured", "voided", "expired"].includes(sa.status))
        throw fail(422, "validation_failed", "bad seeded authorization status");
      const exp = parseInstant(sa.expires_at);
      if (exp === null) throw fail(422, "validation_failed", "bad seeded expires_at");
      const ct = sa.created_at === undefined ? t : parseInstant(sa.created_at);
      if (ct === null) throw fail(422, "validation_failed", "bad seeded auth created_at");
      const id = sa.authorization_id || sa.id || nextId("a", "auth");
      const a = {
        id, from_id: from.id, to_id: to.id, amount: sa.amount, captured_amount: 0,
        note: sa.note || "", visibility: sa.visibility === "private" ? "private" : "public",
        status: sa.status, expires_at: exp, created_at: iso(ct), created_ms: ct,
        closed_at: null, payment_id: null, payment_ids: [],
        hold_timeline: [{ t: ct, hold: sa.status === "open" ? sa.amount : 0 }],
      };
      if (sa.status === "open") {
        if (exp <= t) { a.status = "expired"; a.closed_at = exp; a.hold_timeline.push({ t: exp, hold: 0 }); }
        else from.held += sa.amount;
      }
      ns.auths[id] = a; ns.authSeq.push(id);
    }
    for (const u of Object.values(ns.users)) {
      if (u.held > u.total) throw fail(422, "validation_failed", "seeded holds exceed balance");
    }
    const ops = fx.settlement_operator_ids === undefined ? [] : fx.settlement_operator_ids;
    if (!Array.isArray(ops)) throw fail(422, "validation_failed", "settlement_operator_ids must be an array");
    for (const id of ops) byId(id);
    ns.operators = [...ops];
  } catch (e) { S = keep; throw e; }
}

module.exports = {
  STAGE, atomic, expireSweep, nowMs,
  getState: () => S,
  bearer, signup, login,
  createPayment, createRequest, payRequest, declineRequest, cancelRequest,
  listRequests, createSplit, activity,
  createSettlement,
  createAuthorization, listAuthorizations, captureAuthorization, voidAuthorization,
  createCorrection, getRevisions, getStatement, meAsOf,
  createRefund, createBatch,
  exportState, importState, applyFixture,
  idemCheck, idemClaim, idemKey,
  fail, authStatus,
};
