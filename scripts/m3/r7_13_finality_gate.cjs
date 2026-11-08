'use strict';

const assert = require('node:assert/strict');

const SECOND = 1000000000n;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function waitForFinalizedCase({
  caseId,
  expected,
  lookup,
  chainTime,
  maxWaitMs = 90000,
  pollMs = 1200
}) {
  assert.equal(caseId.length, 32);

  const start = process.hrtime.bigint();

  for (;;) {
    const now = await chainTime();

    assert(
      now + 90n * SECOND <
        BigInt(expected.dependency_deadline),
      'Finality gate: insufficient funding window'
    );

    const state = await lookup(caseId);

    if (state !== null) {
      assert.deepEqual(
        state.id, caseId,
        'Finalized case identity mismatch'
      );

      assert.equal(state.phase, 'Open');
      assert.equal(
        state.original_provider,
        expected.original_provider
      );

      assert.deepEqual(
        state.component_commitments,
        expected.component_commitments
      );

      for (const field of [
        'dependency_deadline',
        'bid_close',
        'award_close',
        'recovery_deadline'
      ]) {
        assert.equal(
          BigInt(state[field]),
          BigInt(expected[field]),
          'Finalized descriptor mismatch: ' + field
        );
      }

      assert.deepEqual(state.job_ids, []);
      assert.deepEqual(state.offer_ids, []);
      assert.equal(state.awarded_bundle_id, null);

      return state;
    }

    const elapsed =
      (process.hrtime.bigint() - start) /
      1000000n;

    assert(
      elapsed < BigInt(maxWaitMs),
      'Finalized case not visible before timeout'
    );

    await sleep(pollMs);
  }
}

async function waitForFinalizedAward({
  caseId,
  lookup,
  maxWaitMs = 45000,
  pollMs = 1000
}) {
  const start = process.hrtime.bigint();

  for (;;) {
    const state = await lookup(caseId);

    if (state !== null) {
      assert.deepEqual(
        state.id, caseId,
        'Award case identity mismatch'
      );

      if (state.phase === 'BundleAwarded') {
        assert(
          Number.isSafeInteger(
            state.awarded_bundle_id
          )
        );

        return state;
      }

      assert.equal(
        state.phase, 'Open',
        'Unexpected state while awaiting final award'
      );
    }

    const elapsed =
      (process.hrtime.bigint() - start) /
      1000000n;

    assert(
      elapsed < BigInt(maxWaitMs),
      'Award finality timeout'
    );

    await sleep(pollMs);
  }
}

module.exports = {
  waitForFinalizedCase,
  waitForFinalizedAward
};
