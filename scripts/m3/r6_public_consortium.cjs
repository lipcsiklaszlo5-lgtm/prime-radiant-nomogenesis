'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const near = require('near-api-js');

const {
  rpc, view, accountState, provision, connect,
  signedCall, verifyTransaction, eventuallyView,
  save, load
} = require('./r6_funded_smoke.cjs');

const {
  componentFromCsv,
  minimumCommitment
} = require('./r5_data_envelope.cjs');

const BASE = '/workspaces/.nomogenesis-r6';
const IDENTITIES = BASE + '/r6-05-actors.json';
const JOURNAL = BASE + '/r6-05-journal.json';

const CONTRACT = 'nomogenesis-70e59593a3.testnet';
const CODE_HASH =
  'Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ';

const SECONDARY = 'https://near-testnet.drpc.org';

const UNIT = 10n ** 21n;
const MINUTE = 60n * 1000000000n;

const NEW_ROLES = [
  'buyer1', 'worker1',
  'buyer2', 'worker2',
  'quantities', 'prices'
];

const ALL_ROLES = [
  'creator', 'buyer0', 'worker0',
  ...NEW_ROLES
];

function actorAccounts() {
  const old = load(BASE + '/r6-04-actors.json', null);

  assert(old?.creator);
  assert(old?.buyer);
  assert(old?.worker);

  let newer = load(IDENTITIES, null);

  if (!newer) {
    newer = {};

    for (const role of NEW_ROLES) {
      const pair = near.KeyPair.fromRandom('ed25519');

      newer[role] = {
        account_id:
          'nmg-' + role + '-' +
          crypto.randomBytes(5).toString('hex') +
          '.testnet',
        public_key: pair.getPublicKey().toString(),
        private_key: pair.toString()
      };
    }

    save(IDENTITIES, newer);
  }

  const result = {
    creator: old.creator,
    buyer0: old.buyer,
    worker0: old.worker,
    ...newer
  };

  for (const role of ALL_ROLES) {
    const actor = result[role];
    assert(actor, `missing identity: ${role}`);

    const restored = near.KeyPair.fromString(
      actor.private_key
    );

    assert.equal(
      restored.getPublicKey().toString(),
      actor.public_key
    );

    assert.match(
      actor.account_id,
      /^nmg-[a-z0-9]+-[a-f0-9]{10}\.testnet$/
    );
  }

  assert.equal(
    new Set(ALL_ROLES.map(
      role => result[role].account_id
    )).size,
    ALL_ROLES.length,
    'duplicate economic actor accounts'
  );

  return result;
}

async function step(
  journal, key, account, method, args, deposit
) {
  let entry = journal.steps[key];

  if (!entry) {
    // Fail closed on an uncertain broadcast: a prepared
    // transaction is never automatically submitted twice.
    journal.steps[key] = {
      state: 'prepared',
      signer: account.accountId,
      method
    };

    save(JOURNAL, journal);

    const outcome = await signedCall(
      account, method, args, deposit
    );

    entry = {
      state: 'confirmed',
      signer: account.accountId,
      method,
      tx: outcome.tx,
      value: outcome.value
    };

    journal.steps[key] = entry;
    save(JOURNAL, journal);
  }

  assert.equal(
    entry.state,
    'confirmed',
    `uncertain transaction ${key}; do not resubmit`
  );

  assert.equal(entry.signer, account.accountId);
  assert.equal(entry.method, method);

  await verifyTransaction(
    entry, account.accountId, method, deposit
  );

  console.log('PUBLIC_STEP_PASS:', key, entry.tx);
  return entry.value;
}

