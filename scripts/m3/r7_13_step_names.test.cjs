'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {baseEncode} = require('@near-js/utils');

const {
  callSignedOnce,
  readStep
} = require('./r7_13_tx_guard.cjs');

test('all rescue method names are valid journal steps', () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'r713-methods-')
  );

  fs.chmodSync(dir, 0o700);

  try {
    const methods = [
      'create_rescue_case',
      'create_funded_rescue_job',
      'accept_rescue_job',
      'post_rescue_offer',
      'register_r7_v2_consent',
      'award_r7_v2_bundle',
      'release_open_rescue_offer',
      'submit_rescue_component',
      'settle_rescue_bundle',
      'complete_rescue_job'
    ];

    for (const method of methods) {
      assert.equal(
        readStep(dir, 'bootstrap', method),
        null
      );
    }

    assert.throws(
      () => readStep(dir, 'bootstrap', '../escape')
    );
    assert.throws(
      () => readStep(dir, 'bootstrap', 'bad/step')
    );

  } finally {
    fs.rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});

test('bootstrap create_rescue_case signs and journals once', async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'r713-bootstrap-')
  );

  fs.chmodSync(dir, 0o700);

  let signatures = 0;
  let sends = 0;
  let reads = 0;
  let legacyCalls = 0;

  const txBytes = Buffer.from(
    'synthetic-bootstrap-signed-transaction'
  );

  const hash = crypto.createHash('sha256')
    .update(txBytes)
    .digest();

  const encoded = baseEncode(hash);

  const account = {
    accountId: 'creator.testnet',
    accessKeyByPublicKeyCache: {stale: true},

    async signTransaction(receiver, actions) {
      signatures++;

      assert.equal(receiver, 'contract.testnet');
      assert.equal(actions.length, 1);
      assert.deepEqual(
        this.accessKeyByPublicKeyCache, {}
      );

      return [
        hash,
        {
          transaction: {
            encode() {
              return txBytes;
            }
          },
          encode() {
            return Buffer.alloc(192, 11);
          }
        }
      ];
    },

    async functionCall() {
      legacyCalls++;
      throw Error('Legacy functionCall forbidden');
    },

    connection: {
      provider: {
        async sendTransaction() {
          legacyCalls++;
          throw Error('Legacy sendTransaction forbidden');
        }
      }
    }
  };

  async function rpcExchange(method, params) {
    if (method === 'send_tx') {
      sends++;

      assert.equal(params.wait_until, 'NONE');
      assert.deepEqual(
        Object.keys(params).sort(),
        ['signed_tx_base64', 'wait_until']
      );

      assert.equal(
        Buffer.from(
          params.signed_tx_base64,
          'base64'
        ).length,
        192
      );

      const row = readStep(
        dir,
        'bootstrap',
        'create_rescue_case'
      );

      assert.equal(row.state, 'signed_not_confirmed');
      assert.equal(row.tx, encoded);

      return {final_execution_status: 'NONE'};
    }

    assert.equal(method, 'tx');

    reads++;

    assert.deepEqual(params, {
      tx_hash: encoded,
      sender_account_id: 'creator.testnet',
      wait_until: 'FINAL'
    });

    return {
      final_execution_status: 'FINAL',
      transaction: {
        signer_id: 'creator.testnet',
        receiver_id: 'contract.testnet',
        hash: encoded
      },
      status: {
        SuccessValue: Buffer.from(
          JSON.stringify([1, 2, 3])
        ).toString('base64')
      },
      receipts_outcome: []
    };
  }

  const cfg = {
    dir,
    role: 'bootstrap',
    step: 'create_rescue_case',
    account,
    rpcExchange,
    contractId: 'contract.testnet',
    method: 'create_rescue_case',
    args: {descriptor: {descriptor_version: 1}},
    deposit: 100n
  };

  try {
    const result = await callSignedOnce(cfg);

    assert.deepEqual(result.value, [1, 2, 3]);
    assert.equal(result.tx, encoded);

    assert.equal(
      readStep(
        dir,
        'bootstrap',
        'create_rescue_case'
      ).state,
      'confirmed'
    );

    await assert.rejects(
      () => callSignedOnce(cfg),
      /already prepared or executed/
    );

    assert.equal(signatures, 1);
    assert.equal(sends, 1);
    assert.equal(reads, 1);
    assert.equal(legacyCalls, 0);

  } finally {
    fs.rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});
