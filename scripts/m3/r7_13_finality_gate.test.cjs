'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  waitForFinalizedCase,
  waitForFinalizedAward
} = require('./r7_13_finality_gate.cjs');

const SECOND = 1000000000n;
const caseId = Array(32).fill(3);
const roots = [
  Array(32).fill(11),
  Array(32).fill(22)
];

const expected = {
  original_provider: 'origin.testnet',
  component_commitments: roots,
  dependency_deadline: Number(400n * SECOND),
  bid_close: Number(500n * SECOND),
  award_close: Number(800n * SECOND),
  recovery_deadline: Number(1000n * SECOND)
};

const openCase = {
  ...expected,
  id: caseId,
  phase: 'Open',
  job_ids: [],
  offer_ids: [],
  awarded_bundle_id: null
};

test('case finality waits through stale final reads', async () => {
  let calls = 0;

  const found = await waitForFinalizedCase({
    caseId,
    expected,
    chainTime: async () => 100n * SECOND,
    lookup: async () => {
      calls++;
      return calls < 3 ? null : openCase;
    },
    pollMs: 1,
    maxWaitMs: 5000
  });

  assert.deepEqual(found, openCase);
  assert.equal(calls, 3);
});

test('case finality refuses an expiring funding window', async () => {
  let called = false;

  await assert.rejects(
    waitForFinalizedCase({
      caseId,
      expected,
      chainTime: async () => 350n * SECOND,
      lookup: async () => {
        called = true;
        return openCase;
      }
    }),
    /insufficient funding window/
  );

  assert.equal(called, false);
});

test('case finality rejects wrong contract state', async () => {
  await assert.rejects(
    waitForFinalizedCase({
      caseId,
      expected,
      chainTime: async () => 100n * SECOND,
      lookup: async () => ({
        ...openCase,
        original_provider: 'impostor.testnet'
      })
    }),
    /original_provider|Expected values/
  );
});

test('backup waits for finalized atomic award', async () => {
  let calls = 0;

  const result = await waitForFinalizedAward({
    caseId,
    lookup: async () => {
      calls++;
      return calls < 3
        ? openCase
        : {
            ...openCase,
            phase: 'BundleAwarded',
            awarded_bundle_id: 4
          };
    },
    pollMs: 1,
    maxWaitMs: 5000
  });

  assert.equal(
    result.phase, 'BundleAwarded'
  );
  assert.equal(calls, 3);
});

test('backup refuses unrelated finalized case', async () => {
  await assert.rejects(
    waitForFinalizedAward({
      caseId,
      lookup: async () => ({
        ...openCase,
        id: Array(32).fill(99),
        phase: 'BundleAwarded',
        awarded_bundle_id: 4
      })
    }),
    /Award case identity mismatch/
  );
});
