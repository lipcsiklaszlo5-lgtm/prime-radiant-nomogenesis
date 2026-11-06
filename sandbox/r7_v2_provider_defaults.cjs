'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {Worker} = require('near-workspaces');

const WASM = process.env.NOMOGENESIS_V2_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;
const GAS = '200000000000000';
const DOMAIN = 'NOMOGENESIS/R7-06E/SUBSET/V1';


function sha256(data) {
  return crypto.createHash('sha256')
    .update(data).digest();
}

function u64(value) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(value));
  return b;
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
}

function proofPayload(component) {
  const parts = [Buffer.from([1, component + 1, 2])];

  for (const [id, value] of [[4, 9], [8, 15]]) {
    const record = Buffer.alloc(10);
    record.writeUInt16BE(id, 0);
    record.writeBigUInt64BE(BigInt(value), 2);
    parts.push(record);
  }

  return Buffer.concat(parts);
}

function proofSibling(component) {
  return sha256(Buffer.concat([
    Buffer.from([0]),
    u64(1),
    u32(3),
    Buffer.from([1, 0x7f, component + 1])
  ]));
}

function proofRoot(payload, sibling) {
  const leaf = sha256(Buffer.concat([
    Buffer.from([0]),
    u64(0),
    u32(payload.length),
    payload
  ]));

  return Array.from(sha256(Buffer.concat([
    Buffer.from([1]),
    leaf,
    sibling
  ])));
}

async function rpc(worker, method, params) {
  const url = worker.config?.rpcAddr;
  assert.match(
    url || '',
    /^http:\/\/127\.0\.0\.1:\d+$/
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  assert.equal(response.ok, true);
  const value = await response.json();
  if (value.error) {
    throw Error(JSON.stringify(value.error));
  }
  return value.result;
}

async function timestamp(worker) {
  const block = await rpc(
    worker,
    'block',
    {finality: 'optimistic'}
  );
  return BigInt(
    block.header.timestamp_nanosec ??
    block.header.timestamp
  );
}

async function storageBytes(worker, account) {
  const state = await rpc(worker, 'query', {
    request_type: 'view_account',
    account_id: account,
    finality: 'optimistic'
  });
  return BigInt(state.storage_usage);
}

async function advanceTo(worker, target) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const now = await timestamp(worker);
    if (now >= target) {
      return;
    }

    const remaining = target - now;
    const blocks = Math.max(
      10,
      Math.min(
        100,
        Number(
          (remaining + 500000000n - 1n) /
          500000000n
        )
      )
    );

    await rpc(worker, 'sandbox_fast_forward', {
      delta_height: blocks
    });
  }

  throw Error('Sandbox deadline advancement failed');
}

