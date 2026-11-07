'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');

const {
  RecoveryIntent
} = require('./recovery_intent.cjs');

const {
  minimumCommitment
} = require('../scripts/m3/r5_data_envelope.cjs');

function validIntent() {
  return {
    caseId: Array(32).fill(1),
    worker: 'worker.example.testnet',
    workerRewardYocto:
      '1000000000000000000000',
    rescueCapYocto:
      '7000000000000000000000',
    threshold: '500',
    finalDeadlineNs:
      '1800000000000000000'
  };
}

test('produces the actual funded-job ABI', () => {
  const intent = new RecoveryIntent(
    validIntent()
  );

  const input = intent.toFundingInput();

  assert.equal(
    input.result_profile,
    'MinimumThreshold'
  );

  assert.deepEqual(
    input.result_commitment,
    Array.from(
      minimumCommitment(
        validIntent().caseId,
        500n
      )
    )
  );

  assert.equal(
    input.worker_reward,
    validIntent().workerRewardYocto
  );

  assert.equal(
    input.rescue_cap,
    validIntent().rescueCapYocto
  );

  assert.equal(
    input.case_id.length,
    32
  );
});

test('signer receives exact bounded deposit', async () => {
  let witnessed;

  const buyer = {
    async call(...args) {
      witnessed = args;
      return 17;
    }
  };

  const contract = {
    async view(method) {
      assert.equal(
        method,
        'm3_storage_quote'
      );

      return {
        job_storage_cost:
          '500000000000000000'
      };
    }
  };

  const intent = new RecoveryIntent(
    validIntent()
  );

  const jobId = await intent.fund({
    buyer,
    contract
  });

  assert.equal(jobId, 17);

  assert.equal(
    witnessed[1],
    'create_funded_rescue_job'
  );

  assert.equal(
    witnessed[3].attachedDeposit,
    '8000500000000000000000'
  );
});

test('rejects unsafe input and overflow', () => {
  assert.throws(
    () => new RecoveryIntent({
      ...validIntent(),
      rescueCapYocto: 5.0
    }),
    /decimal string/
  );

  assert.throws(
    () => new RecoveryIntent({
      ...validIntent(),
      caseId: [2]
    }),
    /32 bytes/
  );

  assert.throws(
    () => new RecoveryIntent({
      ...validIntent(),
      threshold: '05'
    }),
    /noncanonical/
  );

  assert.throws(
    () => new RecoveryIntent({
      ...validIntent(),
      finalDeadlineNs:
        '1800000000000000001'
    }),
    /whole seconds/
  );

  assert.throws(
    () => new RecoveryIntent({
      ...validIntent(),
      rescueCapYocto:
        ((1n << 128n) - 1n).toString()
    }),
    /principal overflow/
  );
});

test('bad storage quote prevents signing', async () => {
  let signed = false;

  const buyer = {
    call() {
      signed = true;
    }
  };

  const contract = {
    async view() {
      return {
        job_storage_cost: '0'
      };
    }
  };

  await assert.rejects(
    new RecoveryIntent(
      validIntent()
    ).fund({
      buyer,
      contract
    }),
    /outside allowed range/
  );

  assert.equal(signed, false);
});
