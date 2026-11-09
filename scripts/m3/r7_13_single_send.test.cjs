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

function directory() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nmg-r713-sendtx-')
  );

  fs.chmodSync(dir, 0o700);
  return dir;
}

function scenario(dir, mode) {
  const transactionBytes = Buffer.from(
    'synthetic-offline-transaction'
  );

  const hash = crypto.createHash('sha256')
    .update(transactionBytes).digest();

  const encodedHash = baseEncode(hash);

  let signatures = 0;
  let sends = 0;
  let reads = 0;
  let legacyCalls = 0;

  const account = {
    accountId: 'buyer.testnet',
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
              return transactionBytes;
            }
          },
          encode() {
            return Buffer.alloc(160, 7);
          }
        }
      ];
    },

    async functionCall() {
      legacyCalls++;
      throw Error('Forbidden SDK functionCall');
    },

    connection: {
      provider: {
        async sendTransaction() {
          legacyCalls++;
          throw Error('Forbidden SDK sendTransaction');
        }
      }
    }
  };

  async function rpcExchange(method, params) {
    if (method === 'send_tx') {
      sends++;

      assert.deepEqual(
        Object.keys(params).sort(),
        ['signed_tx_base64', 'wait_until']
      );

      assert.equal(params.wait_until, 'NONE');
      assert.equal(
        typeof params.signed_tx_base64,
        'string'
      );

      assert(
        Buffer.from(
          params.signed_tx_base64,
          'base64'
        ).length > 100
      );

      const saved = readStep(
        dir, 'buyer-1', 'fund'
      );

      assert.equal(
        saved.state,
        'signed_not_confirmed'
      );
      assert.equal(saved.tx, encodedHash);

      if (mode === 'uncertain-send') {
        throw Error('synthetic uncertain send');
      }

      return {final_execution_status: 'NONE'};
    }

    assert.equal(method, 'tx');

    reads++;

    assert.deepEqual(params, {
      tx_hash: encodedHash,
      sender_account_id: 'buyer.testnet',
      wait_until: 'FINAL'
    });

    if (mode === 'delayed-final' && reads === 1) {
      throw Error('UNKNOWN_TRANSACTION');
    }

    const status =
      mode === 'failed-final'
        ? {Failure: {ActionError: {}}}
        : {
            SuccessValue:
              Buffer.from('17').toString('base64')
          };

    return {
      final_execution_status: 'FINAL',
      transaction: {
        hash: encodedHash,
        signer_id: 'buyer.testnet',
        receiver_id: 'contract.testnet'
      },
      status,
      receipts_outcome: []
    };
  }

  return {
    account,
    rpcExchange,
    encodedHash,
    counts: () => ({
      signatures, sends, reads, legacyCalls
    })
  };
}

function options(dir, setup) {
  return {
    dir,
    role: 'buyer-1',
    step: 'fund',
    account: setup.account,
    rpcExchange: setup.rpcExchange,
    contractId: 'contract.testnet',
    method: 'create_funded_rescue_job',
    args: {input: {value: 7}},
    deposit: 10n
  };
}

test(
  'single send_tx then finalized receipt and durable confirmation',
  async () => {
    const dir = directory();

    try {
      const setup = scenario(dir, 'success');
      const cfg = options(dir, setup);

      const result = await callSignedOnce(cfg);

      assert.equal(result.value, 17);
      assert.equal(result.tx, setup.encodedHash);

      assert.equal(
        readStep(dir, 'buyer-1', 'fund').state,
        'confirmed'
      );

      await assert.rejects(
        () => callSignedOnce(cfg),
        /already prepared or executed/
      );

      assert.deepEqual(setup.counts(), {
        signatures: 1,
        sends: 1,
        reads: 1,
        legacyCalls: 0
      });

    } finally {
      fs.rmSync(dir, {
        recursive: true, force: true
      });
    }
  }
);

test(
  'uncertain send preserves exact hash and forbids resubmission',
  async () => {
    const dir = directory();

    try {
      const setup = scenario(dir, 'uncertain-send');
      const cfg = options(dir, setup);

      await assert.rejects(
        () => callSignedOnce(cfg),
        /synthetic uncertain send/
      );

      const saved = readStep(
        dir, 'buyer-1', 'fund'
      );

      assert.equal(
        saved.state, 'signed_not_confirmed'
      );
      assert.equal(saved.tx, setup.encodedHash);

      await assert.rejects(
        () => callSignedOnce(cfg),
        /already prepared or executed/
      );

      assert.deepEqual(setup.counts(), {
        signatures: 1,
        sends: 1,
        reads: 0,
        legacyCalls: 0
      });

    } finally {
      fs.rmSync(dir, {
        recursive: true, force: true
      });
    }
  }
);

test(
  'transient status error retries only read and never send',
  async () => {
    const dir = directory();

    try {
      const setup = scenario(dir, 'delayed-final');
      const result = await callSignedOnce(
        options(dir, setup)
      );

      assert.equal(result.value, 17);

      assert.deepEqual(setup.counts(), {
        signatures: 1,
        sends: 1,
        reads: 2,
        legacyCalls: 0
      });

      assert.equal(
        readStep(dir, 'buyer-1', 'fund').state,
        'confirmed'
      );

    } finally {
      fs.rmSync(dir, {
        recursive: true, force: true
      });
    }
  }
);

test(
  'final execution failure preserves signed journal',
  async () => {
    const dir = directory();

    try {
      const setup = scenario(dir, 'failed-final');

      await assert.rejects(
        () => callSignedOnce(
          options(dir, setup)
        ),
        /Final transaction execution failed/
      );

      const saved = readStep(
        dir, 'buyer-1', 'fund'
      );

      assert.equal(
        saved.state, 'signed_not_confirmed'
      );
      assert.equal(saved.tx, setup.encodedHash);

      assert.deepEqual(setup.counts(), {
        signatures: 1,
        sends: 1,
        reads: 1,
        legacyCalls: 0
      });

    } finally {
      fs.rmSync(dir, {
        recursive: true, force: true
      });
    }
  }
);