async function main() {
  assert(WASM && fs.statSync(WASM).size > 0);

  let worker;

  try {
    worker = await Worker.init();
    const root = worker.rootAccount;
    const contract = await root.devDeploy(WASM);

    const creator = await root.createSubAccount('creator');
    const source = await root.createSubAccount('source');
    const keeper = await root.createSubAccount('keeper');

    const buyers = [];
    const workers = [];
    const providers = [];

    for (let i = 0; i < 3; i++) {
      buyers.push(
        await root.createSubAccount(`buyer${i}`)
      );
      workers.push(
        await root.createSubAccount(`worker${i}`)
      );
    }

    for (let i = 0; i < 2; i++) {
      providers.push(
        await root.createSubAccount(`provider${i}`)
      );
    }

    const view = (method, args = {}) =>
      contract.view(method, args);

    const totals = () => view('m3_totals');
    const claim = buyer => view(
      'get_claimable',
      {account: buyer.accountId}
    );
    const mandate = job_id => view(
      'get_rescue_mandate',
      {job_id}
    );
    const consent = job_id => view(
      'get_r7_v2_consent',
      {job_id}
    );
    const offer = offer_id => view(
      'get_rescue_offer',
      {offer_id}
    );
    const job = job_id => view(
      'get_rescue_job',
      {job_id}
    );


    const scenario = process.env.R7_DEFAULT_SCENARIO;

    assert(
      [
        'first-default',
        'second-default',
        'both-default'
      ].includes(scenario),
      'Unknown provider default scenario'
    );

    console.log('SCENARIO:', scenario);

    const proofs = [
      proofPayload(0),
      proofPayload(1)
    ];
    const siblings = [
      proofSibling(0),
      proofSibling(1)
    ];

    const roots = proofs.map(
      (data, index) => proofRoot(
        data, siblings[index]
      )
    );

    const started = await timestamp(worker);

    const dependency = started + 180n * SECOND;
    const bidClose = started + 240n * SECOND;
    const awardClose = started + 600n * SECOND;
    const recovery = started + 900n * SECOND;
    const finalDeadline = started + 1200n * SECOND;

    console.log('=== CREATE FUNDED M3 MARKET ===');

    const quote = await view('m3_storage_quote');
    const caseBond = BigInt(quote.case_storage_cost);
    const jobBond = BigInt(quote.job_storage_cost);
    const offerBond = BigInt(quote.offer_storage_cost);
    const consentBond = BigInt(
      await view('quote_r7_v2_consent_storage')
    );

    const caseId = await creator.call(
      contract,
      'create_rescue_case',
      {
        descriptor: {
          descriptor_version: 1,
          original_provider: source.accountId,
          component_commitments: roots,
          dependency_deadline: Number(dependency),
          bid_close: Number(bidClose),
          award_close: Number(awardClose),
          recovery_deadline: Number(recovery)
        }
      },
      {attachedDeposit: caseBond.toString()}
    );

    assert.equal(caseId.length, 32);

    console.log('=== THREE INDEPENDENT BUYER FUNDS ===');

    for (let i = 0; i < 3; i++) {
      const id = await buyers[i].call(
        contract,
        'create_funded_rescue_job',
        {
          input: {
            case_id: caseId,
            worker: workers[i].accountId,
            worker_reward: UNIT.toString(),
            rescue_cap: (7n * UNIT).toString(),
            result_profile: 'ExactCommitment',
            result_commitment: Array(32).fill(9),
            threshold: null,
            final_deadline: Number(finalDeadline)
          }
        },
        {
          attachedDeposit:
            (8n * UNIT + jobBond).toString()
        }
      );

      assert.equal(Number(id), i);

      await workers[i].call(
        contract,
        'accept_rescue_job',
        {job_id: i}
      );
    }

    console.log('THREE FUNDED AND ACCEPTED JOBS: PASS');

    console.log('=== TWO FULLY BONDED PROVIDERS ===');

    for (let i = 0; i < 2; i++) {
      const id = await providers[i].call(
        contract,
        'post_rescue_offer',
        {
          input: {
            case_id: caseId,
            component_index: i,
            slot_id: `v2_slot_${i}`,
            fee: (6n * UNIT).toString(),
            bond_capacity: (12n * UNIT).toString()
          }
        },
        {
          attachedDeposit:
            (12n * UNIT + offerBond).toString()
        }
      );

      assert.equal(Number(id), i);
    }

    assert.equal(
      BigInt((await totals()).rescue_escrow),
      48n * UNIT
    );
    assert.equal(
      BigInt(await view('claimable_total')),
      0n
    );

    const initialStorage =
      caseBond + 3n * jobBond + 2n * offerBond;

    assert.equal(
      BigInt((await totals()).storage_reserves),
      initialStorage
    );

    console.log('FUNDED ESCROW: 48 UNIT');
    console.log('INITIAL LEDGER: PASS');

    console.log('=== ADVANCE TO AWARD WINDOW ===');

    await advanceTo(worker, bidClose);

    const legacy = await view(
      'preview_rescue_pair',
      {case_id: caseId}
    );

    assert.deepEqual(
      legacy.eligible_job_ids,
      [0, 1, 2]
    );

    const plan = await view(
      'preview_r7_v2_coalition',
      {
        case_id: caseId,
        selected_job_ids: [0, 1]
      }
    );

    assert.deepEqual(
      plan.selected_job_ids,
      [0, 1]
    );
    assert.deepEqual(plan.offer_ids, [0, 1]);
    assert.equal(BigInt(plan.total_price), 12n * UNIT);
    assert.equal(plan.plan_hash.length, 32);

    assert.deepEqual(
      plan.payments.map(p => BigInt(p.amount)),
      [6n * UNIT, 6n * UNIT]
    );

    console.log('ON-CHAIN DETERMINISTIC PLAN: PASS');

    const registerInput = (
      jobId,
      buyer,
      nonce,
      exact = 6n * UNIT
    ) => ({
      input: {
        case_id: caseId,
        contract: contract.accountId,
        domain: DOMAIN,
        job_id: jobId,
        buyer: buyer.accountId,
        nonce,
        plan_hash: plan.plan_hash,
        max_payment: (7n * UNIT).toString(),
        exact_payment: exact.toString(),
        expires_at: Number(awardClose)
      }
    });

    const register = (
      caller,
      jobId,
      buyer,
      nonce,
      bond = consentBond
    ) => caller.call(
      contract,
      'register_r7_v2_consent',
      registerInput(jobId, buyer, nonce),
      {
        attachedDeposit: bond.toString(),
        gas: GAS
      }
    );

    const nonceUsed = (buyer, nonce) => view(
      'is_r7_v2_nonce_used',
      {buyer: buyer.accountId, nonce}
    );

    const snapshot = async () => ({
      totals: await totals(),
      claimableTotal: await view('claimable_total'),
      bundleCount: await view('next_rescue_bundle_id'),
      case: await view(
        'get_rescue_case',
        {case_id: caseId}
      ),
      mandates: await Promise.all(
        [0, 1, 2].map(mandate)
      ),
      jobs: await Promise.all(
        [0, 1, 2].map(job)
      ),
      offers: await Promise.all(
        [0, 1].map(offer)
      ),
      consents: await Promise.all(
        [0, 1].map(consent)
      ),
      nonces: [
        await nonceUsed(buyers[0], 101),
        await nonceUsed(buyers[1], 102)
      ],
      buyers: await Promise.all(
        buyers.map(claim)
      ),
      storage: (
        await storageBytes(
          worker,
          contract.accountId
        )
      ).toString()
    });

    console.log('=== FORGED BUYER MUST FAIL ===');

    const beforeForge = await snapshot();

    await assert.rejects(() =>
      register(
        buyers[2],
        0,
        buyers[0],
        101
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeForge
    );

    console.log('FORGED CALLER ROLLBACK: PASS');

    console.log('=== UNDERFUNDED CONSENT MUST FAIL ===');

    await assert.rejects(() =>
      register(
        buyers[0],
        0,
        buyers[0],
        101,
        consentBond - 1n
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeForge
    );

    console.log('UNDERFUNDED WRITE ROLLBACK: PASS');

    console.log('=== FIRST REAL BUYER CONSENT ===');

    const beforeConsents = await storageBytes(
      worker,
      contract.accountId
    );

    await register(
      buyers[0],
      0,
      buyers[0],
      101
    );

    assert.equal(
      (await consent(0)).buyer,
      buyers[0].accountId
    );
    assert.equal(
      await nonceUsed(buyers[0], 101),
      true
    );

    console.log('=== INCOMPLETE COALITION MUST FAIL ===');

    const awardArgs = {
      case_id: caseId,
      selected_job_ids: [0, 1],
      expected_plan_hash: plan.plan_hash
    };

    const award = args => keeper.call(
      contract,
      'award_r7_v2_bundle',
      args,
      {gas: GAS}
    );

    const beforeMissing = await snapshot();

    await assert.rejects(
      () => award(awardArgs)
    );

    assert.deepEqual(
      await snapshot(),
      beforeMissing
    );

    console.log('MISSING BUYER CONSENT ROLLBACK: PASS');

    console.log('=== SECOND REAL BUYER CONSENT ===');

    await register(
      buyers[1],
      1,
      buyers[1],
      102
    );

    assert.equal(
      (await consent(1)).buyer,
      buyers[1].accountId
    );
    assert.equal(
      await nonceUsed(buyers[1], 102),
      true
    );

    assert.equal(
      BigInt((await consent(0)).exact_payment),
      6n * UNIT
    );
    assert.equal(
      BigInt((await consent(1)).exact_payment),
      6n * UNIT
    );

    const afterConsents = await storageBytes(
      worker,
      contract.accountId
    );

    assert(
      afterConsents >= beforeConsents
    );

    assert(
      afterConsents - beforeConsents <= 8192n,
      'Consent storage growth exceeds reserved bytes'
    );

    assert.equal(
      BigInt((await totals()).storage_reserves),
      initialStorage + 2n * consentBond
    );

    console.log(
      'CONSENT STORAGE GROWTH:',
      (afterConsents - beforeConsents).toString(),
      'BYTES'
    );

    console.log('TWO REAL BUYER CONSENTS: PASS');

    console.log('=== VERIFIED ON-CHAIN PREFLIGHT ===');

    const verified = await view(
      'preflight_r7_v2_award',
      awardArgs
    );

    assert.deepEqual(
      verified.plan_hash,
      plan.plan_hash
    );
    assert.deepEqual(
      verified.selected_job_ids,
      [0, 1]
    );

    console.log('AUTHORIZED PREFLIGHT: PASS');

    console.log('=== TAMPERED PLAN MUST FAIL ===');

    const beforeTamper = await snapshot();

    await assert.rejects(
      () => award({
        ...awardArgs,
        expected_plan_hash: Array(32).fill(8)
      })
    );

    assert.deepEqual(
      await snapshot(),
      beforeTamper
    );

    await assert.rejects(
      () => award({
        ...awardArgs,
        selected_job_ids: [0, 2]
      })
    );

    assert.deepEqual(
      await snapshot(),
      beforeTamper
    );

    console.log('PLAN TAMPERING ROLLBACK: PASS');

    console.log('=== LEGACY AWARD CANNOT BYPASS ===');

    await assert.rejects(
      () => keeper.call(
        contract,
        'award_rescue_bundle',
        {case_id: caseId},
        {gas: GAS}
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeTamper
    );

    console.log('LEGACY BYPASS REJECTED: PASS');

    console.log('=== ATOMIC AUTHORIZED AWARD ===');

    const beforeLiabilities =
      BigInt((await totals()).rescue_escrow) +
      BigInt(await view('claimable_total'));

    assert.equal(beforeLiabilities, 48n * UNIT);

    const bundleId = await award(awardArgs);

    assert.equal(Number(bundleId), 0);

    assert.equal(
      await view('next_rescue_bundle_id'),
      1
    );

    const awardedCase = await view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(
      awardedCase.phase,
      'BundleAwarded'
    );
    assert.equal(
      awardedCase.awarded_bundle_id,
      0
    );

    for (const id of [0, 1]) {
      const m = await mandate(id);

      assert.equal(m.phase, 'Locked');
      assert.equal(BigInt(m.held_principal), 6n * UNIT);
      assert.equal(
        BigInt(m.locked_allocation),
        6n * UNIT
      );
      assert.equal(m.locked_bundle_id, 0);
      assert.equal(
        BigInt(await claim(buyers[id])),
        UNIT
      );
    }

    const excluded = await mandate(2);
    assert.equal(excluded.phase, 'Released');
    assert.equal(
      excluded.release_reason,
      'ZeroAllocation'
    );
    assert.equal(
      BigInt(excluded.held_principal),
      0n
    );
    assert.equal(
      BigInt(await claim(buyers[2])),
      7n * UNIT
    );

    const excludedJob = await job(2);
    assert.equal(excludedJob.phase, 'Accepted');
    assert.equal(
      BigInt(excludedJob.held_worker_reward),
      UNIT
    );

    for (let i = 0; i < 2; i++) {
      const selectedOffer = await offer(i);
      assert.equal(selectedOffer.phase, 'Locked');
      assert.equal(selectedOffer.locked_bundle_id, 0);
      assert.equal(
        BigInt(selectedOffer.held_bond),
        12n * UNIT
      );

      const holder = await view(
        'capacity_lock_holder',
        {
          provider: providers[i].accountId,
          slot_id: `v2_slot_${i}`
        }
      );

      assert.deepEqual(
        holder,
        {M3RescueOffer: i}
      );
    }

    assert.equal(
      BigInt((await totals()).rescue_escrow),
      39n * UNIT
    );

    assert.equal(
      BigInt(await view('claimable_total')),
      9n * UNIT
    );

    assert.equal(
      BigInt((await totals()).storage_reserves),
      initialStorage + 2n * consentBond
    );

    assert.equal(
      BigInt((await totals()).rescue_escrow) +
      BigInt(await view('claimable_total')),
      beforeLiabilities
    );

    console.log('SELECTED BUYERS: 6 + 6 UNIT');
    console.log('EXCLUDED BUYER REFUND: 7 UNIT');
    console.log('ESCROW: 39 UNIT');
    console.log('CLAIMABLE: 9 UNIT');
    console.log('ATOMIC FINANCIAL CONSERVATION: PASS');

    console.log('=== AWARD REPLAY MUST FAIL ===');

    const afterAward = await snapshot();

    await assert.rejects(
      () => award(awardArgs)
    );

    assert.deepEqual(
      await snapshot(),
      afterAward
    );

    console.log('AWARD REPLAY ROLLBACK: PASS');



    console.log('=== PROVIDER DEFAULT SCENARIO ===');

    const expectedPhases =
      scenario === 'first-default'
        ? ['Defaulted', 'Proven']
        : scenario === 'second-default'
          ? ['Proven', 'Defaulted']
          : ['Defaulted', 'Defaulted'];

    const submit = (caller, index, data, sibling) =>
      caller.call(
        contract,
        'submit_rescue_component',
        {
          bundle_id: 0,
          component_index: index,
          payload: Array.from(data),
          sibling: Array.from(sibling)
        },
        {gas: GAS}
      );

    console.log('=== REAL MERKLE MISMATCH MUST FAIL ===');

    const beforeBadProof = await snapshot();

    // Valid component payload but wrong sibling.
    // This tests the cryptographic commitment,
    // not merely the payload-length parser.
    await assert.rejects(() =>
      submit(
        providers[0],
        0,
        proofs[0],
        siblings[1]
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeBadProof
    );

    console.log('MERKLE MISMATCH ROLLBACK: PASS');

    console.log('=== SELECTIVE PROVIDER PROOFS ===');

    for (let i = 0; i < 2; i++) {
      if (expectedPhases[i] === 'Proven') {
        await submit(
          providers[i], i,
          proofs[i], siblings[i]
        );
        assert.equal(
          (await offer(i)).phase,
          'Proven'
        );
      } else {
        assert.equal(
          (await offer(i)).phase,
          'Locked'
        );
      }
    }

    console.log('=== NO PREMATURE DEFAULT ===');

    const beforeEarly = await snapshot();

    await assert.rejects(() =>
      keeper.call(
        contract,
        'settle_rescue_bundle',
        {bundle_id: 0},
        {gas: GAS}
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeEarly
    );

    console.log('PRE-DEADLINE REJECTION: PASS');

    console.log('=== ADVANCE TO RECOVERY DEADLINE ===');

    await advanceTo(worker, recovery);

    console.log('=== PERMISSIONLESS DEFAULT SETTLEMENT ===');

    await keeper.call(
      contract,
      'settle_rescue_bundle',
      {bundle_id: 0},
      {gas: GAS}
    );

    const terminalCase = await view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(
      terminalCase.phase,
      'Closed'
    );
    assert.equal(
      terminalCase.awarded_bundle_id,
      0
    );

    console.log('=== VERIFY PROVIDER OUTCOMES ===');

    for (let i = 0; i < 2; i++) {
      const providerOffer = await offer(i);

      assert.equal(
        providerOffer.phase,
        expectedPhases[i]
      );
      assert.equal(
        BigInt(providerOffer.held_bond),
        0n
      );

      const providerCredit = BigInt(
        await view('get_claimable', {
          account: providers[i].accountId
        })
      );

      const expectedCredit =
        expectedPhases[i] === 'Proven'
          ? 18n * UNIT
          : 0n;

      assert.equal(
        providerCredit,
        expectedCredit
      );

      const storedPayload =
        terminalCase.resolved_payloads[i];

      if (expectedPhases[i] === 'Proven') {
        assert.deepEqual(
          storedPayload,
          Array.from(proofs[i])
        );
      } else {
        assert.equal(
          storedPayload,
          null
        );
      }

      const capacity = await view(
        'capacity_lock_holder',
        {
          provider: providers[i].accountId,
          slot_id: `v2_slot_${i}`
        }
      );

      assert.equal(capacity, null);
    }

    console.log('PROVIDER BONDS AND CAPACITY: PASS');

    console.log('=== VERIFY SELECTED BUYER REFUNDS ===');

    const bothDefaulted =
      scenario === 'both-default';

    const terminalBuyerRefund =
      bothDefaulted
        ? 18n * UNIT
        : 9n * UNIT;

    for (const i of [0, 1]) {
      const m = await mandate(i);

      assert.equal(m.phase, 'Released');
      assert.equal(m.release_reason, 'Settled');
      assert.equal(BigInt(m.held_principal), 0n);
      assert.equal(m.locked_bundle_id, null);
      assert.equal(m.locked_allocation, null);

      // Includes the original 1 UNIT award refund.
      assert.equal(
        BigInt(await claim(buyers[i])),
        UNIT + terminalBuyerRefund
      );
    }

    const excludedMandate = await mandate(2);

    assert.equal(
      excludedMandate.phase,
      'Released'
    );
    assert.equal(
      excludedMandate.release_reason,
      'ZeroAllocation'
    );
    assert.equal(
      BigInt(excludedMandate.held_principal),
      0n
    );
    assert.equal(
      BigInt(await claim(buyers[2])),
      7n * UNIT
    );

    for (let i = 0; i < 3; i++) {
      assert.equal(
        (await job(i)).phase,
        'Accepted'
      );
      assert.equal(
        BigInt((await job(i)).held_worker_reward),
        UNIT
      );
    }

    console.log('SPONSOR REFUNDS: PASS');
    console.log('EXCLUDED BUYER ISOLATION: PASS');

    console.log('=== VERIFY FULL ECONOMIC LEDGER ===');

    assert.equal(
      BigInt((await totals()).rescue_escrow),
      3n * UNIT
    );

    assert.equal(
      BigInt(await view('claimable_total')),
      45n * UNIT
    );

    assert.equal(
      BigInt((await totals()).storage_reserves),
      initialStorage + 2n * consentBond
    );

    assert.equal(
      BigInt((await totals()).rescue_escrow) +
      BigInt(await view('claimable_total')),
      beforeLiabilities
    );

    console.log('DEFAULT SETTLEMENT: 3 + 45 = 48');

    console.log('=== SETTLEMENT REPLAY PROTECTION ===');

    const afterSettle = await snapshot();

    await assert.rejects(() =>
      keeper.call(
        contract,
        'settle_rescue_bundle',
        {bundle_id: 0},
        {gas: GAS}
      )
    );

    assert.deepEqual(
      await snapshot(),
      afterSettle
    );

    console.log('SETTLEMENT REPLAY ROLLBACK: PASS');

    console.log('=== EXCLUDED WORKER REWARD EXPIRY ===');

    await advanceTo(worker, finalDeadline);

    await keeper.call(
      contract,
      'expire_rescue_job',
      {job_id: 2},
      {gas: GAS}
    );

    assert.equal(
      (await job(2)).phase,
      'Expired'
    );

    assert.equal(
      BigInt(await claim(buyers[2])),
      8n * UNIT
    );

    assert.equal(
      BigInt((await totals()).rescue_escrow),
      2n * UNIT
    );

    assert.equal(
      BigInt(await view('claimable_total')),
      46n * UNIT
    );

    assert.equal(
      BigInt((await totals()).rescue_escrow) +
      BigInt(await view('claimable_total')),
      beforeLiabilities
    );

    const beforeExpiryReplay = await snapshot();

    await assert.rejects(
      () => keeper.call(
        contract,
        'expire_rescue_job',
        {job_id: 2},
        {gas: GAS}
      )
    );

    assert.deepEqual(
      await snapshot(),
      beforeExpiryReplay
    );

    console.log('EXCLUDED WORKER EXPIRY: PASS');
    console.log('EXPIRY REPLAY ROLLBACK: PASS');

    console.log('=== RELEASE REMAINING WORKER REWARDS ===');

    for (const id of [0, 1]) {
      await keeper.call(
        contract,
        'expire_rescue_job',
        {job_id: id},
        {gas: GAS}
      );
      assert.equal(
        (await job(id)).phase,
        'Expired'
      );
      assert.equal(
        BigInt(await claim(buyers[id])),
        2n * UNIT + terminalBuyerRefund
      );
    }

    assert.equal(
      BigInt((await totals()).rescue_escrow),
      0n
    );

    assert.equal(
      BigInt(await view('claimable_total')),
      48n * UNIT
    );

    assert.equal(
      BigInt((await totals()).rescue_escrow) +
      BigInt(await view('claimable_total')),
      beforeLiabilities
    );

    console.log('FINAL ECONOMIC LEDGER: 0 + 48 = 48 UNIT');
    console.log('ALL WORKER REWARDS ACCOUNTED: PASS');

    console.log(
      '=== R7-06E/03B-05E DEFAULT MATRIX: PASS ==='
    );
    console.log(
      'ECONOMIC EVIDENCE: 48 = 39+9 = 3+45 = 2+46 = 0+48'
    );
    console.log(
      'PROVIDER DEFAULT MATRIX: VERIFIED'
    );
    console.log(
      'LIMIT: consent storage refund not implemented'
    );
    console.log(
      'LIMIT: public Testnet not yet deployed'
    );

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error(
    '=== R7-06E/03B-05E DEFAULT MATRIX: FAIL ==='
  );
  console.error(error.stack || error);
  process.exitCode = 1;
});
