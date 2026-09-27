'use strict';
/**
 * server.js — pocketful wallet service, Stage 1 (JSON API).
 *
 * Zero runtime dependencies (Node.js standard library only) so the service
 * builds and serves from a clean container with no outbound network:
 *   node server.js            # PORT env, default 8080
 *
 * Error envelope (provisional — lock field names against the official track
 * spec before submission):
 *   { "error": { "code": "<snake_case>", "message": "<human>" } }
 */
const http = require('http');
const { createStore } = require('./store');

const VERSION = '0.1.0-stage1';

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function err(res, status, code, message) {
  send(res, status, { error: { code, message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function isValidAmount(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function buildServer() {
  const store = createStore();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const method = req.method;

    try {
      // --- health ---------------------------------------------------------
      if (method === 'GET' && path === '/health') {
        return send(res, 200, { status: 'ok', service: 'pocketful', version: VERSION });
      }

      // --- wallets --------------------------------------------------------
      if (method === 'POST' && path === '/api/v1/wallets') {
        const body = await readBody(req);
        if (typeof body.owner !== 'string' || body.owner.trim() === '') {
          return err(res, 400, 'invalid_request', 'owner is required and must be a non-empty string');
        }
        const wallet = store.createWallet(body.owner.trim());
        return send(res, 201, { wallet });
      }
      if (method === 'GET' && path === '/api/v1/wallets') {
        return send(res, 200, { wallets: store.listWallets() });
      }
      {
        const m = path.match(/^\/api\/v1\/wallets\/([^/]+)$/);
        if (m) {
          if (method !== 'GET') return err(res, 405, 'method_not_allowed', 'Method ' + method + ' not allowed on ' + path);
          const wallet = store.getWallet(m[1]);
          if (!wallet) return err(res, 404, 'wallet_not_found', 'No wallet with id ' + m[1]);
          return send(res, 200, { wallet });
        }
      }

      // --- deposits -------------------------------------------------------
      if (method === 'POST' && path === '/api/v1/deposits') {
        const body = await readBody(req);
        if (typeof body.wallet_id !== 'string' || body.wallet_id === '') {
          return err(res, 400, 'invalid_request', 'wallet_id is required');
        }
        if (!isValidAmount(body.amount)) {
          return err(res, 400, 'invalid_amount', 'amount must be a positive integer in minor units');
        }
        if (typeof body.idempotency_key !== 'string' || body.idempotency_key === '') {
          return err(res, 400, 'idempotency_key_required', 'idempotency_key is required');
        }
        const { status, body: out } = await store.applyDeposit({
          wallet_id: body.wallet_id,
          amount: body.amount,
          idempotency_key: body.idempotency_key,
        });
        return send(res, status, out);
      }

      // --- transfers ------------------------------------------------------
      if (method === 'POST' && path === '/api/v1/transfers') {
        const body = await readBody(req);
        for (const f of ['from_wallet_id', 'to_wallet_id']) {
          if (typeof body[f] !== 'string' || body[f] === '') {
            return err(res, 400, 'invalid_request', f + ' is required');
          }
        }
        if (body.from_wallet_id === body.to_wallet_id) {
          return err(res, 422, 'self_transfer_not_allowed', 'from_wallet_id and to_wallet_id must differ');
        }
        if (!isValidAmount(body.amount)) {
          return err(res, 400, 'invalid_amount', 'amount must be a positive integer in minor units');
        }
        if (typeof body.idempotency_key !== 'string' || body.idempotency_key === '') {
          return err(res, 400, 'idempotency_key_required', 'idempotency_key is required');
        }
        const { status, body: out } = await store.applyTransfer({
          from_wallet_id: body.from_wallet_id,
          to_wallet_id: body.to_wallet_id,
          amount: body.amount,
          idempotency_key: body.idempotency_key,
        });
        return send(res, status, out);
      }
      if (method === 'GET' && path === '/api/v1/transfers') {
        return send(res, 200, { transfers: store.listTransfers() });
      }
      {
        const m = path.match(/^\/api\/v1\/transfers\/([^/]+)$/);
        if (m) {
          if (method !== 'GET') return err(res, 405, 'method_not_allowed', 'Method ' + method + ' not allowed on ' + path);
          const transfer = store.getTransfer(m[1]);
          if (!transfer) return err(res, 404, 'transfer_not_found', 'No transfer with id ' + m[1]);
          return send(res, 200, { transfer });
        }
      }

      return err(res, 404, 'not_found', 'No route for ' + method + ' ' + path);
    } catch (e) {
      if (e instanceof SyntaxError) {
        return err(res, 400, 'invalid_json', 'Request body is not valid JSON');
      }
      // Never leak a 500 for a client error; unknown server faults stay loud.
      console.error('unhandled request error:', e);
      return err(res, 500, 'internal_error', 'Unexpected server error');
    }
  });

  return { server, store };
}

function startServer(port) {
  const { server } = buildServer();
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '8080', 10);
  startServer(port).then((server) => {
    console.log('pocketful ' + VERSION + ' listening on 127.0.0.1:' + server.address().port);
  });
}

module.exports = { buildServer, startServer, VERSION };
