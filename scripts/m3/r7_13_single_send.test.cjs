'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {baseEncode} = require('@near-js/utils');

const {
  callSignedOnce,
  readStep
} = require('./r7_13_tx_guard.cjs');

function directory() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nmg-r713-single-')
  );
  fs.chmodSync(dir, 0o700);
  return dir;
}

function scenario(dir, fail) {
  const hash = Buffer.alloc(32, 7);
  const encoded = baseEncode(hash);

  let signatures = 0;
  let sends = 0;

  const account = {
    accountId: 'buyer.testnet',
    accessKeyByPublicKeyCache: {stale: {nonce: 4n}},

    async signTransaction(receiver, actions) {
      signatures++;
      assert.equal(receiver, 'contract.testnet');
      assert.equal(actions.length, 1);
      assert.deepEqual(
        this.accessKeyByPublicKeyCache, {}
      );
      return [hash, {signed_once: true}];
    },

    async functionCall() {
      throw Error('SDK automatic retry path forbidden');
    },

    connection: {
      provider: {
        async sendTransaction(tx) {
          sends++;
          assert.equal(tx.signed_once, true);

          // The hash must be persisted BEFORE
          // this method sees the transaction.
          const record = readStep(
            dir, 'buyer-1', 'fund'
          );

          assert.equal(
            record.state, 'signed_not_confirmed'
          );
          assert.equal(record.tx, encoded);

          if (fail) {
            throw Error('uncertain broadcast');
          }

          return {
            transaction: {
              signer_id: 'buyer.testnet',
              receiver_id: 'contract.testnet',
              hash: encoded
            },
            status: {
              SuccessValue:
                Buffer.from('17').toString('base64')
            },
            receipts_outcome: []
          };
        }
      }
    }
  };

  return {
    account,
    counts: () => ({signatures, sends})
  };
}

function options(dir, account) {
  return {
    dir,
    role: 'buyer-1',
    step: 'fund',
    account,
    contractId: 'contract.testnet',
    method: 'create_funded_rescue_job',
    args: {input: {value: 7}},
    deposit: 10n
  };
}

test('one signed hash, one send, confirmed', async () => {
  const dir = directory();

  try {
    const {account, counts} = scenario(dir, false);
    const cfg = options(dir, account);

    const result = await callSignedOnce(cfg);

    assert.equal(result.value, 17);
    assert.equal(
      readStep(dir, 'buyer-1', 'fund').state,
      'confirmed'
    );

    await assert.rejects(
      () => callSignedOnce(cfg),
      /already prepared or executed/
    );

    assert.deepEqual(counts(), {
      signatures: 1,
      sends: 1
    });

  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('uncertain send preserves hash, forbids retry', async () => {
  const dir = directory();

  try {
    const {account, counts} = scenario(dir, true);
    const cfg = options(dir, account);

    await assert.rejects(
      () => callSignedOnce(cfg),
      /uncertain broadcast/
    );

    const record = readStep(dir, 'buyer-1', 'fund');

    assert.equal(
      record.state, 'signed_not_confirmed'
    );
    assert.equal(
      typeof record.tx, 'string'
    );
    assert(record.tx.length > 30);

    await assert.rejects(
      () => callSignedOnce(cfg),
      /already prepared or executed/
    );

    assert.deepEqual(counts(), {
      signatures: 1,
      sends: 1
    });

  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
