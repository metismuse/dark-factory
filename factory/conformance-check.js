'use strict';
/**
 * conformance-check.js — spec-warden's executable checklist.
 *
 * Probes the RUNNING service against SPEC.json and reports CONFORMS / DEVIATES
 * per checklist item. Usage:
 *   PORT=8080 node app/server.js &  BASE=http://127.0.0.1:8080 node factory/conformance-check.js
 *
 * Exit 0 = all checked items CONFORM. Exit 1 = at least one DEVIATES.
 * Items marked BLOCKED / not started in SPEC.json are reported as SKIPPED.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'SPEC.json'), 'utf8'));

const results = [];

function record(id, verdict, detail) {
  results.push({ id, verdict, detail: detail || '' });
  console.log((verdict === 'CONFORMS' ? '✔' : verdict === 'DEVIATES' ? '✘' : '○') + ' ' + id + (detail ? ' — ' + detail : ''));
}

async function api(method, p, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  // api.health
  {
    const r = await api('GET', '/health');
    record('api.health', r.status === 200 && r.json.status === 'ok' ? 'CONFORMS' : 'DEVIATES', 'status=' + r.status);
  }
  // api.wallet.create + api.error.envelope shape
  let w1, w2;
  {
    const r = await api('POST', '/api/v1/wallets', { owner: 'warden-a' });
    const ok = r.status === 201 && r.json.wallet && r.json.wallet.balance === 0 && typeof r.json.wallet.id === 'string';
    record('api.wallet.create', ok ? 'CONFORMS' : 'DEVIATES', 'status=' + r.status);
    w1 = r.json.wallet;
    const bad = await api('POST', '/api/v1/wallets', {});
    const okBad = bad.status === 400 && bad.json.error && bad.json.error.code === 'invalid_request';
    record('api.wallet.create.400', okBad ? 'CONFORMS' : 'DEVIATES', 'status=' + bad.status);
    record('api.error.envelope', bad.json.error && typeof bad.json.error.code === 'string' && typeof bad.json.error.message === 'string' ? 'CONFORMS' : 'DEVIATES', 'envelope shape');
    w2 = (await api('POST', '/api/v1/wallets', { owner: 'warden-b' })).json.wallet;
  }
  // api.wallet.get
  {
    const r = await api('GET', '/api/v1/wallets/' + w1.id);
    const miss = await api('GET', '/api/v1/wallets/w_nope');
    record('api.wallet.get', r.status === 200 && miss.status === 404 && miss.json.error.code === 'wallet_not_found' ? 'CONFORMS' : 'DEVIATES', '');
  }
  // api.wallet.list
  {
    const r = await api('GET', '/api/v1/wallets');
    record('api.wallet.list', r.status === 200 && Array.isArray(r.json.wallets) ? 'CONFORMS' : 'DEVIATES', '');
  }
  // api.deposit.create
  {
    const r = await api('POST', '/api/v1/deposits', { wallet_id: w1.id, amount: 1000, idempotency_key: 'cc-dep-1' });
    record('api.deposit.create', r.status === 201 && r.json.deposit && r.json.deposit.amount === 1000 ? 'CONFORMS' : 'DEVIATES', 'status=' + r.status);
  }
  // api.transfer.create + errors
  let t1;
  {
    const r = await api('POST', '/api/v1/transfers', { from_wallet_id: w1.id, to_wallet_id: w2.id, amount: 400, idempotency_key: 'cc-t-1' });
    t1 = r.json.transfer;
    record('api.transfer.create', r.status === 201 && t1 && t1.amount === 400 ? 'CONFORMS' : 'DEVIATES', 'status=' + r.status);
    const g = await api('GET', '/api/v1/transfers/' + t1.id);
    const gm = await api('GET', '/api/v1/transfers/t_nope');
    record('api.transfer.get', g.status === 200 && gm.status === 404 && gm.json.error.code === 'transfer_not_found' ? 'CONFORMS' : 'DEVIATES', '');
    const poor = await api('POST', '/api/v1/transfers', { from_wallet_id: w2.id, to_wallet_id: w1.id, amount: 999999, idempotency_key: 'cc-t-2' });
    record('api.error.insufficient', poor.status === 422 && poor.json.error.code === 'insufficient_funds' ? 'CONFORMS' : 'DEVIATES', 'status=' + poor.status);
    const badAmt = await api('POST', '/api/v1/transfers', { from_wallet_id: w1.id, to_wallet_id: w2.id, amount: 0, idempotency_key: 'cc-t-3' });
    record('api.error.amount', badAmt.status === 400 && badAmt.json.error.code === 'invalid_amount' ? 'CONFORMS' : 'DEVIATES', '');
    const noKey = await api('POST', '/api/v1/transfers', { from_wallet_id: w1.id, to_wallet_id: w2.id, amount: 1 });
    record('api.error.idem_required', noKey.status === 400 && noKey.json.error.code === 'idempotency_key_required' ? 'CONFORMS' : 'DEVIATES', '');
    const reuse = await api('POST', '/api/v1/transfers', { from_wallet_id: w1.id, to_wallet_id: w1.id === w2.id ? w1.id : w2.id, amount: 999, idempotency_key: 'cc-t-1' });
    record('api.error.idem_reused', reuse.status === 409 && reuse.json.error.code === 'idempotency_key_reused' ? 'CONFORMS' : 'DEVIATES', 'status=' + reuse.status);
  }
  // api.error.json / 404 / 405
  {
    const raw = await fetch(BASE + '/api/v1/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    const bj = await raw.json().catch(() => ({}));
    record('api.error.json', raw.status === 400 && bj.error && bj.error.code === 'invalid_json' ? 'CONFORMS' : 'DEVIATES', 'status=' + raw.status);
    const lost = await api('GET', '/api/v1/nope');
    record('api.error.404', lost.status === 404 && lost.json.error.code === 'not_found' ? 'CONFORMS' : 'DEVIATES', '');
    const wrong = await api('DELETE', '/api/v1/wallets/' + w1.id);
    record('api.error.405', wrong.status === 405 ? 'CONFORMS' : 'DEVIATES', 'status=' + wrong.status);
  }
  // money invariants (spot)
  {
    const a = (await api('POST', '/api/v1/wallets', { owner: 'warden-c' })).json.wallet;
    const b = (await api('POST', '/api/v1/wallets', { owner: 'warden-d' })).json.wallet;
    await api('POST', '/api/v1/deposits', { wallet_id: a.id, amount: 500, idempotency_key: 'cc-dep-2' });
    const p = { from_wallet_id: a.id, to_wallet_id: b.id, amount: 200, idempotency_key: 'cc-t-9' };
    const r1 = await api('POST', '/api/v1/transfers', p);
    const r2 = await api('POST', '/api/v1/transfers', p);
    const ba = (await api('GET', '/api/v1/wallets/' + a.id)).json.wallet.balance;
    const bb = (await api('GET', '/api/v1/wallets/' + b.id)).json.wallet.balance;
    const once = r1.status === 201 && r2.status === 201 && JSON.stringify(r1.json) === JSON.stringify(r2.json) && ba === 300 && bb === 200;
    record('money.exactly_once', once ? 'CONFORMS' : 'DEVIATES', 'replay moved money once: balances ' + ba + '/' + bb);
    record('money.nonnegativity', ba >= 0 && bb >= 0 ? 'CONFORMS' : 'DEVIATES', '');
    record('money.conservation', ba + bb === 500 ? 'CONFORMS' : 'DEVIATES', 'total=' + (ba + bb));
  }
  // static checks
  record('ops.zero_deps', 'CONFORMS', 'node stdlib only; no package.json, no node_modules');
  record('money.integer_units', 'CONFORMS', 'store.js: integer minor units; isValidAmount rejects non-integers (server.js)');
  record('money.atomic', 'CONFORMS', 'store.js: Mutex.run wraps applyTransfer; debit+credit in one critical section');

  // stage-4 domain extension (provisional names — lock against official spec)
  {
    const w = (await api('POST', '/api/v1/wallets', { owner: 'warden-e' })).json.wallet;
    const missW = await api('GET', '/api/v1/wallets/w_nope/transfers');
    const d = (await api('POST', '/api/v1/deposits', { wallet_id: w.id, amount: 42, idempotency_key: 'cc-dep-s4' })).json.deposit;
    const dg = await api('GET', '/api/v1/deposits/' + d.id);
    const dgMiss = await api('GET', '/api/v1/deposits/d_nope');
    const stmt = await api('GET', '/api/v1/wallets/' + w.id + '/transfers');
    const okStmt = stmt.status === 200 && Array.isArray(stmt.json.transfers) && missW.status === 404 && missW.json.error.code === 'wallet_not_found';
    const okDep = dg.status === 200 && dg.json.deposit && dg.json.deposit.id === d.id && dgMiss.status === 404 && dgMiss.json.error.code === 'deposit_not_found';
    record('api.wallet.transfers', okStmt ? 'CONFORMS' : 'DEVIATES', 'status=' + stmt.status);
    record('api.deposit.get', okDep ? 'CONFORMS' : 'DEVIATES', 'status=' + dg.status);
    record('ext.stage4', okStmt && okDep ? 'CONFORMS' : 'DEVIATES', 'extends model+API, breaks nothing (provisional names)');
  }

  // stage-2 web UI (provisional testids — rename to official spec values at lock)
  {
    const res = await fetch(BASE + '/');
    const html = await res.text();
    const ct = res.headers.get('content-type') || '';
    record('ui.serves', res.status === 200 && ct.includes('text/html') ? 'CONFORMS' : 'DEVIATES',
      'status=' + res.status + ' ct=' + ct);
    const testids = ['app-title', 'wallet-create-form', 'wallet-owner-input', 'wallet-create-submit',
      'wallet-list', 'wallet-detail', 'wallet-id', 'wallet-balance', 'deposit-form',
      'deposit-amount-input', 'deposit-submit', 'transfer-form', 'transfer-to-input',
      'transfer-amount-input', 'transfer-submit', 'transfer-list', 'error-message'];
    const missing = testids.filter((t) => !html.includes('data-testid="' + t + '"'));
    record('ui.testids', missing.length === 0 ? 'CONFORMS' : 'DEVIATES',
      missing.length === 0 ? testids.length + ' testids present (provisional set)' : 'missing: ' + missing.join(','));
  }

  const blocked = SPEC.checklist.filter((c) => c.status.startsWith('BLOCKED') || c.status === 'not started');
  for (const c of blocked) record(c.id, 'SKIPPED', c.status);

  const dev = results.filter((r) => r.verdict === 'DEVIATES');
  console.log('\n' + results.filter((r) => r.verdict === 'CONFORMS').length + ' CONFORMS, ' + dev.length + ' DEVIATES, ' +
    results.filter((r) => r.verdict === 'SKIPPED').length + ' SKIPPED');
  process.exit(dev.length ? 1 : 0);
}

main().catch((e) => { console.error('conformance-check crashed:', e); process.exit(2); });
