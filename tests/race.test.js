'use strict';
/**
 * race.test.js — race-hunter adversary sweep (Stage 3).
 *
 * Goes beyond the golden suite: concurrent overdraft storms, idempotency-key
 * races (same payload, different payload, cross-endpoint), distinct-key
 * bursts, and adversarial amounts/bodies. Every test boots a FRESH service
 * instance so storm tests get isolated state.
 *
 * Run:  node --test tests/race.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../app/server');

async function boot() {
  const built = buildServer();
  const server = built.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, store: built.store, close };
}

async function api(base, method, path, body, raw) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = raw ? body : JSON.stringify(body);
  }
  const res = await fetch(base + path, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function mk(base, owner) {
  const r = await api(base, 'POST', '/api/v1/wallets', { owner });
  assert.equal(r.status, 201);
  return r.json.wallet;
}

async function fund(base, walletId, amount, key) {
  const r = await api(base, 'POST', '/api/v1/deposits', { wallet_id: walletId, amount, idempotency_key: key });
  assert.equal(r.status, 201);
  return r.json.deposit;
}

async function balance(base, id) {
  const r = await api(base, 'GET', '/api/v1/wallets/' + id);
  assert.equal(r.status, 200);
  return r.json.wallet.balance;
}

function xfer(base, from, to, amount, key) {
  return api(base, 'POST', '/api/v1/transfers', {
    from_wallet_id: from, to_wallet_id: to, amount, idempotency_key: key,
  });
}

// --- overdraft storm -------------------------------------------------------
test('overdraft storm: 100 concurrent transfers of 1000 against a 5000 balance → exactly 5 succeed, nothing negative', async () => {
  const { base, close } = await boot();
  try {
    const a = await mk(base, 'storm-a');
    const b = await mk(base, 'storm-b');
    await fund(base, a.id, 5000, 'storm-dep');
    const reqs = [];
    for (let i = 0; i < 100; i++) reqs.push(xfer(base, a.id, b.id, 1000, 'storm-x-' + i));
    const rs = await Promise.all(reqs);
    const ok = rs.filter((r) => r.status === 201);
    const poor = rs.filter((r) => r.status === 422 && r.json.error.code === 'insufficient_funds');
    assert.equal(ok.length, 5, 'exactly 5 transfers may succeed');
    assert.equal(poor.length, 95, 'the other 95 must be 422 insufficient_funds');
    const ba = await balance(base, a.id);
    const bb = await balance(base, b.id);
    assert.equal(ba, 0);
    assert.equal(bb, 5000);
    assert.ok(ba >= 0 && bb >= 0, 'no negative balances');
  } finally { await close(); }
});

// --- same-key replay race --------------------------------------------------
test('same-key race: 50 concurrent identical transfers → one transfer, money moves once', async () => {
  const { base, close } = await boot();
  try {
    const a = await mk(base, 'race-a');
    const b = await mk(base, 'race-b');
    await fund(base, a.id, 100000, 'race-dep');
    const payload = () => xfer(base, a.id, b.id, 7000, 'race-same-key');
    const rs = await Promise.all(Array.from({ length: 50 }, payload));
    const ids = new Set(rs.map((r) => r.json.transfer && r.json.transfer.id));
    assert.ok(rs.every((r) => r.status === 201), 'every replay returns the original 201');
    assert.equal(ids.size, 1, 'all 50 responses carry the same transfer id');
    const list = await api(base, 'GET', '/api/v1/transfers');
    assert.equal(list.json.transfers.length, 1, 'exactly one transfer exists in the ledger');
    assert.equal(await balance(base, a.id), 93000);
    assert.equal(await balance(base, b.id), 7000);
  } finally { await close(); }
});

// --- same-key, different-payload race --------------------------------------
test('same-key/different-payload race: exactly one 201, rest 409, ledger has one transfer', async () => {
  const { base, close } = await boot();
  try {
    const a = await mk(base, 'keyfight-a');
    const b = await mk(base, 'keyfight-b');
    const c = await mk(base, 'keyfight-c');
    await fund(base, a.id, 100000, 'keyfight-dep');
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      xfer(base, a.id, i % 2 ? b.id : c.id, 1000 + i, 'keyfight-same')));
    const ok = rs.filter((r) => r.status === 201);
    const conflict = rs.filter((r) => r.status === 409 && r.json.error.code === 'idempotency_key_reused');
    assert.equal(ok.length, 1, 'exactly one request wins the key');
    assert.equal(conflict.length, 29, 'all others are 409 idempotency_key_reused');
    const list = await api(base, 'GET', '/api/v1/transfers');
    assert.equal(list.json.transfers.length, 1, 'exactly one transfer in the ledger');
    const ba = await balance(base, a.id);
    assert.equal(ba + (await balance(base, b.id)) + (await balance(base, c.id)), 100000, 'conservation holds');
    assert.ok(ba >= 0);
  } finally { await close(); }
});

// --- deposit same-key race --------------------------------------------------
test('deposit same-key race: 30 concurrent identical deposits → balance increases exactly once', async () => {
  const { base, close } = await boot();
  try {
    const w = await mk(base, 'deperace');
    const rs = await Promise.all(Array.from({ length: 30 }, () =>
      api(base, 'POST', '/api/v1/deposits', { wallet_id: w.id, amount: 2500, idempotency_key: 'dep-race-key' })));
    assert.ok(rs.every((r) => r.status === 201), 'all replays return 201 with the stored response');
    const ids = new Set(rs.map((r) => r.json.deposit.id));
    assert.equal(ids.size, 1, 'one deposit record');
    assert.equal(await balance(base, w.id), 2500, 'balance increased exactly once');
  } finally { await close(); }
});

// --- distinct-key burst -----------------------------------------------------
test('distinct-key burst: 400 concurrent transfers across 10 wallets → conservation, no negatives', async () => {
  const { base, store, close } = await boot();
  try {
    const wallets = [];
    for (let i = 0; i < 10; i++) {
      const w = await mk(base, 'burst-' + i);
      await fund(base, w.id, 10000, 'burst-dep-' + i);
      wallets.push(w.id);
    }
    const reqs = [];
    for (let i = 0; i < 400; i++) {
      const from = wallets[i % 10];
      const to = wallets[(i + 3) % 10];
      reqs.push(xfer(base, from, to, 100 + (i % 50), 'burst-x-' + i));
    }
    const rs = await Promise.all(reqs);
    assert.ok(rs.every((r) => r.status === 201), 'all 400 succeed (ample funds, distinct keys)');
    assert.equal(store.totalBalances(), 100000, 'sum(balances) == total deposited');
    assert.equal(store.totalBalances(), store.getTotalDeposited(), 'ledger agrees with wallet sums');
    const all = await api(base, 'GET', '/api/v1/wallets');
    assert.ok(all.json.wallets.every((w) => w.balance >= 0), 'no negative balances');
  } finally { await close(); }
});

// --- adversarial amounts ----------------------------------------------------
test('adversarial amounts: floats, strings, zero, negatives, null, booleans → 400 invalid_amount, balances untouched', async () => {
  const { base, close } = await boot();
  try {
    const a = await mk(base, 'adv-a');
    const b = await mk(base, 'adv-b');
    await fund(base, a.id, 1000, 'adv-dep');
    const bad = [1.5, '1000', 0, -5, null, true, 1e-7, NaN];
    for (let i = 0; i < bad.length; i++) {
      const r = await xfer(base, a.id, b.id, bad[i], 'adv-x-' + i);
      assert.equal(r.status, 400, 'amount ' + String(bad[i]) + ' must be 400');
      assert.equal(r.json.error.code, 'invalid_amount');
    }
    // huge-but-integer amount is valid as a request, fails on funds, moves nothing
    const huge = await xfer(base, a.id, b.id, Number.MAX_SAFE_INTEGER, 'adv-huge');
    assert.equal(huge.status, 422);
    assert.equal(huge.json.error.code, 'insufficient_funds');
    assert.equal(await balance(base, a.id), 1000);
    assert.equal(await balance(base, b.id), 0);
  } finally { await close(); }
});

// --- adversarial bodies -----------------------------------------------------
test('adversarial bodies: array body and nested junk → 400; unicode/emoji owner accepted', async () => {
  const { base, close } = await boot();
  try {
    const arr = await api(base, 'POST', '/api/v1/wallets', JSON.stringify([1, 2, 3]), true);
    assert.equal(arr.status, 400);
    assert.equal(arr.json.error.code, 'invalid_request');
    const nested = await api(base, 'POST', '/api/v1/wallets', { owner: { deep: ['x'] } });
    assert.equal(nested.status, 400);
    const emoji = await api(base, 'POST', '/api/v1/wallets', { owner: 'Saoirse 🌊 日本語' });
    assert.equal(emoji.status, 201);
    assert.equal(emoji.json.wallet.owner, 'Saoirse 🌊 日本語');
    const ws = await api(base, 'POST', '/api/v1/wallets', { owner: '   ' });
    assert.equal(ws.status, 400);
  } finally { await close(); }
});

// --- cross-endpoint key reuse ----------------------------------------------
test('idempotency keys are global: a deposit key reused for a transfer → 409', async () => {
  const { base, close } = await boot();
  try {
    const a = await mk(base, 'xep-a');
    const b = await mk(base, 'xep-b');
    const d = await api(base, 'POST', '/api/v1/deposits', { wallet_id: a.id, amount: 500, idempotency_key: 'xep-shared' });
    assert.equal(d.status, 201);
    const t = await xfer(base, a.id, b.id, 100, 'xep-shared');
    assert.equal(t.status, 409);
    assert.equal(t.json.error.code, 'idempotency_key_reused');
    assert.equal(await balance(base, a.id), 500, 'deposit still applied exactly once');
  } finally { await close(); }
});
