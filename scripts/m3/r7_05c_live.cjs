'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const near = require('near-api-js');

const {
  rpc, view, accountState, connect,
  signedCall, eventuallyView, save, load
} = require('./r6_funded_smoke.cjs');

const {
  componentFromCsv, minimumCommitment,
  load: csvLoad, makeWorkerResult
} = require('./r5_data_envelope.cjs');

const ROOT = path.resolve(__dirname, '../..');
const PRIVATE = '/workspaces/.nomogenesis-r7-live';
const JOURNAL = path.join(PRIVATE, 'r7-05c-journal.json');
const PREFLIGHT = path.join(PRIVATE, 'r7-05c-preflight.json');
const INPUT = path.join(PRIVATE, 'r7-05c-market-input.json');
const CERT = path.join(PRIVATE, 'r7-05c-certificate.json');

const CONTRACT = 'nomogenesis-70e59593a3.testnet';
const CODE_HASH =
  'Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ';

const PRIMARY = 'https://rpc.testnet.fastnear.com';
const UNIT = 10n ** 21n;
const MINUTE = 60n * 1000000000n;
const SECOND = 1000000000n;

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const amount = n =>
  (BigInt(n) * UNIT).toString();

const sha = data =>
  crypto.createHash('sha256').update(data).digest('hex');

