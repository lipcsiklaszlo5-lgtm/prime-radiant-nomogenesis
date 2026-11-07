'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  componentFromCsv,
  minimumCommitment,
  makeWorkerResult
} = require('./r5_data_envelope.cjs');

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function totalFromPayloads(payloads) {
  assert(
    Array.isArray(payloads) &&
    payloads.length === 2
  );

  const tables = payloads.map((source, index) => {
    const bytes = Buffer.from(source);

    assert.equal(bytes[0], 1);
    assert.equal(bytes[1], index + 1);

    const count = bytes[2];

    assert(count >= 1 && count <= 16);
    assert.equal(bytes.length, 3 + 10 * count);

    let previous = -1;

    return Array.from({length: count}, (_, i) => {
      const offset = 3 + 10 * i;
      const id = bytes.readUInt16BE(offset);

      assert(id > previous);
      previous = id;

      return [
        id,
        bytes.readBigUInt64BE(offset + 2)
      ];
    });
  });

  assert.equal(
    tables[0].length,
    tables[1].length
  );

  let total = 0n;

  for (let i = 0; i < tables[0].length; i++) {
    assert.equal(
      tables[0][i][0],
      tables[1][i][0]
    );

    total += tables[0][i][1] * tables[1][i][1];

    assert(total < (1n << 128n));
  }

  return total;
}

async function providerDeliver({
  account, contractId, caseId, policy,
  offerId, accountId, view, signedCall
}) {
  const file = path.join(
    __dirname, '..', '..', 'demo', 'data',
    policy.component === 0
      ? 'quantities.csv'
      : 'prices.csv'
  );

  const component = componentFromCsv(
    file,
    policy.component
  );

  const look = (method, args) =>
    view(account, contractId, method, args);

  for (let attempt = 0; attempt < 600; attempt++) {
    const state = await look(
      'get_rescue_case',
      {case_id: caseId}
    );

    if (
      state.phase !== 'BundleAwarded' &&
      state.phase !== 'Closed'
    ) {
      await sleep(100);
      continue;
    }

    const offer = await look(
      'get_rescue_offer',
      {offer_id: offerId}
    );

    assert.equal(offer.provider, accountId);
    assert.equal(
      offer.component_index,
      policy.component
    );

    if (
      offer.phase === 'Open' ||
      offer.phase === 'Released'
    ) {
      console.log(
        'AUTONOMOUS_UNSELECTED_PROVIDER:',
        policy.actor_id
      );
      return;
    }

    assert.equal(offer.phase, 'Locked');
    assert.equal(state.phase, 'BundleAwarded');

    assert.equal(
      offer.locked_bundle_id,
      state.awarded_bundle_id
    );

    assert.deepEqual(
      Array.from(component.root),
      state.component_commitments[policy.component]
    );

    const signed = await signedCall(
      account,
      contractId,
      'submit_rescue_component',
      {
        bundle_id: state.awarded_bundle_id,
        component_index: policy.component,
        payload: Array.from(component.payload),
        sibling: Array.from(component.sibling)
      },
      0n
    );

    console.log(
      'AUTONOMOUS_PROVIDER_PROOF:',
      policy.actor_id,
      'COMPONENT=' + policy.component,
      'TX=' + signed.txHash
    );

    return;
  }

  throw Error('provider proof decision timed out');
}

async function workerComplete({
  account, contractId, caseId, jobId,
  accountId, view, call
}) {
  const look = (method, args) =>
    view(account, contractId, method, args);

  for (let attempt = 0; attempt < 600; attempt++) {
    const state = await look(
      'get_rescue_case',
      {case_id: caseId}
    );

    if (state.phase !== 'Closed') {
      await sleep(100);
      continue;
    }

    assert(
      state.resolved_payloads.every(Array.isArray),
      'terminal recovery lacks verified components'
    );

    const job = await look(
      'get_rescue_job',
      {job_id: jobId}
    );

    assert.equal(job.worker, accountId);
    assert.equal(job.phase, 'Accepted');
    assert.equal(
      job.result_profile,
      'MinimumThreshold'
    );

    const threshold = BigInt(job.threshold);

    const total = totalFromPayloads(
      state.resolved_payloads
    );

    const result = makeWorkerResult(
      {total},
      caseId,
      jobId,
      threshold
    );

    assert.deepEqual(
      Array.from(result.commitment),
      Array.from(
        minimumCommitment(caseId, threshold)
      )
    );

    assert.deepEqual(
      Array.from(result.commitment),
      job.result_commitment
    );

    const signed = await call(
      account,
      contractId,
      'complete_rescue_job',
      {
        job_id: jobId,
        result_payload: Array.from(result.payload)
      }
    );

    console.log(
      'AUTONOMOUS_WORKER_COMPLETED:',
      accountId,
      'JOB=' + jobId,
      'TOTAL=' + total,
      'TX=' + signed.txHash
    );

    return;
  }

  throw Error('worker completion timed out');
}

async function keeperSettle({
  account, contractId, caseId, plan,
  bundleId, view, call
}) {
  const look = (method, args) =>
    view(account, contractId, method, args);

  const state = await look(
    'get_rescue_case',
    {case_id: caseId}
  );

  assert.equal(state.phase, 'BundleAwarded');
  assert.equal(
    state.awarded_bundle_id,
    bundleId
  );

  const losers = state.offer_ids.filter(
    id => !plan.offer_ids.includes(id)
  );

  assert.equal(losers.length, 1);

  for (const offerId of losers) {
    const offer = await look(
      'get_rescue_offer',
      {offer_id: offerId}
    );

    assert.equal(offer.phase, 'Open');

    const signed = await call(
      account,
      contractId,
      'release_open_rescue_offer',
      {offer_id: offerId}
    );

    console.log(
      'AUTONOMOUS_KEEPER_RELEASED_LOSER:',
      'OFFER=' + offerId,
      'TX=' + signed.txHash
    );
  }

  for (let attempt = 0; attempt < 600; attempt++) {
    const current = await look(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(
      current.phase,
      'BundleAwarded'
    );

    if (
      current.resolved_payloads.every(Array.isArray)
    ) {
      const offers = await Promise.all(
        plan.offer_ids.map(offerId =>
          look(
            'get_rescue_offer',
            {offer_id: offerId}
          )
        )
      );

      assert(offers.every(
        offer => offer.phase === 'Proven'
      ));

      const signed = await call(
        account,
        contractId,
        'settle_rescue_bundle',
        {bundle_id: bundleId}
      );

      console.log(
        'AUTONOMOUS_KEEPER_SETTLED:',
        'BUNDLE=' + bundleId,
        'TX=' + signed.txHash
      );

      return;
    }

    await sleep(100);
  }

  throw Error('keeper settlement timed out');
}

module.exports = {
  totalFromPayloads,
  providerDeliver,
  workerComplete,
  keeperSettle
};
