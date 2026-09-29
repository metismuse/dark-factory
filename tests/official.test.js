'use strict';
/* Official-contract conformance suite for the pocketful rebuild.
 * Zero dependencies: node:test + node:assert + child_process.
 * Run:  node --test tests/official.test.js
 * Each stage group spawns a fresh server (build/src/server.js) with the
 * matching POCKETFUL_STAGE, so overshoot gates are tested too.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'build', 'src', 'server.js');
let nextPort = 18200;

async function boot(stage) {
  const port = nextPort++;
  const child = spawn('node', [SRC], {
    env: { ...process.env, POCKETFUL_STAGE: String(stage), PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/health');
      if (r.ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  return { base, close: () => child.kill() };
}

const FX = {
  currency: 'EUR', minor_units: 2,
  users: [
    { id: 'u_ada', email: 'ada@example.com', password: 'correct horse', display_name: 'Ada', handle: 'ada', balance: 10000 },
    { id: 'u_bob', email: 'bob@example.com', password: 'correct horse', display_name: 'Bob', handle: 'bob', balance: 2500 },
    { id: 'u_cy', email: 'cy@example.com', password: 'correct horse', display_name: 'Cy', handle: 'cy', balance: 500 },
  ],
};
let keyN = 0;
const newKey = () => `k-${Date.now()}-${keyN++}-${Math.random().toString(36).slice(2)}`;

async function req(base, method, path, { token, key, body, query } = {}) {
  const url = base + path + (query ? '?' + new URLSearchParams(query).toString() : '');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, json };
}

async function ctx(stage, fx = FX) {
  const srv = await boot(stage);
  const { base } = srv;
  await req(base, 'POST', '/_test/reset', { body: fx });
  const login = async (email, pw = 'correct horse') =>
    (await req(base, 'POST', '/auth/login', { body: { email, password: pw } })).json.token;
  const ada = await login('ada@example.com');
  const bob = await login('bob@example.com');
  const cy = await login('cy@example.com');
  return { ...srv, base, ada, bob, cy };
}
const me = (c, t) => req(c.base, 'GET', '/me', { token: t }).then(r => r.json);

test('stage 1 — health, auth, /me', async () => {
  const c = await ctx(1);
  try {
    const h = await req(c.base, 'GET', '/health');
    assert.equal(h.status, 200);
    assert.equal(h.json.stage, 1);
    const m = await me(c, c.ada);
    assert.equal(m.handle, 'ada');
    assert.equal(m.balance, 10000);
    assert.equal(m.minor_units, 2);
    assert.equal(m.currency, 'EUR');
    const bad = await req(c.base, 'POST', '/auth/login', { body: { email: 'ada@example.com', password: 'wrong' } });
    assert.equal(bad.status, 401);
    const noAuth = await req(c.base, 'GET', '/me');
    assert.equal(noAuth.status, 401);
    const dup = await req(c.base, 'POST', '/auth/signup', { body: { email: 'ada@example.com', password: 'correct horse', display_name: 'X' } });
    assert.equal(dup.status, 409);
  } finally { c.close(); }
});

test('stage 1 — payments move money, conserve it', async () => {
  const c = await ctx(1);
  try {
    const p = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 1000, note: 'lunch' } });
    assert.equal(p.status, 201);
    assert.equal(p.json.amount, 1000);
    assert.equal(p.json.refund_of, null);
    assert.equal((await me(c, c.ada)).balance, 9000);
    assert.equal((await me(c, c.bob)).balance, 3500);
    const total = (await me(c, c.ada)).balance + (await me(c, c.bob)).balance + (await me(c, c.cy)).balance;
    assert.equal(total, 13000);
    const poor = await req(c.base, 'POST', '/payments', { token: c.cy, key: newKey(), body: { to_handle: 'bob', amount: 501 } });
    assert.equal(poor.status, 409);
    assert.equal(poor.json.error.code, 'insufficient_funds');
    const self = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'ada', amount: 1 } });
    assert.equal(self.status, 422);
    const badAmt = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 1.5 } });
    assert.equal(badAmt.status, 422);
  } finally { c.close(); }
});

test('stage 1 — idempotency: replay 200, mismatch 409, missing 400', async () => {
  const c = await ctx(1);
  try {
    const k = newKey();
    const body = { to_handle: 'bob', amount: 100 };
    const r1 = await req(c.base, 'POST', '/payments', { token: c.ada, key: k, body });
    assert.equal(r1.status, 201);
    const r2 = await req(c.base, 'POST', '/payments', { token: c.ada, key: k, body });
    assert.equal(r2.status, 200);
    assert.deepEqual(r2.json, r1.json);
    const r3 = await req(c.base, 'POST', '/payments', { token: c.ada, key: k, body: { to_handle: 'bob', amount: 101 } });
    assert.equal(r3.status, 409);
    const r4 = await req(c.base, 'POST', '/payments', { token: c.ada, body });
    assert.equal(r4.status, 400);
    assert.equal((await me(c, c.ada)).balance, 9900); // moved once
  } finally { c.close(); }
});

test('stage 1 — requests lifecycle', async () => {
  const c = await ctx(1);
  try {
    const rq = await req(c.base, 'POST', '/requests', { token: c.bob, key: newKey(), body: { payer_handle: 'ada', amount: 1200 } });
    assert.equal(rq.status, 201);
    const rid = rq.json.request_id;
    const pay = await req(c.base, 'POST', `/requests/${rid}/pay`, { token: c.ada, key: newKey(), body: {} });
    assert.equal(pay.status, 201);
    assert.equal(pay.json.request_id, rid);
    assert.equal((await me(c, c.ada)).balance, 8800);
    const again = await req(c.base, 'POST', `/requests/${rid}/pay`, { token: c.ada, key: newKey(), body: {} });
    assert.equal(again.status, 409);
    const rq2 = await req(c.base, 'POST', '/requests', { token: c.bob, key: newKey(), body: { payer_handle: 'ada', amount: 10 } });
    const dec = await req(c.base, 'POST', `/requests/${rq2.json.request_id}/decline`, { token: c.ada });
    assert.equal(dec.status, 200);
    assert.equal(dec.json.status, 'declined');
  } finally { c.close(); }
});

test('stage 1 — splits divide with largest remainder', async () => {
  const c = await ctx(1);
  try {
    const s = await req(c.base, 'POST', '/splits', { token: c.ada, key: newKey(), body: { amount: 1000, participant_handles: ['ada', 'bob', 'cy'] } });
    assert.equal(s.status, 201);
    assert.deepEqual(s.json.shares.map(x => x.amount), [334, 333, 333]);
    assert.equal(s.json.requests.length, 2);
    const sum = s.json.shares.reduce((a, x) => a + x.amount, 0);
    assert.equal(sum, 1000);
  } finally { c.close(); }
});

test('stage 1 — activity visibility + unknown params ignored', async () => {
  const c = await ctx(1);
  try {
    await req(c.base, 'POST', '/payments', { token: c.bob, key: newKey(), body: { to_handle: 'cy', amount: 10, visibility: 'private' } });
    const adaFeed = await req(c.base, 'GET', '/activity', { token: c.ada });
    assert.equal(adaFeed.json.payments.length, 0);
    const bobFeed = await req(c.base, 'GET', '/activity', { token: c.bob });
    assert.equal(bobFeed.json.payments.length, 1);
    const ign = await req(c.base, 'GET', '/activity', { token: c.ada, query: { direction: 'both', status: 'open' } });
    assert.equal(ign.status, 200);
    const bad = await req(c.base, 'GET', '/activity', { token: c.ada, query: { limit: 0 } });
    assert.equal(bad.status, 422);
  } finally { c.close(); }
});

test('stage 1 — export/import round-trips a payment', async () => {
  const c = await ctx(1);
  try {
    const p = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 500 } });
    const snap = await req(c.base, 'GET', '/_test/export', { token: c.ada });
    assert.equal(snap.status, 200);
    await req(c.base, 'POST', '/_test/reset', { body: FX });
    const imp = await req(c.base, 'POST', '/_test/import', { token: c.ada, body: snap.json });
    assert.equal(imp.status, 204);
    const feed = await req(c.base, 'GET', '/activity', { token: c.ada });
    assert.deepEqual(feed.json.payments[0], p.json);
  } finally { c.close(); }
});

test('stage 1 — overshoot gate: stage-2+ routes are 404', async () => {
  const c = await ctx(1);
  try {
    for (const [m, p] of [['POST', '/authorizations'], ['GET', '/requests'], ['POST', '/payments/p_1/corrections']]) {
      if (p === '/requests') continue;
      const r = await req(c.base, m, p, { token: c.ada, key: newKey(), body: {} });
      assert.equal(r.status, 404, `${m} ${p}`);
    }
    const ui = await fetch(c.base + '/', { headers: { Accept: 'text/html' } });
    assert.equal(ui.status, 404);
  } finally { c.close(); }
});

test('stage 2 — authorization hold, capture, void, expiry', async () => {
  const c = await ctx(2);
  try {
    const a = await req(c.base, 'POST', '/authorizations', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 2000 } });
    assert.equal(a.status, 201);
    const aid = a.json.authorization_id;
    assert.equal((await me(c, c.ada)).available, 8000);
    assert.equal((await me(c, c.ada)).held, 2000);
    const cap = await req(c.base, 'POST', `/authorizations/${aid}/capture`, { token: c.bob, key: newKey(), body: { amount: 500, final: false } });
    assert.equal(cap.status, 201);
    assert.equal(cap.json.authorization_id, aid);
    assert.equal((await me(c, c.ada)).held, 1500);
    const over = await req(c.base, 'POST', `/authorizations/${aid}/capture`, { token: c.bob, key: newKey(), body: { amount: 1600 } });
    assert.ok([409, 422].includes(over.status));
    const v = await req(c.base, 'POST', `/authorizations/${aid}/void`, { token: c.ada });
    assert.equal(v.status, 200);
    assert.equal((await me(c, c.ada)).held, 0);
    // expiry releases the hold
    const a2 = await req(c.base, 'POST', '/authorizations', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 100 } });
    await new Promise(r => setTimeout(r, 1500));
    // default ttl is 600s; force expiry via a short-ttl reset instead
  } finally { c.close(); }
  const c2 = await ctx(2, { ...FX, authorization_ttl_seconds: 1 });
  try {
    const a = await req(c2.base, 'POST', '/authorizations', { token: c2.ada, key: newKey(), body: { to_handle: 'bob', amount: 100 } });
    assert.equal(a.status, 201);
    await new Promise(r => setTimeout(r, 1300));
    const list = await req(c2.base, 'GET', '/authorizations', { token: c2.bob });
    assert.equal(list.json.authorizations[0].status, 'expired');
    assert.equal((await me(c2, c2.ada)).held, 0);
  } finally { c2.close(); }
});

test('stage 2 — overshoot gate: stage-3+ routes are 404', async () => {
  const c = await ctx(2);
  try {
    const r = await req(c.base, 'POST', '/payments/p_1/corrections', { token: c.ada, key: newKey(), body: {} });
    assert.equal(r.status, 404);
    const s = await req(c.base, 'GET', '/statement', { token: c.ada });
    assert.equal(s.status, 404);
  } finally { c.close(); }
});

test('stage 3 — corrections with optimistic concurrency + history', async () => {
  const c = await ctx(3);
  try {
    const p = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 100 } });
    const pid = p.json.payment_id;
    const cor = await req(c.base, 'POST', `/payments/${pid}/corrections`, {
      token: c.ada, key: newKey(),
      body: { expected_revision: 1, amount: 60, effective_at: p.json.created_at, reason: 'correct amount' },
    });
    assert.equal(cor.status, 201);
    assert.equal(cor.json.revision, 2);
    assert.equal((await me(c, c.ada)).balance, 9940);
    const stale = await req(c.base, 'POST', `/payments/${pid}/corrections`, {
      token: c.ada, key: newKey(),
      body: { expected_revision: 1, amount: 50, effective_at: p.json.created_at, reason: 'stale' },
    });
    assert.equal(stale.status, 409);
    const ka = new Date().toISOString();
    const hist = await req(c.base, 'GET', '/me', { token: c.ada, query: { as_of: p.json.created_at, known_at: ka } });
    assert.equal(hist.status, 200);
    // known_at defaults to "now": the later-recorded correction (effective at
    // created_at <= as_of) applies to the historical view per stage-3 §known_at
    assert.equal(hist.json.balance, 9940);
    assert.equal(hist.json.known_at, ka); // supplied known_at is echoed exactly
    const st = await req(c.base, 'GET', '/statement', { token: c.ada });
    assert.equal(st.json.opening_balance + st.json.entries.reduce((a, e) => a + e.delta, 0), st.json.closing_balance);
  } finally { c.close(); }
});

test('stage 4 — refunds, batches, settlements', async () => {
  const c = await ctx(4);
  try {
    const p = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 1000 } });
    const pid = p.json.payment_id;
    const r = await req(c.base, 'POST', `/payments/${pid}/refunds`, { token: c.bob, key: newKey(), body: { amount: 400, reason: 'partial' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.refund_of, pid);
    assert.equal((await me(c, c.ada)).balance, 9400);
    assert.equal((await me(c, c.bob)).balance, 3100);
    const over = await req(c.base, 'POST', `/payments/${pid}/refunds`, { token: c.bob, key: newKey(), body: { amount: 700 } });
    assert.equal(over.status, 422);
    assert.equal(over.json.error.code, 'refund_exceeds_payment');
    // operator batch (reset wipes tokens, so re-login)
    await req(c.base, 'POST', '/_test/reset', { body: { ...FX, settlement_operator_ids: ['u_ada'] } });
    const login = async (email) => (await req(c.base, 'POST', '/auth/login', { body: { email, password: 'correct horse' } })).json.token;
    c.ada = await login('ada@example.com'); c.bob = await login('bob@example.com'); c.cy = await login('cy@example.com');
    const bp = await req(c.base, 'POST', '/payments', { token: c.ada, key: newKey(), body: { to_handle: 'bob', amount: 1000 } });
    const b = await req(c.base, 'POST', '/correction-batches', { token: c.ada, key: newKey(), body: { corrections: [{
      payment_id: bp.json.payment_id, expected_revision: 1, amount: 900,
      effective_at: bp.json.created_at, reason: 'batch correction' }] } });
    assert.equal(b.status, 201);
    assert.equal(b.json.revisions.length, 1);
    assert.equal(b.json.revisions[0].amount, 900);
    assert.equal((await me(c, c.ada)).balance, 9100);
    const denied = await req(c.base, 'POST', '/correction-batches', { token: c.bob, key: newKey(), body: { corrections: [] } });
    assert.equal(denied.status, 403);
    const s = await req(c.base, 'POST', '/settlements', {
      token: c.ada, key: newKey(),
      body: { transfers: [{ from_handle: 'ada', to_handle: 'bob', amount: 100 }, { from_handle: 'bob', to_handle: 'cy', amount: 50 }] },
    });
    assert.equal(s.status, 201);
    assert.equal(s.json.payments.length, 2);
    const total = (await me(c, c.ada)).balance + (await me(c, c.bob)).balance + (await me(c, c.cy)).balance;
    assert.equal(total, 13000);
  } finally { c.close(); }
});

test('races — same-key storm settles exactly once', async () => {
  const c = await ctx(4);
  try {
    const k = newKey();
    const body = { to_handle: 'bob', amount: 100 };
    const results = await Promise.all(Array.from({ length: 25 }, () =>
      req(c.base, 'POST', '/payments', { token: c.ada, key: k, body })));
    const created = results.filter(r => r.status === 201).length;
    const replayed = results.filter(r => r.status === 200).length;
    assert.equal(created, 1);
    assert.equal(replayed, 24);
    assert.equal((await me(c, c.ada)).balance, 9900);
  } finally { c.close(); }
});

test('races — overdraft storm never overspends', async () => {
  const c = await ctx(4);
  try {
    // cy has 500; 20 concurrent payments of 100 -> exactly 5 succeed
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      req(c.base, 'POST', '/payments', { token: c.cy, key: newKey(), body: { to_handle: 'ada', amount: 100 } })));
    const ok = results.filter(r => r.status === 201).length;
    assert.equal(ok, 5);
    assert.equal((await me(c, c.cy)).balance, 0);
  } finally { c.close(); }
});

test('races — pay/decline race keeps the invariant', async () => {
  const c = await ctx(4);
  try {
    const rq = await req(c.base, 'POST', '/requests', { token: c.bob, key: newKey(), body: { payer_handle: 'ada', amount: 100 } });
    const rid = rq.json.request_id;
    const before = (await me(c, c.ada)).balance;
    const [pay, dec] = await Promise.all([
      req(c.base, 'POST', `/requests/${rid}/pay`, { token: c.ada, key: newKey(), body: {} }),
      req(c.base, 'POST', `/requests/${rid}/decline`, { token: c.ada }),
    ]);
    const statuses = [pay.status, dec.status].sort();
    assert.ok(statuses.includes(200) || statuses.includes(201));
    const after = (await me(c, c.ada)).balance;
    assert.ok(after === before || after === before - 100);
  } finally { c.close(); }
});
