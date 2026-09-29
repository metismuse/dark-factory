"use strict";
/* Pocketful browser UI (stage 2+). Server-rendered shells; the browser talks
 * to the same JSON API the tests use. Every element the graded UI suite
 * touches is found by its exact data-testid and by nothing else.
 */
const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;
  background:#f7f5f0;color:#1e1c18;line-height:1.45}
header{display:flex;justify-content:space-between;align-items:center;gap:8px;
  padding:10px 16px;background:#23201b;color:#f5f2ea;flex-wrap:wrap}
header nav a{color:#f5f2ea;margin-right:12px;text-decoration:none}
header nav a:hover{text-decoration:underline}
#userbox{display:flex;align-items:center;gap:10px;font-size:14px}
#userbox [data-testid="current-handle"]{opacity:.75}
button{font:inherit;padding:9px 14px;border:1px solid #b9b2a4;border-radius:8px;
  background:#fff;cursor:pointer;min-height:40px}
button:hover{background:#f0ece3}
button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #2f6fed;outline-offset:2px}
main{max-width:640px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid #e3ded2;border-radius:12px;padding:16px;margin-bottom:16px}
h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:0 0 10px}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}
input[type=text],input[type=email],input[type=password],select{font:inherit;width:100%;
  padding:9px 10px;border:1px solid #b9b2a4;border-radius:8px;background:#fff}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.error{background:#fdeceb;border:1px solid #d66;color:#8f1d1d;border-radius:8px;
  padding:10px 12px;margin-top:10px}
.notice{background:#fff8e1;border:1px solid #d9b53b;border-radius:8px;padding:10px 12px;margin-top:10px}
.big{font-size:28px;font-weight:700}
.muted{color:#6b655a;font-size:13px}
.item{border-top:1px solid #eee7d8;padding:10px 0}
.item:first-child{border-top:none}
[data-testid="wallet-balance"]{font-variant-numeric:tabular-nums}
`;

const COMMON_JS = `
const CFG = window.POCKETFUL;
const q = (s, r) => (r || document).querySelector(s);
const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
const token = () => localStorage.getItem("pf_token");
const setToken = t => localStorage.setItem("pf_token", t);
async function api(path, opts) {
  opts = opts || {};
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const t = token();
  if (t) headers["Authorization"] = "Bearer " + t;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (opts.timeout || 12) * 1000);
  try {
    const r = await fetch(path, { method: opts.method || "GET", headers: headers,
      body: opts.body, signal: ctrl.signal });
    let body = null;
    try { body = await r.json(); } catch (e) {}
    if (r.status === 401 && t && !opts.keep401) {
      localStorage.removeItem("pf_token");
      if (location.pathname !== "/login" && location.pathname !== "/signup") location.href = "/login";
    }
    return { status: r.status, body: body };
  } finally { clearTimeout(timer); }
}
function money(minor) {
  const u = CFG.minor_units;
  if (u === 0) return minor + " " + CFG.currency;
  const neg = minor < 0, a = Math.abs(minor);
  const s = String(a).padStart(u + 1, "0");
  return (neg ? "-" : "") + s.slice(0, -u) + "." + s.slice(-u) + " " + CFG.currency;
}
function decimalOf(minor) {
  const u = CFG.minor_units;
  if (u === 0) return String(minor);
  const s = String(Math.abs(minor)).padStart(u + 1, "0");
  return s.slice(0, -u) + "." + s.slice(-u);
}
function parseDecimal(str) {
  const m = /^(\\d+)(?:\\.(\\d+))?$/.exec(String(str).trim());
  if (!m) return null;
  if (m[2] && m[2].length > CFG.minor_units) return null;
  const frac = (m[2] || "").padEnd(CFG.minor_units, "0");
  const v = parseInt(m[1], 10) * Math.pow(10, CFG.minor_units) + (frac ? parseInt(frac, 10) : 0);
  return v >= 1 ? v : null;
}
function errMsg(r, fallback) {
  return (r.body && r.body.error && r.body.error.message) || (fallback + " (" + r.status + ")");
}
function showError(testid, anchor, msg) {
  clearError(testid);
  const d = document.createElement("div");
  d.setAttribute("data-testid", testid);
  d.className = "error";
  d.setAttribute("role", "alert");
  d.textContent = msg;
  anchor.appendChild(d);
}
function clearError(testid) {
  qa("[data-testid='" + testid + "']").forEach(e => e.remove());
}
async function renderHeader() {
  const box = q("#userbox");
  box.innerHTML = "";
  if (!token()) return;
  const r = await api("/me");
  if (r.status !== 200 || !r.body) return;
  const u = document.createElement("span");
  u.setAttribute("data-testid", "current-user");
  u.textContent = r.body.display_name;
  const h = document.createElement("span");
  h.setAttribute("data-testid", "current-handle");
  h.textContent = r.body.handle;
  const b = document.createElement("button");
  b.setAttribute("data-testid", "logout-button");
  b.setAttribute("type", "button");
  b.textContent = "Log out";
  b.addEventListener("click", () => {
    localStorage.removeItem("pf_token");
    location.href = "/login";
  });
  box.appendChild(u); box.appendChild(h); box.appendChild(b);
}
function requireAuth() {
  if (!token()) { location.href = "/login"; return false; }
  return true;
}
`;

function shell(title, mainHtml, pageJs, cfg) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${CSS}</style></head>
<body>
<header>
<nav aria-label="Primary">
<a href="/">Wallet</a><a href="/requests">Requests</a><a href="/split">Split</a><a href="/authorizations">Authorizations</a>
</nav>
<div id="userbox"></div>
</header>
<main>${mainHtml}</main>
<script>window.POCKETFUL=${JSON.stringify(cfg)};</script>
<script>${COMMON_JS}</script>
<script>${pageJs}</script>
</body></html>`;
}

const PAGES = {
  "/login": {
    title: "Log in",
    main: `<div class="card"><h1>Log in</h1>
      <div id="loginform">
      <label for="li-e">Email</label><input id="li-e" data-testid="login-email" type="email" autocomplete="email">
      <label for="li-p">Password</label><input id="li-p" data-testid="login-password" type="password" autocomplete="current-password">
      <div class="row" style="margin-top:12px"><button data-testid="login-submit" type="button">Log in</button>
      <a href="/signup">Create an account</a></div>
      </div></div>`,
    js: `
      renderHeader();
      q("[data-testid='login-submit']").addEventListener("click", async () => {
        clearError("auth-error");
        const r = await api("/auth/login", { method: "POST",
          body: JSON.stringify({ email: q("[data-testid='login-email']").value,
                                 password: q("[data-testid='login-password']").value }) });
        if (r.status === 200 && r.body && r.body.token) { setToken(r.body.token); location.href = "/"; }
        else showError("auth-error", q("#loginform"), errMsg(r, "Login failed"));
      });`,
  },
  "/signup": {
    title: "Sign up",
    main: `<div class="card"><h1>Sign up</h1>
      <div id="signupform">
      <label for="su-e">Email</label><input id="su-e" data-testid="signup-email" type="email" autocomplete="email">
      <label for="su-p">Password (8+ characters)</label><input id="su-p" data-testid="signup-password" type="password" autocomplete="new-password">
      <label for="su-d">Display name</label><input id="su-d" data-testid="signup-display-name" type="text" autocomplete="name">
      <div class="row" style="margin-top:12px"><button data-testid="signup-submit" type="button">Sign up</button>
      <a href="/login">Log in instead</a></div>
      </div></div>`,
    js: `
      renderHeader();
      q("[data-testid='signup-submit']").addEventListener("click", async () => {
        clearError("auth-error");
        const r = await api("/auth/signup", { method: "POST",
          body: JSON.stringify({ email: q("[data-testid='signup-email']").value,
                                 password: q("[data-testid='signup-password']").value,
                                 display_name: q("[data-testid='signup-display-name']").value }) });
        if (r.status === 201 && r.body && r.body.token) { setToken(r.body.token); location.href = "/"; }
        else showError("auth-error", q("#signupform"), errMsg(r, "Signup failed"));
      });`,
  },
  "/": {
    title: "Wallet",
    main: `<div class="card"><h1>Wallet</h1>
      <div class="big" data-testid="wallet-balance" data-amount="0">…</div>
      <div class="muted">Available <span data-testid="wallet-available" data-amount="0">…</span>
      <span data-testid="wallet-held-wrap"></span></div>
      <div class="row" style="margin-top:8px"><button data-testid="wallet-refresh" type="button">Refresh</button></div>
      </div>
      <div class="card"><h2>Pay</h2><div id="payform">
      <label for="p-h">To handle</label><input id="p-h" data-testid="pay-handle" type="text" autocomplete="off">
      <label for="p-a">Amount</label><input id="p-a" data-testid="pay-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="15.00">
      <label for="p-n">Note</label><input id="p-n" data-testid="pay-note" type="text" autocomplete="off">
      <label for="p-v">Visibility</label><select id="p-v" data-testid="pay-visibility">
        <option value="public">public</option><option value="private">private</option></select>
      <div class="row" style="margin-top:12px"><button data-testid="pay-submit" type="button">Pay</button></div>
      </div></div>
      <div class="card"><h2>Request</h2><div id="reqform">
      <label for="r-h">Payer handle</label><input id="r-h" data-testid="request-handle" type="text" autocomplete="off">
      <label for="r-a">Amount</label><input id="r-a" data-testid="request-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="15.00">
      <label for="r-n">Note</label><input id="r-n" data-testid="request-note" type="text" autocomplete="off">
      <div class="row" style="margin-top:12px"><button data-testid="request-submit" type="button">Request</button></div>
      </div></div>
      <div class="card" id="authcard"><h2>Authorize</h2><div id="authform">
      <label for="a-h">To handle</label><input id="a-h" data-testid="authorize-handle" type="text" autocomplete="off">
      <label for="a-a">Amount</label><input id="a-a" data-testid="authorize-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="15.00">
      <label for="a-n">Note</label><input id="a-n" data-testid="authorize-note" type="text" autocomplete="off">
      <label for="a-v">Visibility</label><select id="a-v" data-testid="authorize-visibility">
        <option value="public">public</option><option value="private">private</option></select>
      <div class="row" style="margin-top:12px"><button data-testid="authorize-submit" type="button">Authorize</button></div>
      </div></div>
      <div class="card"><h2>Activity</h2><div data-testid="activity-list"></div><div id="empty-activity-wrap"></div></div>`,
    js: `
      if (!requireAuth()) throw new Error("redirect");
      renderHeader();
      let formKey = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
      qa("#payform input, #payform select").forEach(el => {
        el.addEventListener("input", () => { formKey = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())); });
        el.addEventListener("change", () => { formKey = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())); });
      });
      let refreshSeq = 0;
      async function refreshWallet() {
        const n = ++refreshSeq;
        const meP = api("/me"), actP = api("/activity?limit=50");
        const me = await meP, act = await actP;
        if (n !== refreshSeq) return; // latest refresh wins
        if (me.status === 200 && me.body) {
          const b = q("[data-testid='wallet-balance']");
          b.textContent = money(me.body.balance);
          b.setAttribute("data-amount", String(me.body.balance));
          const av = q("[data-testid='wallet-available']");
          av.textContent = money(me.body.available);
          av.setAttribute("data-amount", String(me.body.available));
          const wrap = q("[data-testid='wallet-held-wrap']");
          wrap.innerHTML = "";
          if (me.body.held > 0) {
            const s = document.createElement("span");
            s.setAttribute("data-testid", "wallet-held");
            s.setAttribute("data-amount", String(me.body.held));
            s.textContent = "Held " + money(me.body.held);
            wrap.appendChild(document.createTextNode(" · "));
            wrap.appendChild(s);
          }
        }
        if (act.status === 200 && act.body) renderFeed(act.body.payments || []);
      }
      function renderFeed(payments) {
        const list = q("[data-testid='activity-list']");
        list.innerHTML = "";
        const wrap = q("#empty-activity-wrap");
        wrap.innerHTML = "";
        if (!payments.length) {
          const e = document.createElement("div");
          e.setAttribute("data-testid", "empty-activity");
          e.className = "muted";
          e.textContent = "No activity yet.";
          wrap.appendChild(e);
          return;
        }
        payments.forEach(p => {
          const d = document.createElement("div");
          d.className = "item";
          d.setAttribute("data-testid", "activity-item-" + p.payment_id);
          d.setAttribute("data-visibility", p.visibility);
          const parties = document.createElement("div");
          parties.setAttribute("data-testid", "activity-parties-" + p.payment_id);
          parties.textContent = p.from_handle + " → " + p.to_handle;
          const amt = document.createElement("div");
          amt.setAttribute("data-testid", "activity-amount-" + p.payment_id);
          amt.textContent = money(p.amount);
          const note = document.createElement("div");
          note.setAttribute("data-testid", "activity-note-" + p.payment_id);
          note.className = "muted";
          note.textContent = p.note || "";
          d.appendChild(parties); d.appendChild(amt); d.appendChild(note);
          list.appendChild(d);
        });
      }
      function showUncertain(msg) {
        clearError("pay-uncertain");
        const d = document.createElement("div");
        d.setAttribute("data-testid", "pay-uncertain");
        d.className = "notice";
        d.setAttribute("role", "alert");
        d.textContent = msg;
        q("#payform").appendChild(d);
      }
      q("[data-testid='pay-submit']").addEventListener("click", async () => {
        clearError("pay-error");
        const amt = parseDecimal(q("[data-testid='pay-amount']").value);
        if (amt === null) {
          showError("pay-error", q("#payform"), "Enter an amount like 15.00 (no more than " + CFG.minor_units + " decimal places).");
          return;
        }
        let r;
        try {
          r = await api("/payments", { method: "POST", headers: { "Idempotency-Key": formKey },
            body: JSON.stringify({ to_handle: q("[data-testid='pay-handle']").value.trim(),
              amount: amt, note: q("[data-testid='pay-note']").value,
              visibility: q("[data-testid='pay-visibility']").value }) });
        } catch (e) {
          showUncertain("The payment response was lost. It may have gone through — retry to confirm; a retry never charges twice.");
          return;
        }
        if (r.status === 200 || r.status === 201) { clearError("pay-uncertain"); refreshWallet(); }
        else { showError("pay-error", q("#payform"), errMsg(r, "Payment failed")); refreshWallet(); }
      });
      q("[data-testid='request-submit']").addEventListener("click", async () => {
        clearError("request-error");
        const amt = parseDecimal(q("[data-testid='request-amount']").value);
        if (amt === null) {
          showError("request-error", q("#reqform"), "Enter an amount like 15.00.");
          return;
        }
        let r;
        try {
          r = await api("/requests", { method: "POST",
            headers: { "Idempotency-Key": (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())) },
            body: JSON.stringify({ payer_handle: q("[data-testid='request-handle']").value.trim(),
              amount: amt, note: q("[data-testid='request-note']").value }) });
        } catch (e) { showError("request-error", q("#reqform"), "Network error — try again."); return; }
        if (r.status === 200 || r.status === 201) { refreshWallet(); }
        else showError("request-error", q("#reqform"), errMsg(r, "Request failed"));
      });
      q("[data-testid='authorize-submit']").addEventListener("click", async () => {
        clearError("authorize-error");
        const amt = parseDecimal(q("[data-testid='authorize-amount']").value);
        if (amt === null) {
          showError("authorize-error", q("#authform"), "Enter an amount like 15.00.");
          return;
        }
        let r;
        try {
          r = await api("/authorizations", { method: "POST",
            headers: { "Idempotency-Key": (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())) },
            body: JSON.stringify({ to_handle: q("[data-testid='authorize-handle']").value.trim(),
              amount: amt, note: q("[data-testid='authorize-note']").value,
              visibility: q("[data-testid='authorize-visibility']").value }) });
        } catch (e) { showError("authorize-error", q("#authform"), "Network error — try again."); return; }
        if (r.status === 200 || r.status === 201) { refreshWallet(); }
        else showError("authorize-error", q("#authform"), errMsg(r, "Authorization failed"));
      });
      q("[data-testid='wallet-refresh']").addEventListener("click", refreshWallet);
      refreshWallet();`,
  },
  "/requests": {
    title: "Requests",
    main: `<div class="card"><h1>Requests</h1>
      <div id="request-error-wrap"></div>
      <h2>Incoming</h2><div data-testid="incoming-list"></div>
      <h2>Outgoing</h2><div data-testid="outgoing-list"></div>
      <div id="empty-requests-wrap"></div></div>`,
    js: `
      if (!requireAuth()) throw new Error("redirect");
      renderHeader();
      let myHandle = null;
      async function load() {
        const me = await api("/me");
        if (me.status === 200 && me.body) myHandle = me.body.handle;
        const r = await api("/requests?limit=200");
        if (r.status !== 200) return;
        render(r.body.requests || []);
      }
      function render(requests) {
        const inc = q("[data-testid='incoming-list']"), out = q("[data-testid='outgoing-list']");
        inc.innerHTML = ""; out.innerHTML = "";
        const wrap = q("#empty-requests-wrap"); wrap.innerHTML = "";
        if (!requests.length) {
          const e = document.createElement("div");
          e.setAttribute("data-testid", "empty-requests");
          e.className = "muted"; e.textContent = "No requests.";
          wrap.appendChild(e); return;
        }
        requests.forEach(x => {
          const d = document.createElement("div");
          d.className = "item";
          d.setAttribute("data-testid", "request-item-" + x.request_id);
          d.setAttribute("data-status", x.status);
          const amt = document.createElement("div");
          amt.setAttribute("data-testid", "request-amount-" + x.request_id);
          amt.textContent = money(x.amount);
          const meta = document.createElement("div");
          meta.className = "muted";
          meta.textContent = x.requester_handle + " asks " + x.payer_handle + (x.note ? " — " + x.note : "");
          d.appendChild(amt); d.appendChild(meta);
          const incoming = x.payer_handle === myHandle;
          if (x.status === "pending" && incoming) {
            const pay = document.createElement("button");
            pay.setAttribute("data-testid", "request-pay-" + x.request_id);
            pay.setAttribute("type", "button"); pay.textContent = "Pay";
            pay.addEventListener("click", () => act(x, "pay"));
            const dec = document.createElement("button");
            dec.setAttribute("data-testid", "request-decline-" + x.request_id);
            dec.setAttribute("type", "button"); dec.textContent = "Decline";
            dec.addEventListener("click", () => act(x, "decline"));
            const row = document.createElement("div"); row.className = "row";
            row.appendChild(pay); row.appendChild(dec); d.appendChild(row);
          } else if (x.status === "pending" && !incoming) {
            const c = document.createElement("button");
            c.setAttribute("data-testid", "request-cancel-" + x.request_id);
            c.setAttribute("type", "button"); c.textContent = "Cancel";
            c.addEventListener("click", () => act(x, "cancel"));
            const row = document.createElement("div"); row.className = "row";
            row.appendChild(c); d.appendChild(row);
          }
          (incoming ? inc : out).appendChild(d);
        });
      }
      async function act(x, kind) {
        clearError("request-error");
        const key = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
        let r;
        try {
          if (kind === "pay") r = await api("/requests/" + x.request_id + "/pay",
            { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ visibility: "public" }) });
          else r = await api("/requests/" + x.request_id + "/" + kind, { method: "POST" });
        } catch (e) { showError("request-error", q("#request-error-wrap"), "Network error — try again."); return; }
        if (r.status === 200 || r.status === 201) load();
        else { showError("request-error", q("#request-error-wrap"), errMsg(r, "Action failed")); load(); }
      }
      load();`,
  },
  "/split": {
    title: "Split",
    main: `<div class="card"><h1>Split a bill</h1><div id="splitform">
      <label for="s-a">Total amount</label><input id="s-a" data-testid="split-amount" type="text" inputmode="decimal" placeholder="10.00">
      <label for="s-h">Participant handles (comma or space separated)</label>
      <input id="s-h" data-testid="split-handles" type="text" placeholder="ada, bob, cy">
      <label for="s-n">Note</label><input id="s-n" data-testid="split-note" type="text">
      <div class="row" style="margin-top:12px"><button data-testid="split-submit" type="button">Split</button></div>
      <h2 style="margin-top:16px">Preview</h2><div data-testid="split-preview"></div>
      </div></div>`,
    js: `
      if (!requireAuth()) throw new Error("redirect");
      renderHeader();
      function handles() {
        return q("[data-testid='split-handles']").value.split(/[\\s,]+/).filter(Boolean);
      }
      function updatePreview() {
        const prev = q("[data-testid='split-preview']");
        prev.innerHTML = "";
        const amt = parseDecimal(q("[data-testid='split-amount']").value);
        const hs = handles();
        if (amt === null || !hs.length) return;
        const n = hs.length, base = Math.floor(amt / n), rem = amt % n;
        hs.forEach((h, i) => {
          const row = document.createElement("div"); row.className = "row";
          const lab = document.createElement("span"); lab.textContent = h;
          const share = document.createElement("div");
          share.setAttribute("data-testid", "split-share-" + h);
          share.textContent = money(base + (i < rem ? 1 : 0));
          row.appendChild(lab); row.appendChild(share);
          prev.appendChild(row);
        });
      }
      q("[data-testid='split-amount']").addEventListener("input", updatePreview);
      q("[data-testid='split-handles']").addEventListener("input", updatePreview);
      q("[data-testid='split-submit']").addEventListener("click", async () => {
        clearError("split-error");
        const amt = parseDecimal(q("[data-testid='split-amount']").value);
        const hs = handles();
        if (amt === null || !hs.length) {
          showError("split-error", q("#splitform"), "Enter an amount and at least one handle.");
          return;
        }
        let r;
        try {
          r = await api("/splits", { method: "POST",
            headers: { "Idempotency-Key": (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())) },
            body: JSON.stringify({ amount: amt, participant_handles: hs,
              note: q("[data-testid='split-note']").value }) });
        } catch (e) { showError("split-error", q("#splitform"), "Network error — try again."); return; }
        if (r.status === 200 || r.status === 201) {
          const prev = q("[data-testid='split-preview']");
          prev.innerHTML = "";
          (r.body.shares || []).forEach(s => {
            const row = document.createElement("div"); row.className = "row";
            const lab = document.createElement("span"); lab.textContent = s.handle;
            const share = document.createElement("div");
            share.setAttribute("data-testid", "split-share-" + s.handle);
            share.textContent = money(s.amount);
            row.appendChild(lab); row.appendChild(share);
            prev.appendChild(row);
          });
        } else showError("split-error", q("#splitform"), errMsg(r, "Split failed"));
      });
      updatePreview();`,
  },
  "/authorizations": {
    title: "Authorizations",
    main: `<div class="card"><h1>Authorizations</h1>
      <div id="authz-error-wrap"></div>
      <div data-testid="authorization-list"></div>
      <div id="empty-authz-wrap"></div></div>`,
    js: `
      if (!requireAuth()) throw new Error("redirect");
      renderHeader();
      let myHandle = null;
      async function load() {
        const me = await api("/me");
        if (me.status === 200 && me.body) myHandle = me.body.handle;
        const r = await api("/authorizations?limit=200");
        if (r.status !== 200) return;
        render(r.body.authorizations || []);
      }
      function render(auths) {
        const list = q("[data-testid='authorization-list']");
        list.innerHTML = "";
        const wrap = q("#empty-authz-wrap"); wrap.innerHTML = "";
        if (!auths.length) {
          const e = document.createElement("div");
          e.setAttribute("data-testid", "empty-authorizations");
          e.className = "muted"; e.textContent = "No authorizations.";
          wrap.appendChild(e); return;
        }
        auths.forEach(a => {
          const d = document.createElement("div");
          d.className = "item";
          d.setAttribute("data-testid", "authorization-item-" + a.authorization_id);
          d.setAttribute("data-status", a.status);
          const amt = document.createElement("div");
          amt.setAttribute("data-testid", "authorization-amount-" + a.authorization_id);
          amt.textContent = money(a.amount);
          const meta = document.createElement("div");
          meta.className = "muted";
          meta.textContent = a.from_handle + " → " + a.to_handle + (a.note ? " — " + a.note : "");
          const exp = document.createElement("div");
          exp.setAttribute("data-testid", "authorization-expires-" + a.authorization_id);
          exp.className = "muted";
          exp.textContent = a.expires_at;
          d.appendChild(amt); d.appendChild(meta); d.appendChild(exp);
          if (a.captured_amount > 0) {
            const cap = document.createElement("div");
            cap.setAttribute("data-testid", "authorization-captured-" + a.authorization_id);
            cap.textContent = "Captured " + money(a.captured_amount);
            d.appendChild(cap);
          }
          const incoming = a.to_handle === myHandle;
          const outgoing = a.from_handle === myHandle;
          if (a.status === "open" && incoming) {
            const inp = document.createElement("input");
            inp.setAttribute("data-testid", "authorization-capture-amount-" + a.authorization_id);
            inp.setAttribute("type", "text");
            inp.setAttribute("inputmode", "decimal");
            inp.value = decimalOf(a.remaining_amount);
            inp.setAttribute("aria-label", "Capture amount");
            const btn = document.createElement("button");
            btn.setAttribute("data-testid", "authorization-capture-" + a.authorization_id);
            btn.setAttribute("type", "button"); btn.textContent = "Capture";
            btn.addEventListener("click", async () => {
              clearError("authorization-error");
              const amt = parseDecimal(inp.value);
              if (amt === null) {
                showError("authorization-error", q("#authz-error-wrap"), "Enter an amount.");
                return;
              }
              let r;
              try {
                r = await api("/authorizations/" + a.authorization_id + "/capture", { method: "POST",
                  headers: { "Idempotency-Key": (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())) },
                  body: JSON.stringify({ amount: amt }) });
              } catch (e) { showError("authorization-error", q("#authz-error-wrap"), "Network error — try again."); return; }
              if (r.status === 200 || r.status === 201) load();
              else { showError("authorization-error", q("#authz-error-wrap"), errMsg(r, "Capture failed")); load(); }
            });
            const row = document.createElement("div"); row.className = "row";
            row.appendChild(inp); row.appendChild(btn); d.appendChild(row);
          }
          if (a.status === "open" && outgoing) {
            const btn = document.createElement("button");
            btn.setAttribute("data-testid", "authorization-void-" + a.authorization_id);
            btn.setAttribute("type", "button"); btn.textContent = "Void";
            btn.addEventListener("click", async () => {
              clearError("authorization-error");
              let r;
              try {
                r = await api("/authorizations/" + a.authorization_id + "/void", { method: "POST" });
              } catch (e) { showError("authorization-error", q("#authz-error-wrap"), "Network error — try again."); return; }
              if (r.status === 200) load();
              else { showError("authorization-error", q("#authz-error-wrap"), errMsg(r, "Void failed")); load(); }
            });
            const row = document.createElement("div"); row.className = "row";
            row.appendChild(btn); d.appendChild(row);
          }
          list.appendChild(d);
        });
      }
      load();`,
  },
};

function page(path, cfg) {
  const p = PAGES[path];
  if (!p) return null;
  return shell(p.title, p.main, p.js, cfg);
}

module.exports = { page };
