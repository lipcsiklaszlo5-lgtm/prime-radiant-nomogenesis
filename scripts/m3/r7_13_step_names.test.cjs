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

  const hash = Buffer.alloc(32, 11);
  const encoded = baseEncode(hash);

  const account = {
    accountId: 'creator.testnet',

    accessKeyByPublicKeyCache: {},

    async signTransaction() {
      signatures++;
      return [hash, {mock: true}];
    },

    connection: {
      provider: {
        async sendTransaction() {
          sends++;

          const row = readStep(
            dir,
            'bootstrap',
            'create_rescue_case'
          );

          assert.equal(
            row.state,
            'signed_not_confirmed'
          );

          assert.equal(row.tx, encoded);

          return {
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
      }
    }
  };

  const cfg = {
    dir,
    role: 'bootstrap',
    step: 'create_rescue_case',
    account,
    contractId: 'contract.testnet',
    method: 'create_rescue_case',
    args: {descriptor: {descriptor_version: 1}},
    deposit: 100n
  };

  try {
    const result = await callSignedOnce(cfg);

    assert.deepEqual(result.value, [1, 2, 3]);
    assert.equal(result.tx, encoded);
    assert.equal(signatures, 1);
    assert.equal(sends, 1);

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

  } finally {
    fs.rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});
