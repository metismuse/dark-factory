"use strict";
/* Pocketful HTTP service — zero dependencies, Node builtins only.
 * Listens on $PORT (default 8080), 0.0.0.0. Every 4xx/5xx uses the
 * {"error":{"code","message"}} envelope. No 5xx is ever produced by
 * design; a last-resort guard maps unexpected bugs to a 500 envelope
 * rather than crashing the process.
 */
const http = require("http");
const L = require("./ledger.js");
const UI = require("./ui.js");

const STAGE = L.STAGE;

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}
function sendErr(res, e) {
  const status = e && e.status ? e.status : 500;
  const code = e && e.code ? e.code : "internal";
  if (status >= 500) console.error("unexpected error:", e && e.stack || e);
  sendJson(res, status, { error: { code, message: (e && e.message) || code } });
}
function sendHtml(res, html) {
  const data = html;
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}
function wantsHtml(req) {
  const a = req.headers["accept"] || "";
  return a.includes("text/html");
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(L.fail(400, "malformed_request", "body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function parseJsonBody(text) {
  if (!text) return {};
  let v;
  try { v = JSON.parse(text); }
  catch { throw L.fail(400, "malformed_request", "body does not parse as JSON"); }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw L.fail(400, "malformed_request", "body must be a JSON object");
  return v;
}
function queryParams(url) {
  const q = {};
  for (const [k, v] of url.searchParams) if (!(k in q)) q[k] = v;
  return q;
}
// Wrap an idempotent write path: body parse + auth + key checks, then the
// already-claimed key resolves before any endpoint validation (§7).
async function idempotent(req, res, path, body, fn) {
  const t = L.nowMs();
  L.expireSweep(t);
  const user = L.bearer(req.headers);
  const key = L.idemKey(req.headers);
  const chk = L.idemCheck(user, req.method, path, key, body);
  if (chk.replay) return sendJson(res, 200, chk.replay);
  const out = fn(user, body);
  L.idemClaim(chk.scope, chk.canon, out.body);
  return sendJson(res, out.status, out.body);
}
async function plain(req, res, fn) {
  const t = L.nowMs();
  L.expireSweep(t);
  const out = fn();
  return sendJson(res, out.status, out.body);
}
function needStage(n) {
  if (STAGE < n) throw L.fail(404, "not_found", "unknown route");
}

const server = http.createServer((req, res) => {
  (async () => {
    let url;
    try { url = new URL(req.url, "http://x"); }
    catch { return sendErr(res, L.fail(400, "malformed_request", "bad url")); }
    let path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method;
    const q = queryParams(url);
    try {
      // ---- health & test control (unauthenticated) ----
      if (method === "GET" && path === "/health")
        return sendJson(res, 200, { ok: true, stage: STAGE });
      if (method === "POST" && path === "/_test/reset") {
        const body = parseJsonBody(await readBody(req));
        await L.atomic(() => { L.applyFixture(body); });
        res.writeHead(204); return res.end();
      }
      if (method === "GET" && path === "/_test/export") {
        const doc = await L.atomic(() => L.exportState());
        return sendJson(res, 200, doc);
      }
      if (method === "POST" && path === "/_test/import") {
        const doc = parseJsonBody(await readBody(req));
        await L.atomic(() => { L.importState(doc); });
        res.writeHead(204); return res.end();
      }
      // ---- auth ----
      if (method === "POST" && path === "/auth/signup") {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => plain(req, res, () => L.signup(body)));
      }
      if (method === "POST" && path === "/auth/login") {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => plain(req, res, () => L.login(body)));
      }
      // ---- UI (stage 2+) ----
      if (method === "GET" && (path === "/" || path === "/signup" || path === "/login" || path === "/split")) {
        needStage(2);
        const St = L.getState();
        return sendHtml(res, UI.page(path, { currency: St.currency, minor_units: St.minor_units }));
      }
      if (method === "GET" && path === "/requests" && wantsHtml(req)) { needStage(2); const St = L.getState(); return sendHtml(res, UI.page("/requests", { currency: St.currency, minor_units: St.minor_units })); }
      if (method === "GET" && path === "/authorizations" && wantsHtml(req)) { needStage(2); const St = L.getState(); return sendHtml(res, UI.page("/authorizations", { currency: St.currency, minor_units: St.minor_units })); }

      // ---- everything below needs a bearer token ----
      if (method === "GET" && path === "/me") {
        return await L.atomic(() => plain(req, res, () => {
          if (q.as_of !== undefined || q.known_at !== undefined) needStage(3);
          const user = L.bearer(req.headers);
          return L.meAsOf(user, q);
        }));
      }
      if (method === "POST" && path === "/payments") {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createPayment(u, b)));
      }
      if (method === "POST" && path === "/requests") {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createRequest(u, b)));
      }
      let m;
      if (method === "POST" && (m = /^\/requests\/([^/]+)\/pay$/.exec(path))) {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.payRequest(u, decodeURIComponent(m[1]), b)));
      }
      if (method === "POST" && (m = /^\/requests\/([^/]+)\/decline$/.exec(path))) {
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.declineRequest(user, decodeURIComponent(m[1]));
        }));
      }
      if (method === "POST" && (m = /^\/requests\/([^/]+)\/cancel$/.exec(path))) {
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.cancelRequest(user, decodeURIComponent(m[1]));
        }));
      }
      if (method === "GET" && path === "/requests") {
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.listRequests(user, q);
        }));
      }
      if (method === "POST" && path === "/splits") {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createSplit(u, b)));
      }
      if (method === "GET" && path === "/activity") {
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.activity(user, q);
        }));
      }
      if (method === "POST" && path === "/settlements") {
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createSettlement(u, b)));
      }
      // ---- stage 2 ----
      if (method === "POST" && path === "/authorizations") {
        needStage(2);
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createAuthorization(u, b)));
      }
      if (method === "GET" && path === "/authorizations") {
        needStage(2);
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.listAuthorizations(user, q);
        }));
      }
      if (method === "POST" && (m = /^\/authorizations\/([^/]+)\/capture$/.exec(path))) {
        needStage(2);
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.captureAuthorization(u, decodeURIComponent(m[1]), b)));
      }
      if (method === "POST" && (m = /^\/authorizations\/([^/]+)\/void$/.exec(path))) {
        needStage(2);
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.voidAuthorization(user, decodeURIComponent(m[1]));
        }));
      }
      // ---- stage 3 ----
      if (method === "POST" && (m = /^\/payments\/([^/]+)\/corrections$/.exec(path))) {
        needStage(3);
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createCorrection(u, decodeURIComponent(m[1]), b)));
      }
      if (method === "GET" && (m = /^\/payments\/([^/]+)\/revisions$/.exec(path))) {
        needStage(3);
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.getRevisions(user, decodeURIComponent(m[1]));
        }));
      }
      if (method === "GET" && path === "/statement") {
        needStage(3);
        return await L.atomic(() => plain(req, res, () => {
          const user = L.bearer(req.headers);
          return L.getStatement(user, q);
        }));
      }
      // ---- stage 4 ----
      if (method === "POST" && (m = /^\/payments\/([^/]+)\/refunds$/.exec(path))) {
        needStage(4);
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createRefund(u, decodeURIComponent(m[1]), b)));
      }
      if (method === "POST" && path === "/correction-batches") {
        needStage(4);
        const body = parseJsonBody(await readBody(req));
        return await L.atomic(() => idempotent(req, res, path, body, (u, b) => L.createBatch(u, b)));
      }
      return sendErr(res, L.fail(404, "not_found", "unknown route"));
    } catch (e) { sendErr(res, e); }
  })().catch(e => sendErr(res, e));
});

const PORT = parseInt(process.env.PORT || "8080", 10) || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`pocketful stage ${STAGE} listening on 0.0.0.0:${PORT}`);
});
