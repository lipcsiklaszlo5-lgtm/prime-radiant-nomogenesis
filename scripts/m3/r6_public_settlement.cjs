'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const near = require('near-api-js');

const {
  rpc, view, accountState, connect,
  signedCall, verifyTransaction, eventuallyView,
  save, load
} = require('./r6_funded_smoke.cjs');

const {
  componentFromCsv,
  load: loadData,
  makeWorkerResult,
  minimumCommitment
} = require('./r5_data_envelope.cjs');

const BASE = '/workspaces/.nomogenesis-r6';
const SOURCE = BASE + '/r6-05-journal.json';
const JOURNAL = BASE + '/r6-05b-journal.json';

const CONTRACT = 'nomogenesis-70e59593a3.testnet';
const CODE_HASH =
  'Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ';

const PRIMARY = 'https://rpc.testnet.fastnear.com';
const SECONDARY = 'https://near-testnet.drpc.org';

const UNIT = 10n ** 21n;
const SECOND = 1000000000n;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function amount(n) {
  return (BigInt(n) * UNIT).toString();
}

async function clock() {
  const block = await rpc(PRIMARY, 'block', {
    finality: 'final'
  });

  return BigInt(
    block.header.timestamp_nanosec ??
    block.header.timestamp
  );
}

async function waitForAwardWindow(descriptor) {
  const start = BigInt(descriptor.bid_close);
  const finish = BigInt(descriptor.award_close);
  const firstCheck = await clock();

  // Never start a fresh award too close to its deadline.
  assert(
    firstCheck < finish - 120n * SECOND,
    'award window already too close to closing'
  );

  console.log('AWARD_BID_CLOSE_NS:', start.toString());
  console.log('AWARD_DEADLINE_NS:', finish.toString());

  while (true) {
    const now = await clock();

    if (now >= start) {
      assert(
        now < finish - 120n * SECOND,
        'insufficient award execution window'
      );

      console.log('ON_CHAIN_AWARD_WINDOW: OPEN');
      return;
    }

    const remaining = (start - now) / SECOND;

    console.log(
      'ON_CHAIN_AWARD_WINDOW: NOT_YET',
      'seconds_remaining=' + remaining
    );

    await sleep(5000);
  }
}

async function step(
  journal, key, account, method, args,
  deposit = 0n
) {
  let entry = journal.steps[key];

  if (!entry) {
    // Prepared marker is durable before broadcasting.
    // An uncertain submission must be investigated,
    // never automatically repeated.
    journal.steps[key] = {
      state: 'prepared',
      signer: account.accountId,
      method
    };

    save(JOURNAL, journal);

    const result = await signedCall(
      account, method, args, deposit
    );

    entry = {
      state: 'confirmed',
      signer: account.accountId,
      method,
      tx: result.tx,
      value: result.value
    };

    journal.steps[key] = entry;
    save(JOURNAL, journal);
  }

  assert.equal(
    entry.state,
    'confirmed',
    'uncertain broadcast for ' + key
  );

  assert.equal(entry.signer, account.accountId);
  assert.equal(entry.method, method);

  await verifyTransaction(
    entry,
    account.accountId,
    method,
    deposit
  );

  console.log('PUBLIC_STEP_PASS:', key, entry.tx);
  return entry.value;
}

async function ledger(escrow, claimable, label) {
  await eventuallyView(
    'm3_totals',
    {},
    state =>
      state &&
      BigInt(state.rescue_escrow) === escrow,
    label + '-escrow'
  );

  await eventuallyView(
    'claimable_total',
    {},
    value => BigInt(value) === claimable,
    label + '-claims'
  );

  console.log(
    'LEDGER_PASS:',
    label,
    'escrow=' + (escrow / UNIT),
    'claimable=' + (claimable / UNIT)
  );
}

async function claim(actorId, expected, label) {
  await eventuallyView(
    'get_claimable',
    {account: actorId},
    value => BigInt(value) === expected,
    label
  );
}

