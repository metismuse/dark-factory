'use strict';
/**
 * golden.test.js — the full gate. Run:  node --test tests/golden.test.js
 *
 * Every test boots a FRESH service instance on an ephemeral port and tears it
 * down afterwards. No test depends on another test's side effects.
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

async function api(method, path, body, raw) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = raw ? body : JSON.stringify(body);
  }
  const res = await fetch(base + path, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const post = (p, b) => api('POST', p, b);
const get = (p) => api('GET', p);

async function makeWallet(owner) {
  const r = await post('/api/v1/wallets', { owner });
  assert.equal(r.status, 201);
  return r.json.wallet;
}

async function fund(walletId, amount, key) {
  const r = await post('/api/v1/deposits', {
    wallet_id: walletId,
    amount,
    idempotency_key: key,
  });
  assert.equal(r.status, 201);
  return r.json.deposit;
}

// --- health ---------------------------------------------------------------
test('health reports ok', async () => {
  const r = await get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

// --- wallets --------------------------------------------------------------
test('create wallet returns 201 with zero balance', async () => {
  const r = await post('/api/v1/wallets', { owner: 'alice' });
  assert.equal(r.status, 201);
  assert.equal(r.json.wallet.owner, 'alice');
  assert.equal(r.json.wallet.balance, 0);
  assert.equal(r.json.wallet.currency, 'USD');
  assert.match(r.json.wallet.id, /^w_[0-9a-f]{32}$/);
});

test('create wallet without owner is 400, never 500', async () => {
  for (const body of [{}, { owner: '' }, { owner: 42 }]) {
    const r = await post('/api/v1/wallets', body);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'invalid_request');
  }
});

test('get wallet round-trips; missing wallet is 404', async () => {
  const w = await makeWallet('bob');
  const r = await get('/api/v1/wallets/' + w.id);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.wallet, w);
  const miss = await get('/api/v1/wallets/w_deadbeef');
  assert.equal(miss.status, 404);
  assert.equal(miss.json.error.code, 'wallet_not_found');
});

// --- transfers ------------------------------------------------------------
test('transfer moves money and records the transfer', async () => {
  const a = await makeWallet('carol');
  const b = await makeWallet('dave');
  await fund(a.id, 1000, 'k-dep-1');
  const r = await post('/api/v1/transfers', {
    from_wallet_id: a.id, to_wallet_id: b.id, amount: 400, idempotency_key: 'k-t-1',
  });
  assert.equal(r.status, 201);
  assert.match(r.json.transfer.id, /^t_[0-9a-f]{32}$/);
  assert.equal(r.json.transfer.amount, 400);
  assert.equal((await get('/api/v1/wallets/' + a.id)).json.wallet.balance, 600);
  assert.equal((await get('/api/v1/wallets/' + b.id)).json.wallet.balance, 400);
});

test('insufficient funds is 422 and moves nothing', async () => {
  const a = await makeWallet('erin');
  const b = await makeWallet('frank');
  await fund(a.id, 100, 'k-dep-2');
  const r = await post('/api/v1/transfers', {
    from_wallet_id: a.id, to_wallet_id: b.id, amount: 101, idempotency_key: 'k-t-2',
  });
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, 'insufficient_funds');
  assert.equal((await get('/api/v1/wallets/' + a.id)).json.wallet.balance, 100);
  assert.equal((await get('/api/v1/wallets/' + b.id)).json.wallet.balance, 0);
});

test('unknown wallets are 404; bad amounts are 400', async () => {
  const a = await makeWallet('gail');
  const b = await makeWallet('hank');
  await fund(a.id, 500, 'k-dep-3');
  const badWallet = await post('/api/v1/transfers', {
    from_wallet_id: 'w_nope', to_wallet_id: b.id, amount: 10, idempotency_key: 'k-t-3',
  });
  assert.equal(badWallet.status, 404);
  for (const amount of [0, -5, 1.5, '10', null]) {
    const r = await post('/api/v1/transfers', {
      from_wallet_id: a.id, to_wallet_id: b.id, amount, idempotency_key: 'k-t-4-' + String(amount),
    });
    assert.equal(r.status, 400, 'amount=' + JSON.stringify(amount));
    assert.equal(r.json.error.code, 'invalid_amount');
  }
});

test('self transfer is 422', async () => {
  const a = await makeWallet('iris');
  await fund(a.id, 500, 'k-dep-4');
  const r = await post('/api/v1/transfers', {
    from_wallet_id: a.id, to_wallet_id: a.id, amount: 10, idempotency_key: 'k-t-5',
  });
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, 'self_transfer_not_allowed');
});

test('missing idempotency key is 400', async () => {
  const a = await makeWallet('jack');
  const b = await makeWallet('kate');
  await fund(a.id, 500, 'k-dep-5');
  const r = await post('/api/v1/transfers', { from_wallet_id: a.id, to_wallet_id: b.id, amount: 10 });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'idempotency_key_required');
});

// --- exactly-once ----------------------------------------------------------
test('idempotent replay returns the original response and moves money once', async () => {
  const a = await makeWallet('leo');
  const b = await makeWallet('mia');
  await fund(a.id, 1000, 'k-dep-6');
  const payload = { from_wallet_id: a.id, to_wallet_id: b.id, amount: 250, idempotency_key: 'k-t-6' };
  const first = await post('/api/v1/transfers', payload);
  assert.equal(first.status, 201);
  const replay = await post('/api/v1/transfers', payload);
  assert.equal(replay.status, 201); // the original stored response, per the exactly-once invariant
  assert.deepEqual(replay.json, first.json);
  assert.equal((await get('/api/v1/wallets/' + a.id)).json.wallet.balance, 750);
  assert.equal((await get('/api/v1/wallets/' + b.id)).json.wallet.balance, 250);
});

test('same key with different payload is 409 and touches nothing', async () => {
  const a = await makeWallet('nina');
  const b = await makeWallet('omar');
  const c = await makeWallet('pam');
  await fund(a.id, 1000, 'k-dep-7');
  const first = await post('/api/v1/transfers', {
    from_wallet_id: a.id, to_wallet_id: b.id, amount: 100, idempotency_key: 'k-t-7',
  });
  assert.equal(first.status, 201);
  const conflict = await post('/api/v1/transfers', {
    from_wallet_id: a.id, to_wallet_id: c.id, amount: 100, idempotency_key: 'k-t-7',
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, 'idempotency_key_reused');
  assert.equal((await get('/api/v1/wallets/' + c.id)).json.wallet.balance, 0);
});

test('concurrent duplicate submissions move money exactly once', async () => {
  const a = await makeWallet('quinn');
  const b = await makeWallet('ruth');
  await fund(a.id, 1000, 'k-dep-8');
  const payload = { from_wallet_id: a.id, to_wallet_id: b.id, amount: 300, idempotency_key: 'k-t-8' };
  const results = await Promise.all([post('/api/v1/transfers', payload), post('/api/v1/transfers', payload)]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 201]); // both get the original stored response; effect applied once
  assert.equal(results[0].json.transfer.id, results[1].json.transfer.id);
  assert.equal((await get('/api/v1/wallets/' + a.id)).json.wallet.balance, 700);
  assert.equal((await get('/api/v1/wallets/' + b.id)).json.wallet.balance, 300);
});

// --- conservation storm -----------------------------------------------------
test('conservation: 500 concurrent random transfers preserve the total', async () => {
  const wallets = [];
  let deposited = 0;
  for (let i = 0; i < 5; i++) {
    const w = await makeWallet('storm-' + i);
    await fund(w.id, 10000, 'k-storm-dep-' + i);
    deposited += 10000;
    wallets.push(w.id);
  }
  let n = 0;
  const jobs = [];
  for (let i = 0; i < 500; i++) {
    const from = wallets[i % 5];
    const to = wallets[(i + 1) % 5];
    const amount = 1 + ((i * 37) % 500);
    jobs.push(post('/api/v1/transfers', {
      from_wallet_id: from, to_wallet_id: to, amount, idempotency_key: 'k-storm-' + (n++),
    }));
  }
  const results = await Promise.all(jobs);
  for (const r of results) {
    assert.ok(r.status === 201 || r.status === 422, 'unexpected status ' + r.status);
  }
  let total = 0;
  for (const id of wallets) {
    const w = (await get('/api/v1/wallets/' + id)).json.wallet;
    assert.ok(w.balance >= 0, 'negative balance on ' + id);
    total += w.balance;
  }
  assert.equal(total, deposited, 'conservation violated: total moved');
});

// --- malformed input ----------------------------------------------------------
test('malformed JSON is 400; unknown route is 404; wrong method is 405', async () => {
  const bad = await api('POST', '/api/v1/wallets', '{not json', true);
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'invalid_json');
  const lost = await get('/api/v1/nonexistent');
  assert.equal(lost.status, 404);
  assert.equal(lost.json.error.code, 'not_found');
  const w = await makeWallet('sam');
  const wrong = await api('DELETE', '/api/v1/wallets/' + w.id);
  assert.equal(wrong.status, 405);
});