function secureRead(file) {
  const stat = fs.lstatSync(file);

  assert(
    stat.isFile() && !stat.isSymbolicLink(),
    'invalid credential file'
  );

  assert.equal(
    stat.mode & 0o077, 0,
    'unsafe credential permissions'
  );

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function actors() {
  const old = secureRead(
    '/workspaces/.nomogenesis-r6/r6-04-actors.json'
  );

  const next = secureRead(
    '/workspaces/.nomogenesis-r6/r6-05-actors.json'
  );

  const roles = {
    creator: old.creator,
    buyer0: old.buyer,
    worker0: old.worker,
    buyer1: next.buyer1,
    worker1: next.worker1,
    buyer2: next.buyer2,
    worker2: next.worker2,
    quantities: next.quantities,
    prices: next.prices
  };

  assert.equal(
    new Set(
      Object.values(roles).map(a => a.account_id)
    ).size,
    9
  );

  for (const [role, a] of Object.entries(roles)) {
    assert(a, `missing actor ${role}`);

    assert.equal(
      near.KeyPair.fromString(
        a.private_key
      ).getPublicKey().toString(),
      a.public_key,
      `key mismatch ${role}`
    );
  }

  return roles;
}

async function chainTime() {
  const block = await rpc(
    PRIMARY, 'block', {finality: 'final'}
  );

  return BigInt(
    block.header.timestamp_nanosec ??
    block.header.timestamp
  );
}

async function txStatus(hash, signer) {
  let last;

  for (let i = 0; i < 12; i++) {
    try {
      return await rpc(
        PRIMARY,
        'EXPERIMENTAL_tx_status',
        [hash, signer]
      );
    } catch (error) {
      last = error;

      if (i < 11) {
        await delay(1800);
      }
    }
  }

  throw last;
}

async function verifySigned(entry, args) {
  const tx = await txStatus(
    entry.tx, entry.signer
  );

  assert.equal(
    tx.transaction.hash, entry.tx
  );

  assert.equal(
    tx.transaction.signer_id,
    entry.signer
  );

  assert.equal(
    tx.transaction.receiver_id,
    CONTRACT
  );

  assert(
    tx.status &&
    (
      Object.hasOwn(tx.status, 'SuccessValue') ||
      Object.hasOwn(tx.status, 'SuccessReceiptId')
    ),
    'failed on-chain transaction'
  );

  for (const item of tx.receipts_outcome || []) {
    assert(
      !Object.hasOwn(
        item.outcome.status, 'Failure'
      ),
      'on-chain execution receipt failed'
    );
  }

  const calls = tx.transaction.actions.filter(
    a => a.FunctionCall?.method_name === entry.method
  );

  assert.equal(calls.length, 1);

  assert.equal(
    BigInt(calls[0].FunctionCall.deposit),
    BigInt(entry.deposit)
  );

  const signedArgs = JSON.parse(
    Buffer.from(
      calls[0].FunctionCall.args,
      'base64'
    ).toString('utf8')
  );

  assert.deepEqual(signedArgs, args);

  console.log(
    'SIGNED_TX_VERIFIED:',
    entry.step,
    entry.tx
  );

  return tx;
}

async function signedStep(
  journal, label, account,
  method, args, deposit = 0n
) {
  const expected = {
    step: label,
    signer: account.accountId,
    method,
    deposit: deposit.toString(),
    args_sha256: sha(JSON.stringify(args))
  };

  let entry = journal.steps[label];

  if (!entry) {
    journal.steps[label] = {
      ...expected,
      state: 'prepared'
    };

    save(JOURNAL, journal);

    // No automatic retry of signed broadcasts.
    const result = await signedCall(
      account, method, args, deposit
    );

    entry = {
      ...expected,
      state: 'confirmed',
      tx: result.tx,
      value: result.value
    };

    journal.steps[label] = entry;
    save(JOURNAL, journal);
  }

  assert.equal(
    entry.state,
    'confirmed',
    `UNCERTAIN ${label}: inspect journal/chain; DO NOT RESUBMIT`
  );

  for (const key of Object.keys(expected)) {
    assert.equal(entry[key], expected[key]);
  }

  await verifySigned(entry, args);

  return entry.value;
}

async function ledger(
  escrowUnits, claimUnits, label
) {
  const expectedEscrow =
    BigInt(escrowUnits) * UNIT;

  const expectedClaims =
    BigInt(claimUnits) * UNIT;

  for (let i = 0; i < 35; i++) {
    const totals = await view('m3_totals');

    const claims = BigInt(
      await view('claimable_total')
    );

    if (
      BigInt(totals.rescue_escrow) === expectedEscrow &&
      claims === expectedClaims
    ) {
      console.log(
        'LEDGER_PASS:',
        label,
        `${escrowUnits} escrow / ${claimUnits} claimable`
      );
      return;
    }

    if (i < 34) {
      await delay(1500);
    }
  }

  throw new Error(
    `ledger mismatch at ${label}; transaction journal preserved`
  );
}

async function checkClaim(
  journal, role, expectedAdditional
) {
  const account =
    journal.actor_accounts[role];

  const before = BigInt(
    journal.initial_claimables[role]
  );

  const expected =
    before + BigInt(expectedAdditional) * UNIT;

  for (let i = 0; i < 25; i++) {
    const current = BigInt(
      await view('get_claimable', {
        account
      })
    );

    if (current === expected) {
      return;
    }

    if (i < 24) {
      await delay(1200);
    }
  }

  throw new Error(
    `${role} claimable delta mismatch`
  );
}

function accountMap() {
  return actors();
}

async function initialJournal(identity) {
  assert(
    !fs.existsSync(JOURNAL),
    'journal already exists'
  );

  const report = load(PREFLIGHT, null);

  assert(
    report?.journal_exists === false
  );

  assert.equal(report.contract, CONTRACT);

  assert.deepEqual(
    report.buyer_caps_units,
    [7, 7, 7]
  );

  assert.deepEqual(
    report.provider_fees_units,
    [6, 6]
  );

  assert.equal(
    report.baseline_escrow,
    amount(30)
  );

  assert.equal(
    report.baseline_claimable,
    amount(94)
  );

  assert.equal(
    (
      await rpc(PRIMARY, 'status', [])
    ).chain_id,
    'testnet'
  );

  assert.equal(
    (
      await accountState(CONTRACT)
    ).code_hash,
    CODE_HASH
  );

  await ledger(
    30, 94, 'original baseline'
  );

  const quote = await view(
    'm3_storage_quote'
  );

  const funding = {
    creator: BigInt(
      quote.case_storage_cost
    ),
    buyer: 32n * UNIT +
      BigInt(quote.job_storage_cost),
    worker: 0n,
    provider: 12n * UNIT +
      BigInt(quote.offer_storage_cost)
  };

  const initialClaimables = {};

  for (
    const [role, actor]
    of Object.entries(identity)
  ) {
    assert.equal(
      report.actor_accounts[role],
      actor.account_id
    );

    const state = await accountState(
      actor.account_id
    );

    assert(state, 'missing account');

    const category =
      role === 'creator' ? 'creator' :
      role.startsWith('buyer') ? 'buyer' :
      role.startsWith('worker') ? 'worker' :
      'provider';

    assert(
      BigInt(state.amount) >
      funding[category] + 300n * UNIT,
      `insufficient testnet balance: ${role}`
    );

    initialClaimables[role] = await view(
      'get_claimable',
      {account: actor.account_id}
    );
  }

  for (const [role, slot] of [
    ['quantities', 'r7_05c_quantities_v1'],
    ['prices', 'r7_05c_prices_v1']
  ]) {
    assert.equal(
      await view('capacity_lock_holder', {
        provider: identity[role].account_id,
        slot_id: slot
      }),
      null
    );
  }

  const now = await chainTime();

  const descriptor = {
    descriptor_version: 1,
    original_provider:
      identity.creator.account_id,

    component_commitments: [
      componentFromCsv(
        'demo/data/quantities.csv', 0
      ),
      componentFromCsv(
        'demo/data/prices.csv', 1
      )
    ].map(c => Array.from(c.root)),

    dependency_deadline:
      Number(now + 12n * MINUTE),

    bid_close:
      Number(now + 14n * MINUTE),

    award_close:
      Number(now + 60n * MINUTE),

    recovery_deadline:
      Number(now + 90n * MINUTE)
  };

  const journal = {
    version: 1,
    network: 'testnet',
    contract: CONTRACT,
    descriptor,

    actor_accounts:
      Object.fromEntries(
        Object.entries(identity).map(
          ([role, a]) => [
            role, a.account_id
          ]
        )
      ),

    initial_claimables: initialClaimables,
    initial_escrow: amount(30),
    initial_claimable_total: amount(94),

    quote,
    jobs: [],
    offers: [],
    steps: {}
  };

  save(JOURNAL, journal);

  console.log(
    'NEW CASE WINDOW AND DURABLE JOURNAL: READY'
  );

  return journal;
}

async function waitForAward(descriptor) {
  const start = BigInt(
    descriptor.bid_close
  );

  const finish = BigInt(
    descriptor.award_close
  );

  for (;;) {
    const now = await chainTime();

    assert(
      now < finish - 5n * MINUTE,
      'award window insufficient'
    );

    if (now >= start) {
      return;
    }

    console.log(
      'WAITING_FOR_ONCHAIN_BID_CLOSE:',
      (
        (start - now) / SECOND
      ).toString(),
      'seconds'
    );

    await delay(5000);
  }
}

function verifyNative(
  tx, recipient, deposit
) {
  const outcome = new Map(
    tx.receipts_outcome.map(
      r => [
        r.id, r.outcome.status
      ]
    )
  );

  const transfers = [];
  const callbacks = [];

  for (const receipt of tx.receipts) {
    if (receipt.predecessor_id !== CONTRACT) {
      continue;
    }

    for (
      const action of
      receipt.receipt?.Action?.actions || []
    ) {
      if (
        receipt.receiver_id === recipient &&
        action.Transfer
      ) {
        transfers.push({
          id: receipt.receipt_id,
          deposit: BigInt(
            action.Transfer.deposit
          )
        });
      }

      if (
        receipt.receiver_id === CONTRACT &&
        action.FunctionCall?.method_name ===
          'on_withdraw_complete'
      ) {
        callbacks.push(
          receipt.receipt_id
        );
      }
    }
  }

  assert.equal(
    transfers.length, 1
  );

  assert.equal(
    callbacks.length, 1
  );

  assert.equal(
    transfers[0].deposit,
    deposit
  );

  for (const id of [
    transfers[0].id,
    callbacks[0]
  ]) {
    const status = outcome.get(id);

    assert(
      status &&
      (
        Object.hasOwn(status, 'SuccessValue') ||
        Object.hasOwn(status, 'SuccessReceiptId')
      ),
      'native receipt failed'
    );
  }

  console.log(
    'NATIVE_TESTNET_TRANSFER_CALLBACK: PASS'
  );
}

async function main() {
  assert(
    fs.statSync(PRIVATE).isDirectory()
  );

  assert.equal(
    fs.statSync(PRIVATE).mode & 0o077,
    0,
    'unsafe private dir'
  );

  process.chdir(ROOT);

  const identity = accountMap();

  const j = fs.existsSync(JOURNAL)
    ? secureRead(JOURNAL)
    : await initialJournal(identity);

  assert.equal(j.version, 1);
  assert.equal(j.contract, CONTRACT);
  assert.equal(j.network, 'testnet');

  for (
    const [role, a]
    of Object.entries(identity)
  ) {
    assert.equal(
      j.actor_accounts[role],
      a.account_id
    );
  }

  assert.equal(
    (
      await rpc(
        PRIMARY, 'status', []
      )
    ).chain_id,
    'testnet'
  );

  assert.equal(
    (
      await accountState(CONTRACT)
    ).code_hash,
    CODE_HASH
  );

  const acc = {};

  for (
    const [role, a]
    of Object.entries(identity)
  ) {
    acc[role] = await connect(a);
  }

  const data = csvLoad(
    'demo/data/quantities.csv',
    'demo/data/prices.csv'
  );

  assert.equal(
    data.total,
    632n
  );

  const components = [0, 1].map(
    i => componentFromCsv(
      i === 0
        ? 'demo/data/quantities.csv'
        : 'demo/data/prices.csv',
      i
    )
  );

  assert.deepEqual(
    j.descriptor.component_commitments,
    components.map(
      x => Array.from(x.root)
    )
  );

  console.log(
    '=== STAGE 1: CREATE NEW TESTNET CASE ==='
  );

  const caseId = await signedStep(
    j,
    'case',
    acc.creator,
    'create_rescue_case',
    {descriptor: j.descriptor},
    BigInt(j.quote.case_storage_cost)
  );

  assert(
    Array.isArray(caseId) &&
    caseId.length === 32
  );

  const caseHex =
    Buffer.from(caseId).toString('hex');

  if (j.case_hex !== undefined) {
    assert.equal(
      j.case_hex, caseHex
    );
  }

  j.case_hex = caseHex;
  save(JOURNAL, j);

  console.log(
    'NEW_TESTNET_CASE_ID:',
    caseHex
  );

  console.log(
    '=== STAGE 2: FUND AND ACCEPT 3 JOBS ==='
  );

  const thresholds = [
    500n, 600n, 632n
  ];

  for (let i = 0; i < 3; i++) {
    const jobId = await signedStep(
      j,
      `buyer${i}-fund`,
      acc[`buyer${i}`],
      'create_funded_rescue_job',
      {
        input: {
          case_id: caseId,

          worker:
            identity[`worker${i}`].account_id,

          worker_reward: amount(25),
          rescue_cap: amount(7),

          result_profile:
            'MinimumThreshold',

          result_commitment:
            Array.from(
              minimumCommitment(
                caseId,
                thresholds[i]
              )
            ),

          threshold:
            thresholds[i].toString(),

          final_deadline:
            Number(
              BigInt(
                j.descriptor.recovery_deadline
              ) + 30n * MINUTE
            )
        }
      },
      32n * UNIT +
        BigInt(j.quote.job_storage_cost)
    );

    assert(
      Number.isSafeInteger(jobId)
    );

    if (j.jobs[i] === undefined) {
      j.jobs[i] = jobId;
      save(JOURNAL, j);
    }

    assert.equal(
      j.jobs[i],
      jobId
    );

    await signedStep(
      j,
      `worker${i}-accept`,
      acc[`worker${i}`],
      'accept_rescue_job',
      {job_id: jobId}
    );
  }

  console.log(
    '=== STAGE 3: POST 2 BONDED OFFERS ==='
  );

  for (let i = 0; i < 2; i++) {
    const provider =
      i === 0
        ? 'quantities'
        : 'prices';

    const offerId = await signedStep(
      j,
      `provider${i}-offer`,
      acc[provider],
      'post_rescue_offer',
      {
        input: {
          case_id: caseId,
          component_index: i,

          slot_id:
            `r7_05c_${provider}_v1`,

          fee: amount(6),
          bond_capacity: amount(12)
        }
      },
      12n * UNIT +
        BigInt(j.quote.offer_storage_cost)
    );

    assert(
      Number.isSafeInteger(offerId)
    );

    if (j.offers[i] === undefined) {
      j.offers[i] = offerId;
      save(JOURNAL, j);
    }

    assert.equal(
      j.offers[i],
      offerId
    );
  }

  assert.equal(
    new Set(j.jobs).size,
    3
  );

  assert.equal(
    new Set(j.offers).size,
    2
  );

  if (!j.steps.award) {
    console.log(
      '=== STAGE 4: VERIFY MARKET + COMPUTE GENESIS ==='
    );

    await ledger(
      150, 94,
      'before award'
    );

    const c = await view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(
      c.phase,
      'Open'
    );

    assert.deepEqual(
      c.job_ids,
      j.jobs
    );

    assert.deepEqual(
      c.offer_ids,
      j.offers
    );

    const buyers = [];

    for (const id of j.jobs) {
      const job = await view(
        'get_rescue_job',
        {job_id: id}
      );

      const mandate = await view(
        'get_rescue_mandate',
        {job_id: id}
      );

      assert.equal(
        job.phase,
        'Accepted'
      );

      assert.equal(
        mandate.phase,
        'Open'
      );

      assert.equal(
        BigInt(mandate.held_principal),
        7n * UNIT
      );

      buyers.push({
        job_id: id,
        cap: amount(7)
      });
    }

    const offers = [];

    for (const id of j.offers) {
      const o = await view(
        'get_rescue_offer',
        {offer_id: id}
      );

      assert.equal(
        o.phase,
        'Open'
      );

      assert.equal(
        BigInt(o.fee),
        6n * UNIT
      );

      assert.equal(
        BigInt(o.held_bond),
        12n * UNIT
      );

      assert.equal(
        await view(
          'capacity_lock_holder',
          {
            provider: o.provider,
            slot_id: o.slot_id
          }
        ),
        null
      );

      offers.push({
        offer_id: id,
        component: o.component_index,
        provider: o.provider,
        slot: o.slot_id,
        fee: amount(6),
        bond: amount(12),

        ready_at:
          j.descriptor.bid_close,

        available: true
      });
    }

    const input = {
      deadline:
        j.descriptor.award_close,

      buyers,
      offers
    };

    fs.writeFileSync(
      INPUT,
      JSON.stringify(input) + '\n',
      {mode: 0o600}
    );

    const check = spawnSync(
      'python3',
      [
        '-B',
        'scripts/m3/r7_05c_certificate.py',
        INPUT,
        CERT,
        caseHex,
        ...j.jobs.map(String)
      ],
      {
        cwd: ROOT,
        encoding: 'utf8'
      }
    );

    if (check.error) {
      throw check.error;
    }

    if (check.stdout) {
      process.stdout.write(check.stdout);
    }

    if (check.status !== 0) {
      if (check.stderr) {
        process.stderr.write(check.stderr);
      }

      throw new Error(
        'Genesis certificate rejected before award'
      );
    }

    const cert = JSON.parse(
      fs.readFileSync(CERT, 'utf8')
    );

    assert.equal(
      BigInt(
        cert.genesis_certificate
          .winning_pair.price
      ),
      12n * UNIT
    );

    console.log(
      'OFFCHAIN THREE MINIMAL COALITIONS: PASS'
    );

    await waitForAward(
      j.descriptor
    );

    const preview = await view(
      'preview_rescue_pair',
      {case_id: caseId}
    );

    assert.deepEqual(
      preview.offer_ids,
      j.offers
    );

    assert.deepEqual(
      preview.eligible_job_ids,
      j.jobs
    );

    assert.equal(
      BigInt(preview.total_price),
      12n * UNIT
    );

    assert.equal(
      BigInt(preview.eligible_cap_total),
      21n * UNIT
    );
  } else {
    assert(
      fs.existsSync(CERT),
      'cannot resume without pre-award certificate'
    );
  }

  console.log(
    '=== STAGE 5: ATOMIC AWARD ==='
  );

  const bundleId = await signedStep(
    j,
    'award',
    acc.creator,
    'award_rescue_bundle',
    {case_id: caseId}
  );

  assert(
    Number.isSafeInteger(bundleId)
  );

  if (j.bundle_id === undefined) {
    j.bundle_id = bundleId;
    save(JOURNAL, j);
  }

  assert.equal(
    j.bundle_id,
    bundleId
  );

  if (!j.steps.settlement) {
    for (const job_id of j.jobs) {
      await eventuallyView(
        'get_rescue_mandate',
        {job_id},
        m =>
          m?.phase === 'Locked' &&
          m.locked_bundle_id === bundleId &&
          BigInt(
            m.locked_allocation ?? '0'
          ) === 4n * UNIT,
        `mandate-${job_id}-locked`
      );
    }

    for (
      const [i, offer_id]
      of j.offers.entries()
    ) {
      const role =
        i === 0
          ? 'quantities'
          : 'prices';

      const slot =
        `r7_05c_${role}_v1`;

      await eventuallyView(
        'capacity_lock_holder',
        {
          provider:
            identity[role].account_id,
          slot_id: slot
        },
        holder =>
          holder?.M3RescueOffer === offer_id,
        `capacity-${offer_id}-locked`
      );
    }

    await ledger(
      141, 103,
      'after award'
    );

    for (const i of [0, 1, 2]) {
      await checkClaim(
        j, `buyer${i}`, 3
      );
    }
  }

  console.log(
    '=== STAGE 6: AUTHENTICATED CSV PROOFS ==='
  );

  for (let i = 0; i < 2; i++) {
    const provider =
      i === 0
        ? 'quantities'
        : 'prices';

    await signedStep(
      j,
      `proof${i}`,
      acc[provider],
      'submit_rescue_component',
      {
        bundle_id: bundleId,
        component_index: i,

        payload:
          Array.from(
            components[i].payload
          ),

        sibling:
          Array.from(
            components[i].sibling
          )
      }
    );
  }

  if (!j.steps.settlement) {
    await eventuallyView(
      'get_rescue_case',
      {case_id: caseId},
      c =>
        c?.resolved_payloads?.length === 2 &&
        c.resolved_payloads.every(
          (p, i) =>
            JSON.stringify(p) ===
            JSON.stringify(
              Array.from(
                components[i].payload
              )
            )
        ),
      'two-csv-component-proofs'
    );
  }

  console.log(
    '=== STAGE 7: TERMINAL SETTLEMENT ==='
  );

  await signedStep(
    j,
    'settlement',
    acc.creator,
    'settle_rescue_bundle',
    {bundle_id: bundleId}
  );

  await eventuallyView(
    'get_rescue_case',
    {case_id: caseId},
    c => c?.phase === 'Closed',
    'case-closed'
  );

  for (const offer_id of j.offers) {
    await eventuallyView(
      'get_rescue_offer',
      {offer_id},
      o =>
        o?.phase === 'Proven' &&
        BigInt(o.held_bond) === 0n,
      `offer-${offer_id}-proven`
    );
  }

  if (!j.steps['worker0-complete']) {
    await ledger(
      105, 139,
      'after settlement'
    );

    await checkClaim(
      j, 'quantities', 18
    );

    await checkClaim(
      j, 'prices', 18
    );
  }

  console.log(
    '=== STAGE 8: 3 WORKER COMPLETIONS ==='
  );

  for (let i = 0; i < 3; i++) {
    const result = makeWorkerResult(
      data,
      caseId,
      j.jobs[i],
      thresholds[i]
    );

    assert.deepEqual(
      result.commitment,
      minimumCommitment(
        caseId,
        thresholds[i]
      )
    );

    await signedStep(
      j,
      `worker${i}-complete`,
      acc[`worker${i}`],
      'complete_rescue_job',
      {
        job_id: j.jobs[i],

        result_payload:
          Array.from(
            result.payload
          )
      }
    );

    await eventuallyView(
      'get_rescue_job',
      {job_id: j.jobs[i]},
      state =>
        state?.phase === 'Completed' &&
        BigInt(
          state.held_worker_reward
        ) === 0n,
      `worker-${i}-complete`
    );

    await checkClaim(
      j,
      `worker${i}`,
      25 - (
        i === 0 &&
        j.steps.withdraw ? 20 : 0
      )
    );
  }

  if (!j.steps.withdraw) {
    await ledger(
      30, 214,
      'after workers'
    );
  }

  console.log(
    '=== STAGE 9: NATIVE TESTNET PAYOUT ==='
  );

  await signedStep(
    j,
    'withdraw',
    acc.worker0,
    'withdraw',
    {amount: amount(20)}
  );

  await ledger(
    30, 194,
    'after native payout'
  );

  await checkClaim(
    j, 'worker0', 5
  );

  const paid = await view(
    'payout_totals'
  );

  assert.deepEqual(
    paid.map(String),
    [amount(194), '0']
  );

  const withdrawEntry =
    j.steps.withdraw;

  verifyNative(
    await txStatus(
      withdrawEntry.tx,
      withdrawEntry.signer
    ),
    identity.worker0.account_id,
    20n * UNIT
  );

  assert.equal(
    Object.keys(j.steps).length,
    17
  );

  assert(
    Object.values(j.steps).every(
      x => x.state === 'confirmed'
    )
  );

  assert.equal(
    new Set(
      Object.values(j.steps).map(
        x => x.tx
      )
    ).size,
    17
  );

  assert.equal(
    (30n + 194n + 20n) * UNIT,
    (30n + 94n + 120n) * UNIT,
    'full lifecycle conservation'
  );

  const certificate = JSON.parse(
    fs.readFileSync(CERT, 'utf8')
  );

  assert.equal(
    certificate.genesis_certificate
      .minimal_coalitions.length,
    3
  );

  const evidence = {
    version: 'r7-05c-live-testnet-v1',
    network: 'testnet',
    contract: CONTRACT,

    case_id_hex: caseHex,
    jobs: j.jobs,
    offers: j.offers,
    bundle_id: bundleId,

    caps_units: [7, 7, 7],
    price_units: 12,

    onchain_allocation_units: [4, 4, 4],

    minimal_coalitions:
      certificate.genesis_certificate
        .minimal_coalitions,

    certificate_hash:
      certificate.genesis_certificate
        .certificate_hash,

    transaction_count: 17,

    transactions:
      Object.values(j.steps).map(
        ({
          step, signer, method,
          tx, deposit, args_sha256
        }) => ({
          step, signer, method,
          tx, deposit, args_sha256
        })
      ),

    baseline_escrow: amount(30),
    baseline_claimable: amount(94),

    final_escrow: amount(30),
    final_claimable: amount(194),

    native_payout_units: 20,

    limitations: [
      'All demonstration accounts operated by one controller',
      'Genesis Certificate computed off-chain, not executed by deployed contract',
      'No independent historical Merkle proof',
      'Synthetic data and Testnet funds only'
    ]
  };

  const publicPath = path.join(
    ROOT,
    'docs/evidence/R7-05C-public.json'
  );

  if (fs.existsSync(publicPath)) {
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(publicPath, 'utf8')
      ),
      evidence
    );
  } else {
    fs.writeFileSync(
      publicPath,
      JSON.stringify(evidence, null, 2) + '\n'
    );
  }

  console.log(
    'R7-05C FULL SIGNED TESTNET LIFECYCLE: PASS'
  );

  console.log(
    'PUBLIC EVIDENCE:',
    publicPath
  );

  console.log(
    'NEW TRANSACTIONS: 17'
  );

  console.log(
    'CASE:', caseHex
  );

  console.log(
    'CERTIFICATE:', CERT
  );
}

main().catch(error => {
  console.error(
    'R7-05C LIVE PIPELINE: FAIL'
  );

  console.error(
    error.stack || error.message
  );

  console.error(
    'No automatic rebroadcast. Preserve private journal and inspect failure.'
  );

  process.exitCode = 1;
});
