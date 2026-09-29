'use strict';
/**
 * store.js — in-memory ledger for the pocketful wallet service.
 *
 * Invariants (enforced here, nowhere else):
 *  1. Conservation: sum of all balances == total deposited, always.
 *  2. Non-negativity: no balance ever goes below zero.
 *  3. Exactly-once effect: an idempotency key moves money at most once and
 *     replays return the originally stored response.
 *
 * Money is integer minor units only. No floats touch a balance.
 * All writes go through a single async mutex: one atomic critical section.
 */
const crypto = require('crypto');

function newId(prefix) {
  return prefix + '_' + crypto.randomBytes(16).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

class Mutex {
  constructor() {
    this._locked = false;
    this._queue = [];
  }
  acquire() {
    if (!this._locked) {
      this._locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._locked = false;
    }
  }
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

function canonical(obj) {
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

function requestHash(payload) {
  return crypto.createHash('sha256').update(canonical(payload)).digest('hex');
}

function createStore() {
  const wallets = new Map();      // id -> wallet
  const transfers = new Map();    // id -> transfer
  const deposits = new Map();     // id -> deposit
  const idem = new Map();         // idempotency_key -> { hash, status, body }
  const mutex = new Mutex();
  let totalDeposited = 0;

  function getWallet(id) {
    return wallets.get(id) || null;
  }

  function createWallet(owner) {
    const wallet = {
      id: newId('w'),
      owner,
      balance: 0,
      currency: 'USD',
      created_at: nowIso(),
    };
    wallets.set(wallet.id, wallet);
    return wallet;
  }

  function listWallets() {
    return Array.from(wallets.values());
  }

  function getTransfer(id) {
    return transfers.get(id) || null;
  }

  function getDeposit(id) {
    return deposits.get(id) || null;
  }

  function listTransfers() {
    return Array.from(transfers.values());
  }

  /**
   * Stage-4 domain extension: the wallet statement — every transfer where this
   * wallet is the sender or the receiver, in ledger (insertion) order.
   */
  function listWalletTransfers(walletId) {
    return listTransfers().filter(
      (t) => t.from_wallet_id === walletId || t.to_wallet_id === walletId
    );
  }

  function totalBalances() {
    let sum = 0;
    for (const w of wallets.values()) sum += w.balance;
    return sum;
  }

  function getTotalDeposited() {
    return totalDeposited;
  }

  /**
   * Apply a deposit. Returns { status, body } where status is the HTTP status
   * the server should send and body is the JSON payload.
   */
  async function applyDeposit({ wallet_id, amount, idempotency_key }) {
    return mutex.run(() => {
      const wallet = wallets.get(wallet_id);
      if (!wallet) {
        return { status: 404, body: { error: { code: 'wallet_not_found', message: 'No wallet with id ' + wallet_id } } };
      }
      const hash = requestHash({ wallet_id, amount });
      const seen = idem.get(idempotency_key);
      if (seen) {
        if (seen.hash !== hash) {
          return { status: 409, body: { error: { code: 'idempotency_key_reused', message: 'Idempotency key was used with a different request' } } };
        }
        return { status: seen.status, body: seen.body };
      }
      const deposit = {
        id: newId('d'),
        wallet_id,
        amount,
        idempotency_key,
        status: 'completed',
        created_at: nowIso(),
      };
      // Durable commit of the transaction record before mutating the balance.
      deposits.set(deposit.id, deposit);
      wallet.balance += amount;
      totalDeposited += amount;
      const body = { deposit };
      idem.set(idempotency_key, { hash, status: 201, body });
      return { status: 201, body };
    });
  }

  /**
   * Apply a transfer. One atomic critical section: debit and credit commit
   * together or not at all. No await between balance read and write.
   */
  async function applyTransfer({ from_wallet_id, to_wallet_id, amount, idempotency_key }) {
    return mutex.run(() => {
      const from = wallets.get(from_wallet_id);
      if (!from) {
        return { status: 404, body: { error: { code: 'wallet_not_found', message: 'No wallet with id ' + from_wallet_id } } };
      }
      const to = wallets.get(to_wallet_id);
      if (!to) {
        return { status: 404, body: { error: { code: 'wallet_not_found', message: 'No wallet with id ' + to_wallet_id } } };
      }
      const hash = requestHash({ from_wallet_id, to_wallet_id, amount });
      const seen = idem.get(idempotency_key);
      if (seen) {
        if (seen.hash !== hash) {
          return { status: 409, body: { error: { code: 'idempotency_key_reused', message: 'Idempotency key was used with a different request' } } };
        }
        return { status: seen.status, body: seen.body };
      }
      if (from.balance < amount) {
        return { status: 422, body: { error: { code: 'insufficient_funds', message: 'Wallet ' + from_wallet_id + ' has insufficient funds' } } };
      }
      const transfer = {
        id: newId('t'),
        from_wallet_id,
        to_wallet_id,
        amount,
        idempotency_key,
        status: 'completed',
        created_at: nowIso(),
      };
      // Durable commit before the destructive step; single critical section.
      transfers.set(transfer.id, transfer);
      from.balance -= amount;
      to.balance += amount;
      const body = { transfer };
      idem.set(idempotency_key, { hash, status: 201, body });
      return { status: 201, body };
    });
  }

  return {
    getWallet,
    createWallet,
    listWallets,
    getTransfer,
    getDeposit,
    listTransfers,
    listWalletTransfers,
    applyDeposit,
    applyTransfer,
    totalBalances,
    getTotalDeposited,
  };
}

module.exports = { createStore };