async function nativeReceipt(
  transactionHash, recipientId, expectedAmount
) {
  const tx = await rpc(
    SECONDARY,
    'EXPERIMENTAL_tx_status',
    [transactionHash, recipientId]
  );

  assert.equal(tx.transaction.signer_id, recipientId);
  assert.equal(tx.transaction.receiver_id, CONTRACT);

  assert(
    tx.status &&
    !Object.hasOwn(tx.status, 'Failure')
  );

  assert(Array.isArray(tx.receipts));
  assert(Array.isArray(tx.receipts_outcome));

  const outcomes = new Map(
    tx.receipts_outcome.map(row => [
      row.id,
      row.outcome.status
    ])
  );

  const transfers = [];
  const callbacks = [];

  for (const receipt of tx.receipts) {
    if (receipt.predecessor_id !== CONTRACT) {
      continue;
    }

    const actions =
      receipt.receipt?.Action?.actions || [];

    for (const action of actions) {
      if (
        receipt.receiver_id === recipientId &&
        action.Transfer
      ) {
        transfers.push({
          id: receipt.receipt_id,
          amount: BigInt(action.Transfer.deposit)
        });
      }

      if (
        receipt.receiver_id === CONTRACT &&
        action.FunctionCall?.method_name ===
          'on_withdraw_complete'
      ) {
        callbacks.push(receipt.receipt_id);
      }
    }
  }

  assert.equal(transfers.length, 1);
  assert.equal(callbacks.length, 1);
  assert.equal(transfers[0].amount, expectedAmount);

  for (const id of [
    transfers[0].id,
    callbacks[0]
  ]) {
    const status = outcomes.get(id);

    assert(
      status &&
      (
        Object.hasOwn(status, 'SuccessValue') ||
        Object.hasOwn(status, 'SuccessReceiptId')
      ),
      'native receipt or callback failed'
    );
  }

  console.log('NATIVE_TRANSFER_RECEIPT:', transfers[0].id);
  console.log('NATIVE_CALLBACK_RECEIPT:', callbacks[0]);
  console.log('NATIVE_TRANSFER_AMOUNT:', expectedAmount.toString());
  console.log('NATIVE_TRANSFER_RECEIPT: PASS');
}

