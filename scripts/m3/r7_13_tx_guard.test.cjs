'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  callOnce, readStep
} = require('./r7_13_tx_guard.cjs');

function sandbox() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nmg-r713-journal-')
  );
  fs.chmodSync(dir, 0o700);
  return dir;
}

function options(dir, account, step) {
  return {
    dir,
    role: 'buyer-1',
    step,
    account,
    contractId: 'contract.testnet',
    method: 'create_funded_rescue_job',
    args: {input: {value: 7}},
    deposit: 10n
  };
}

test('confirmed transaction cannot be submitted twice', async () => {
  const dir = sandbox();
  let calls = 0;

  try {
    const account = {
      accountId: 'buyer.testnet',
      async functionCall() {
        calls++;

        return {
          transaction: {
            signer_id: 'buyer.testnet',
            receiver_id: 'contract.testnet',
            hash: 'test-confirmed-hash'
          },
          status: {
            SuccessValue: Buffer.from('17').toString('base64')
          },
          receipts_outcome: []
        };
      }
    };

    const cfg = options(dir, account, 'fund');

    const first = await callOnce(cfg);

    assert.equal(first.tx, 'test-confirmed-hash');
    assert.equal(first.value, 17);

    assert.equal(
      readStep(dir, 'buyer-1', 'fund').state,
      'confirmed'
    );

    await assert.rejects(
      () => callOnce(cfg),
      /already prepared or executed/
    );

    assert.equal(calls, 1);

  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('uncertain broadcast fails closed on retry', async () => {
  const dir = sandbox();
  let calls = 0;

  try {
    const account = {
      accountId: 'buyer.testnet',
      async functionCall() {
        calls++;
        throw Error('simulated RPC timeout after broadcast');
      }
    };

    const cfg = options(dir, account, 'uncertain-fund');

    await assert.rejects(
      () => callOnce(cfg),
      /simulated RPC timeout/
    );

    const record = readStep(
      dir, 'buyer-1', 'uncertain-fund'
    );

    assert.equal(record.state, 'prepared');
    assert.equal(record.tx, null);

    await assert.rejects(
      () => callOnce(cfg),
      /already prepared or executed/
    );

    assert.equal(calls, 1);

  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
