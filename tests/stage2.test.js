'use strict';
/**
 * stage2.test.js — Stage 2 web UI gate. Run:  node --test tests/stage2.test.js
 *
 * Verifies the static UI is served at GET / (200, text/html) and carries every
 * provisional data-testid from SPEC.json ui.testids. The testid VALUES are
 * provisional — the official track spec defines the exact values; rename at
 * spec-lock time. What this suite locks in: the UI exists, is served with the
 * right content type, has exactly one of each testid (no duplicates, none
 * missing), and the API behind it is live.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildServer } = require('../app/server');

const TESTIDS = ['app-title', 'wallet-create-form', 'wallet-owner-input', 'wallet-create-submit',
  'wallet-list', 'wallet-detail', 'wallet-id', 'wallet-balance', 'deposit-form',
  'deposit-amount-input', 'deposit-submit', 'transfer-form', 'transfer-to-input',
  'transfer-amount-input', 'transfer-submit', 'transfer-list', 'error-message'];

let base;
let server;
let html;

test.before(async () => {
  const built = buildServer();
  server = built.server;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const res = await fetch(base + '/');
  html = await res.text();
  assert.equal(res.status, 200);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET / serves HTML with the right content type', async () => {
  const res = await fetch(base + '/');
  const ct = res.headers.get('content-type') || '';
  assert.ok(ct.includes('text/html'), 'content-type=' + ct);
  const body = await res.text();
  assert.ok(body.trimStart().startsWith('<!DOCTYPE html>'));
});

test('GET /index.html serves the same UI', async () => {
  const res = await fetch(base + '/index.html');
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') || '').includes('text/html'));
});

test('every provisional data-testid is present exactly once', () => {
  for (const t of TESTIDS) {
    const re = new RegExp('data-testid="' + t + '"', 'g');
    const n = (html.match(re) || []).length;
    assert.equal(n, 1, 'testid ' + t + ' occurs ' + n + ' times, expected exactly 1');
  }
});

test('no testid is duplicated or mistyped-adjacent', () => {
  const found = [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(found.length, TESTIDS.length, 'found ' + found.length + ' testids, expected ' + TESTIDS.length);
  assert.deepEqual([...found].sort(), [...TESTIDS].sort());
});

test('UI has no external network dependencies (zero-deps gate)', () => {
  assert.ok(!html.includes('src="http'), 'no remote scripts');
  assert.ok(!html.includes('href="http'), 'no remote stylesheets');
  assert.ok(!html.includes('cdn.'), 'no CDN references');
});

test('API behind the UI is live: create wallet + deposit round trip', async () => {
  const mk = await fetch(base + '/api/v1/wallets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner: 'stage2-ui-probe' }),
  });
  assert.equal(mk.status, 201);
  const wallet = (await mk.json()).wallet;
  const dep = await fetch(base + '/api/v1/deposits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_id: wallet.id, amount: 777, idempotency_key: 'stage2-ui-1' }),
  });
  assert.equal(dep.status, 201);
  const got = await (await fetch(base + '/api/v1/wallets/' + wallet.id)).json();
  assert.equal(got.wallet.balance, 777);
});