async function main() {
  const network = await rpc(PRIMARY, 'status', []);
  assert.equal(network.chain_id, 'testnet');

  const contract = await accountState(CONTRACT);
  assert(contract);
  assert.equal(contract.code_hash, CODE_HASH);

  const prior = load(SOURCE, null);

  assert.equal(prior?.version, 1);
  assert.equal(prior.jobs?.length, 3);
  assert.equal(prior.offers?.length, 2);

  assert.equal(
    Object.keys(prior.steps).length,
    9
  );

  for (const entry of Object.values(prior.steps)) {
    assert.equal(entry.state, 'confirmed');
    assert(entry.tx);
  }

  const caseId = prior.steps.case.value;

  assert.equal(caseId.length, 32);
  assert.equal(
    Buffer.from(caseId).toString('hex'),
    '446f769d1ed037f5916709c888ade5886a5b195c25acbc4728364fbdcc96f8a5'
  );

  const oldActors = load(
    BASE + '/r6-04-actors.json',
    null
  );

  const newActors = load(
    BASE + '/r6-05-actors.json',
    null
  );

  assert(oldActors && newActors);

  const actors = {
    creator: oldActors.creator,
    buyer0: oldActors.buyer,
    worker0: oldActors.worker,
    buyer1: newActors.buyer1,
    worker1: newActors.worker1,
    buyer2: newActors.buyer2,
    worker2: newActors.worker2,
    quantities: newActors.quantities,
    prices: newActors.prices
  };

  const accounts = {};

  for (const [role, actor] of Object.entries(actors)) {
    const pair = near.KeyPair.fromString(
      actor.private_key
    );

    assert.equal(
      pair.getPublicKey().toString(),
      actor.public_key
    );

    accounts[role] = await connect(actor);
  }

  // Open keeper role: reuse existing creator signer.
  accounts.keeper = accounts.creator;

  const journal = load(JOURNAL, {
    version: 1,
    case_hex: Buffer.from(caseId).toString('hex'),
    steps: {}
  });

  assert.equal(journal.version, 1);
  assert.equal(
    journal.case_hex,
    Buffer.from(caseId).toString('hex')
  );

  assert(journal.steps);

  const jobIds = prior.jobs;
  const offerIds = prior.offers;

  assert.deepEqual(jobIds, [1, 2, 3]);
  assert.deepEqual(offerIds, [0, 1]);

  const thresholds = [500n, 600n, 632n];

  const components = [
    componentFromCsv('demo/data/quantities.csv', 0),
    componentFromCsv('demo/data/prices.csv', 1)
  ];

  const sourceData = loadData(
    'demo/data/quantities.csv',
    'demo/data/prices.csv'
  );

  assert.equal(sourceData.total, 632n);

  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      Array.from(components[i].root),
      prior.descriptor.component_commitments[i]
    );
  }

  console.log('PUBLIC_CONSORTIUM_JOURNAL: PASS');
  console.log('CSV_RESULT: 632');

  // First phase: one atomic multi-sponsor award.
  if (!journal.steps.award) {
    await ledger(
      144n * UNIT,
      0n,
      'before-award'
    );

    const oldCase = await view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(oldCase.phase, 'Open');
    assert.equal(oldCase.job_ids.length, 3);
    assert.equal(oldCase.offer_ids.length, 2);

    await waitForAwardWindow(prior.descriptor);

    const preview = await view(
      'preview_rescue_pair',
      {case_id: caseId}
    );

    assert(preview, 'no eligible jointly funded pair');

    assert.deepEqual(preview.offer_ids, offerIds);
    assert.deepEqual(
      preview.eligible_job_ids,
      jobIds
    );

    assert.equal(
      BigInt(preview.total_price),
      12n * UNIT
    );

    console.log('JOINT_PAIR_PRICE: 12 UNIT');
    console.log('JOINT_PAIR_PREVIEW: PASS');
  }

  const bundleId = await step(
    journal,
    'award',
    accounts.keeper,
    'award_rescue_bundle',
    {case_id: caseId}
  );

  assert(Number.isSafeInteger(bundleId));

  const awarded = await eventuallyView(
    'get_rescue_case',
    {case_id: caseId},
    value =>
      value?.phase === 'BundleAwarded' &&
      value.awarded_bundle_id === bundleId,
    'public-bundle-awarded'
  );

  assert.equal(awarded.awarded_bundle_id, bundleId);

  for (const jobId of jobIds) {
    const mandate = await eventuallyView(
      'get_rescue_mandate',
      {job_id: jobId},
      value =>
        value?.phase === 'Locked' &&
        BigInt(value.locked_allocation ?? 0) ===
          4n * UNIT,
      'sponsor-allocation-' + jobId
    );

    assert.equal(mandate.locked_bundle_id, bundleId);
  }

  await ledger(
    141n * UNIT,
    3n * UNIT,
    'after-award'
  );

  console.log('JOINTLY FUNDED BUNDLE: PASS');
  console.log('PUBLIC_BUNDLE_ID:', bundleId);

  // Second phase: independent provider proof calls.
  for (let i = 0; i < 2; i++) {
    const provider = accounts[
      i === 0 ? 'quantities' : 'prices'
    ];

    await step(
      journal,
      'proof' + i,
      provider,
      'submit_rescue_component',
      {
        bundle_id: bundleId,
        component_index: i,
        payload: Array.from(components[i].payload),
        sibling: Array.from(components[i].sibling)
      }
    );

    await eventuallyView(
      'get_rescue_case',
      {case_id: caseId},
      value =>
        value?.resolved_payloads &&
        JSON.stringify(value.resolved_payloads[i]) ===
        JSON.stringify(Array.from(
          components[i].payload
        )),
      'provider-proof-' + i
    );
  }

  console.log('TWO_AUTHENTICATED_CSV_COMPONENTS: PASS');

  // Third phase: immutable contract-side settlement.
  await step(
    journal,
    'settlement',
    accounts.keeper,
    'settle_rescue_bundle',
    {bundle_id: bundleId}
  );

  await eventuallyView(
    'get_rescue_case',
    {case_id: caseId},
    value => value?.phase === 'Closed',
    'terminal-case-closed'
  );

  for (const offerId of offerIds) {
    await eventuallyView(
      'get_rescue_offer',
      {offer_id: offerId},
      value =>
        value?.phase === 'Proven' &&
        BigInt(value.held_bond) === 0n,
      'provider-settled-' + offerId
    );
  }

  await ledger(
    105n * UNIT,
    39n * UNIT,
    'after-provider-settlement'
  );

  for (const role of ['quantities', 'prices']) {
    await claim(
      accounts[role].accountId,
      18n * UNIT,
      role + '-credit'
    );
  }

  for (let i = 0; i < 3; i++) {
    await claim(
      accounts['buyer' + i].accountId,
      1n * UNIT,
      'buyer' + i + '-refund'
    );
  }

  console.log('PROVIDER_SETTLEMENT: PASS');

  // Fourth phase: three locally recomputed worker results.
  for (let i = 0; i < 3; i++) {
    const jobId = jobIds[i];
    const worker = accounts['worker' + i];

    const result = makeWorkerResult(
      sourceData,
      caseId,
      jobId,
      thresholds[i]
    );

    assert.deepEqual(
      result.commitment,
      minimumCommitment(caseId, thresholds[i])
    );

    await step(
      journal,
      'worker' + i + '-complete',
      worker,
      'complete_rescue_job',
      {
        job_id: jobId,
        result_payload: Array.from(result.payload)
      }
    );

    await eventuallyView(
      'get_rescue_job',
      {job_id: jobId},
      value =>
        value?.phase === 'Completed' &&
        BigInt(value.held_worker_reward) === 0n,
      'worker-completed-' + jobId
    );

    await claim(
      worker.accountId,
      25n * UNIT,
      'worker-credit-' + i
    );
  }

  await ledger(
    30n * UNIT,
    114n * UNIT,
    'after-three-workers'
  );

  console.log('THREE_WORKER_COMPLETIONS: PASS');
  console.log('NEW_CONSORTIUM_CONSERVATION_114: PASS');

  // Fifth phase: native transfer with receipt verification.
  await step(
    journal,
    'withdraw',
    accounts.worker0,
    'withdraw',
    {amount: amount(20)}
  );

  const withdrawTx = journal.steps.withdraw.tx;

  await nativeReceipt(
    withdrawTx,
    accounts.worker0.accountId,
    20n * UNIT
  );

  await claim(
    accounts.worker0.accountId,
    5n * UNIT,
    'worker0-remaining-credit'
  );

  await ledger(
    30n * UNIT,
    94n * UNIT,
    'after-native-withdrawal'
  );

  await eventuallyView(
    'payout_totals',
    {},
    value =>
      Array.isArray(value) &&
      BigInt(value[0]) === 94n * UNIT &&
      BigInt(value[1]) === 0n,
    'final-payout-totals'
  );

  const pending = await view(
    'get_pending_withdrawal',
    {withdrawal_id: 0}
  );

  assert.equal(pending, null);

  // The prior R6-04 job remains separately held.
  const older = load(
    BASE + '/r6-04-journal.json',
    null
  );

  assert(older?.job);

  const oldJob = await view(
    'get_rescue_job',
    {job_id: older.job.value}
  );

  assert.equal(oldJob.phase, 'Accepted');
  assert.equal(
    BigInt(oldJob.held_worker_reward),
    25n * UNIT
  );

  console.log('R6-04_PRIOR_ESCROW_PRESERVED: PASS');

  const final = await rpc(
    SECONDARY,
    'query',
    {
      request_type: 'call_function',
      account_id: CONTRACT,
      method_name: 'm3_totals',
      args_base64: Buffer.from('{}').toString('base64'),
      finality: 'final'
    }
  );

  const secondary = JSON.parse(
    Buffer.from(final.result).toString('utf8')
  );

  assert.equal(
    BigInt(secondary.rescue_escrow),
    30n * UNIT
  );

  console.log('SECOND_RPC_FINAL_ESCROW: PASS');

  const completed = Object.entries(journal.steps);

  assert.equal(completed.length, 8);

  assert(
    completed.every(([, item]) =>
      item.state === 'confirmed' &&
      typeof item.tx === 'string'
    )
  );

  assert.equal(
    new Set(completed.map(([, item]) => item.tx)).size,
    8
  );

  console.log('EIGHT_PUBLIC_SETTLEMENT_TX: PASS');
  console.log('PROVIDERS_CREDIT: 36 UNIT');
  console.log('WORKERS_CREDIT: 75 UNIT');
  console.log('BUYER_REFUNDS: 3 UNIT');
  console.log('NATIVE_PAYOUT: 20 UNIT');
  console.log('REMAINING_R6_04_ESCROW: 30 UNIT');

  console.log('=== M3-R6-05B RESULT: PASS ===');
}

main().catch(error => {
  console.error('=== M3-R6-05B RESULT: FAIL ===');
  console.error(error.stack || error.message);
  console.error(
    'Persistent journal preserved. Do not retry ' +
    'uncertain signed transactions automatically.'
  );
  process.exitCode = 1;
});
