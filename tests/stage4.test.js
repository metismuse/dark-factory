'use strict';
/**
 * stage4.test.js — domain-extension gate (Stage 4).
 *
 * The extension: a wallet statement endpoint and a deposit lookup, both
 * strictly additive. This suite also re-proves the stage-1 contract is intact
 * (extension must break nothing that already worked).
 *
 * Run:  node --test tests/stage4.test.js
 *
 * NOTE: endpoint/field names are provisional — lock against the official track
 * spec before submission.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../app/server');

let base;
let server;

test.before(async () => {
  const built = buildServer();
  server = built.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const post = (p, b) => api('POST', p, b);
const get = (p) => api('GET', p);

// --- wallet statement -------------------------------------------------------
test('GET /api/v1/wallets/:id/transfers returns every transfer involving the wallet', async () => {
  const a = (await post('/api/v1/wallets', { owner: 's4-a' })).json.wallet;
  const b = (await post('/api/v1/wallets', { owner: 's4-b' })).json.wallet;
  const c = (await post('/api/v1/wallets', { owner: 's4-c' })).json.wallet;
  await post('/api/v1/deposits', { wallet_id: a.id, amount: 1000, idempotency_key: 's4-dep-a' });
  await post('/api/v1/deposits', { wallet_id: b.id, amount: 1000, idempotency_key: 's4-dep-b' });
  const t1 = (await post('/api/v1/transfers', { from_wallet_id: a.id, to_wallet_id: b.id, amount: 100, idempotency_key: 's4-t-1' })).json.transfer;
  const t2 = (await post('/api/v1/transfers', { from_wallet_id: b.id, to_wallet_id: c.id, amount: 50, idempotency_key: 's4-t-2' })).json.transfer;

  const sa = await get('/api/v1/wallets/' + a.id + '/transfers');
  assert.equal(sa.status, 200);
  assert.deepEqual(sa.json.transfers.map((t) => t.id), [t1.id], 'a is sender of t1 only');

  const sb = await get('/api/v1/wallets/' + b.id + '/transfers');
  assert.equal(sb.status, 200);
  assert.deepEqual(sb.json.transfers.map((t) => t.id), [t1.id, t2.id], 'b received t1 and sent t2');

  const sc = await get('/api/v1/wallets/' + c.id + '/transfers');
  assert.equal(sc.status, 200);
  assert.deepEqual(sc.json.transfers.map((t) => t.id), [t2.id], 'c received t2 only');

  const miss = await get('/api/v1/wallets/w_nope/transfers');
  assert.equal(miss.status, 404);
  assert.equal(miss.json.error.code, 'wallet_not_found');
});

test('wallet statement on a wallet with no transfers returns an empty list', async () => {
  const w = (await post('/api/v1/wallets', { owner: 's4-empty' })).json.wallet;
  const r = await get('/api/v1/wallets/' + w.id + '/transfers');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.transfers, []);
});

test('wallet statement rejects non-GET methods with 405', async () => {
  const w = (await post('/api/v1/wallets', { owner: 's4-405' })).json.wallet;
  const r = await api('DELETE', '/api/v1/wallets/' + w.id + '/transfers');
  assert.equal(r.status, 405);
  assert.equal(r.json.error.code, 'method_not_allowed');
});

// --- deposit lookup ----------------------------------------------------------
test('GET /api/v1/deposits/:id returns the deposit; unknown id → 404 deposit_not_found', async () => {
  const w = (await post('/api/v1/wallets', { owner: 's4-depget' })).json.wallet;
  const d = (await post('/api/v1/deposits', { wallet_id: w.id, amount: 777, idempotency_key: 's4-depget-1' })).json.deposit;
  const r = await get('/api/v1/deposits/' + d.id);
  assert.equal(r.status, 200);
  assert.equal(r.json.deposit.id, d.id);
  assert.equal(r.json.deposit.amount, 777);
  const miss = await get('/api/v1/deposits/d_nope');
  assert.equal(miss.status, 404);
  assert.equal(miss.json.error.code, 'deposit_not_found');
});

// --- breaking-nothing: the stage-1 contract is intact ------------------------
test('stage-1 contract intact: create, deposit, transfer, replay, errors', async () => {
  const a = (await post('/api/v1/wallets', { owner: 's4-reg-a' })).json.wallet;
  const b = (await post('/api/v1/wallets', { owner: 's4-reg-b' })).json.wallet;
  assert.equal((await post('/api/v1/deposits', { wallet_id: a.id, amount: 500, idempotency_key: 's4-reg-dep' })).status, 201);
  const p = { from_wallet_id: a.id, to_wallet_id: b.id, amount: 200, idempotency_key: 's4-reg-t' };
  const r1 = await post('/api/v1/transfers', p);
  const r2 = await post('/api/v1/transfers', p);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.equal(r1.json.transfer.id, r2.json.transfer.id, 'replay returns original');
  assert.equal((await post('/api/v1/transfers', { from_wallet_id: a.id, to_wallet_id: b.id, amount: 99999, idempotency_key: 's4-reg-poor' })).status, 422);
  assert.equal((await get('/api/v1/wallets/' + a.id)).json.wallet.balance, 300);
  assert.equal((await get('/health')).status, 200);
});