async function secondaryTotals() {
  const response = await rpc(
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

  return JSON.parse(
    Buffer.from(response.result).toString('utf8')
  );
}

async function main() {
  fs.mkdirSync(BASE, {
    recursive: true,
    mode: 0o700
  });

  fs.chmodSync(BASE, 0o700);

  const network = await rpc(
    'https://rpc.testnet.fastnear.com',
    'status',
    []
  );

  assert.equal(network.chain_id, 'testnet');

  const contract = await accountState(CONTRACT);

  assert(contract, 'missing public contract');
  assert.equal(contract.code_hash, CODE_HASH);

  const actors = actorAccounts();

  console.log('=== PROVISION ACCOUNTS BEFORE CASE ===');

  for (const role of ALL_ROLES) {
    await provision(actors[role]);
    console.log(
      'ROLE_FUNDED:',
      role,
      actors[role].account_id
    );
  }

  console.log('NINE DISTINCT FUNDED ACCOUNTS: PASS');

  const accounts = {};

  for (const role of ALL_ROLES) {
    accounts[role] = await connect(actors[role]);
  }

  // Keeper is permissionless in the Rust contract.
  // Reuse an existing funded signer; no faucet needed.
  accounts.keeper = accounts.creator;

  assert.equal(
    accounts.keeper.accountId,
    actors.creator.account_id
  );

  console.log('PERMISSIONLESS KEEPER: EXISTING CREATOR');
  console.log('KEEPER FAUCET REQUESTS: ZERO');

  const quote = await view('m3_storage_quote');

  const caseCost = BigInt(quote.case_storage_cost);
  const jobCost = BigInt(quote.job_storage_cost);
  const offerCost = BigInt(quote.offer_storage_cost);

  const components = [
    componentFromCsv('demo/data/quantities.csv', 0),
    componentFromCsv('demo/data/prices.csv', 1)
  ];

  const journal = load(JOURNAL, {
    version: 1,
    steps: {},
    jobs: [],
    offers: []
  });

  assert.equal(journal.version, 1);
  assert(journal.steps && typeof journal.steps === 'object');

  if (!journal.baseline) {
    const totals = await view('m3_totals');

    assert.equal(
      BigInt(totals.rescue_escrow),
      30n * UNIT,
      'R6-04 baseline must remain funded'
    );

    assert.equal(
      BigInt(await view('claimable_total')),
      0n
    );

    journal.baseline = {
      rescue_escrow: totals.rescue_escrow,
      next_rescue_job_id: totals.next_rescue_job_id
    };

    save(JOURNAL, journal);
  }

  console.log('R6-04 BASELINE PRESERVED: PASS');

  if (!journal.descriptor) {
    const block = await rpc(
      'https://rpc.testnet.fastnear.com',
      'block',
      {finality: 'final'}
    );

    const now = BigInt(
      block.header.timestamp_nanosec ??
      block.header.timestamp
    );

    journal.descriptor = {
      descriptor_version: 1,
      original_provider: actors.creator.account_id,
      component_commitments: components.map(
        component => Array.from(component.root)
      ),
      dependency_deadline: Number(now + 7n * MINUTE),
      bid_close: Number(now + 8n * MINUTE),
      award_close: Number(now + 30n * MINUTE),
      recovery_deadline: Number(now + 45n * MINUTE)
    };

    save(JOURNAL, journal);
  }

  const descriptor = journal.descriptor;

  const caseId = await step(
    journal, 'case', accounts.creator,
    'create_rescue_case',
    {descriptor}, caseCost
  );

  assert(Array.isArray(caseId));
  assert.equal(caseId.length, 32);

  const caseView = await eventuallyView(
    'get_rescue_case',
    {case_id: caseId},
    value =>
      value?.phase === 'Open' &&
      JSON.stringify(value.id) === JSON.stringify(caseId),
    'new-consortium-case'
  );

  assert.deepEqual(caseView.id, caseId);

  console.log(
    'NEW_CASE_ID_HEX:',
    Buffer.from(caseId).toString('hex')
  );

  const thresholds = [500n, 600n, 632n];

  console.log('=== THREE FUNDED BUYERS AND WORKERS ===');

  const jobIds = [];

  for (let i = 0; i < 3; i++) {
    const buyer = accounts[`buyer${i}`];
    const worker = accounts[`worker${i}`];

    const jobId = await step(
      journal,
      `buyer${i}-fund`,
      buyer,
      'create_funded_rescue_job',
      {
        input: {
          case_id: caseId,
          worker: worker.accountId,
          worker_reward: (25n * UNIT).toString(),
          rescue_cap: (5n * UNIT).toString(),
          result_profile: 'MinimumThreshold',
          result_commitment: Array.from(
            minimumCommitment(caseId, thresholds[i])
          ),
          threshold: thresholds[i].toString(),
          final_deadline: Number(
            BigInt(descriptor.recovery_deadline) +
            15n * MINUTE
          )
        }
      },
      30n * UNIT + jobCost
    );

    assert(Number.isSafeInteger(jobId));
    jobIds.push(jobId);

    await eventuallyView(
      'get_rescue_job',
      {job_id: jobId},
      value => value?.phase === 'Funded',
      `job${i}-funded`
    );

    await step(
      journal,
      `worker${i}-accept`,
      worker,
      'accept_rescue_job',
      {job_id: jobId},
      0n
    );

    await eventuallyView(
      'get_rescue_job',
      {job_id: jobId},
      value => value?.phase === 'Accepted',
      `worker${i}-accepted`
    );
  }

  assert.equal(new Set(jobIds).size, 3);

  journal.jobs = jobIds;
  save(JOURNAL, journal);

  console.log('THREE BUYER MANDATES: PASS');

  console.log('=== TWO BONDED COMPONENT PROVIDERS ===');

  const offerIds = [];

  for (let i = 0; i < 2; i++) {
    const provider = accounts[
      i === 0 ? 'quantities' : 'prices'
    ];

    const offerId = await step(
      journal,
      `provider${i}-offer`,
      provider,
      'post_rescue_offer',
      {
        input: {
          case_id: caseId,
          component_index: i,
          slot_id: `r6_csv_component_${i}`,
          fee: (6n * UNIT).toString(),
          bond_capacity: (12n * UNIT).toString()
        }
      },
      12n * UNIT + offerCost
    );

    assert(Number.isSafeInteger(offerId));
    offerIds.push(offerId);

    await eventuallyView(
      'get_rescue_offer',
      {offer_id: offerId},
      value =>
        value?.phase === 'Open' &&
        value.provider === provider.accountId,
      `provider${i}-bonded`
    );
  }

  assert.equal(new Set(offerIds).size, 2);

  journal.offers = offerIds;
  save(JOURNAL, journal);

  console.log('TWO BONDED PROVIDERS: PASS');

  console.log('=== VERIFY CONSORTIUM ECONOMICS ===');

  const finalCase = await eventuallyView(
    'get_rescue_case',
    {case_id: caseId},
    value =>
      value?.phase === 'Open' &&
      value.job_ids?.length === 3 &&
      value.offer_ids?.length === 2,
    'three-jobs-two-offers'
  );

  assert.deepEqual(
    [...finalCase.job_ids].sort((a, b) => a - b),
    [...jobIds].sort((a, b) => a - b)
  );

  assert.deepEqual(
    [...finalCase.offer_ids].sort((a, b) => a - b),
    [...offerIds].sort((a, b) => a - b)
  );

  const expectedEscrow = 144n * UNIT;

  const totals = await eventuallyView(
    'm3_totals',
    {},
    value =>
      value &&
      BigInt(value.rescue_escrow) === expectedEscrow,
    'full-public-consortium-escrow'
  );

  assert.equal(
    BigInt(totals.rescue_escrow),
    expectedEscrow
  );

  assert.equal(
    BigInt(await view('claimable_total')),
    0n
  );

  const secondary = await secondaryTotals();

  assert.equal(
    BigInt(secondary.rescue_escrow),
    expectedEscrow,
    'second RPC does not confirm escrow'
  );

  console.log('R6-04 PRIOR ESCROW: 30 UNIT');
  console.log('NEW BUYER PRINCIPAL: 90 UNIT');
  console.log('NEW PROVIDER BONDS: 24 UNIT');
  console.log('NEW CONSORTIUM TOTAL: 114 UNIT');
  console.log('GLOBAL RESCUE ESCROW: 144 UNIT');

  console.log('TWO RPC ESCROW VERIFICATION: PASS');
  console.log('THREE ACCEPTED WORKERS: PASS');
  console.log('TWO BONDED PROVIDERS: PASS');

  console.log('BID_CLOSE_NS:', descriptor.bid_close);
  console.log('AWARD_CLOSE_NS:', descriptor.award_close);
  console.log('RECOVERY_DEADLINE_NS:', descriptor.recovery_deadline);

  console.log('JOB_IDS:', JSON.stringify(jobIds));
  console.log('OFFER_IDS:', JSON.stringify(offerIds));

  console.log('=== M3-R6-05A RESULT: PASS ===');
}

main().catch(error => {
  console.error('=== M3-R6-05A RESULT: FAIL ===');
  console.error(error.stack || error.message);
  console.error(
    'Do not delete the journal or automatically ' +
    'repeat uncertain transactions.'
  );
  process.exitCode = 1;
});
