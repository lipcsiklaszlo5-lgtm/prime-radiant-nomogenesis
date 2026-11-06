'use strict';

const {
  createIsolatedBuyerAgent
} = require('../scripts/m3/r7_v2_buyer_bridge.cjs');


const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {Worker} = require('near-workspaces');
const {
  componentFromCsv,
  minimumCommitment,
  makeWorkerResult
} = require('../scripts/m3/r5_data_envelope.cjs');

const WASM = process.env.NOMOGENESIS_V2_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;
const GAS = '200000000000000';
const DOMAIN = 'NOMOGENESIS/R7-06E/SUBSET/V1';
const dataDir = path.join(__dirname, '..', 'demo', 'data');
const dataFiles = [
  path.join(dataDir, 'quantities.csv'),
  path.join(dataDir, 'prices.csv')
];

function totalFromRecovered(payloads) {
  const rows = payloads.map((bytes, kind) => {
    const payload = Buffer.from(bytes);
    assert.equal(payload[0], 1);
    assert.equal(payload[1], kind + 1);
    const count = payload[2];
    assert(count >= 1 && count <= 16);
    assert.equal(payload.length, 3 + 10 * count);

    let previous = -1;
    return Array.from({length: count}, (_, i) => {
      const offset = 3 + 10 * i;
      const id = payload.readUInt16BE(offset);
      assert(id > previous);
      previous = id;
      return [id, payload.readBigUInt64BE(offset + 2)];
    });
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, rows[1].length);
  let total = 0n;
  for (let i = 0; i < rows[0].length; i++) {
    assert.equal(rows[0][i][0], rows[1][i][0]);
    total += rows[0][i][1] * rows[1][i][1];
  }
  return total;
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
  let service;
  const isolatedBuyerChildren = [];

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
        await createIsolatedBuyerAgent(
          root, worker, i, isolatedBuyerChildren
        )
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

    const started = await timestamp(worker);

    const components = dataFiles.map((file, index) =>
      componentFromCsv(file, index)
    );
    const thresholds = [500n, 600n, 632n];

    let serviceAvailable = true;
    service = http.createServer((request, response) => {
      const index = ['/quantities', '/prices'].indexOf(request.url);
      if (!serviceAvailable || index < 0) {
        response.writeHead(503).end('dependency unavailable');
        return;
      }
      response.writeHead(200, {'content-type': 'text/csv'});
      response.end(fs.readFileSync(dataFiles[index]));
    });
    await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${service.address().port}`;
    for (const name of ['/quantities', '/prices']) {
      const response = await fetch(endpoint + name);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /^item_id,/);
    }
    console.log('SHARED CSV DEPENDENCY HEALTHY: PASS');

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
          component_commitments: components.map(item => Array.from(item.root)),
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
            result_profile: 'MinimumThreshold',
            result_commitment: Array.from(
              minimumCommitment(caseId, thresholds[i])
            ),
            threshold: thresholds[i].toString(),
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

    serviceAvailable = false;
    const failureObservedAt = await timestamp(worker);
    for (const name of ['/quantities', '/prices']) {
      const response = await fetch(endpoint + name);
      assert.equal(response.status, 503);
    }
    console.log('SHARED CSV DEPENDENCY FAILED: PASS');

    console.log('=== ADVANCE TO AWARD WINDOW ===');

    await advanceTo(worker, bidClose);
    assert((await timestamp(worker)) >= dependency);

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

    console.log('=== THREE INDEPENDENT BUYER DECISIONS ===');

    const decisions = [];

    for (let i = 0; i < 3; i++) {
      const decision = await buyers[i].evaluatePayment(
        6n * UNIT
      );

      decisions.push(decision);

      console.log(
        'VERIFIED BUYER DECISION:',
        buyers[i].accountId,
        decision.approved ? 'ACCEPT' : 'REJECT'
      );
    }

    assert.equal(decisions[0].approved, true);
    assert.equal(decisions[1].approved, true);
    assert.equal(decisions[2].approved, false);

    assert.equal(
      new Set(buyers.map(b => b.pid)).size,
      3
    );

    assert.equal(
      new Set(buyers.map(b => b.publicKey)).size,
      3
    );

    console.log(
      'THREE DISTINCT AGENT SIGNATURES: PASS'
    );

    console.log(
      'VOLUNTARY BUYER REFUSAL: PASS'
    );

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

    const proofArgs = index => ({
      bundle_id: bundleId,
      component_index: index,
      payload: Array.from(components[index].payload),
      sibling: Array.from(components[index].sibling)
    });

    console.log('=== REPLACEMENT PROVIDERS DELIVER CSV COMPONENTS ===');
    const beforeProof = await snapshot();
    await assert.rejects(() =>
      keeper.call(contract, 'submit_rescue_component', proofArgs(0),
        {gas: GAS})
    );
    assert.deepEqual(await snapshot(), beforeProof);

    const invalid = proofArgs(0);
    invalid.payload[12] ^= 1;
    await assert.rejects(
      () => providers[0].call(contract, 'submit_rescue_component', invalid,
        {gas: GAS}),
      /invalid component Merkle proof/
    );
    assert.deepEqual(await snapshot(), beforeProof);
    console.log('FORGED PROVIDER AND ALTERED VALID PAYLOAD: REJECTED');

    for (let i = 0; i < 2; i++) {
      await providers[i].call(contract, 'submit_rescue_component',
        proofArgs(i), {gas: GAS});
    }

    const proven = await view('get_rescue_case', {case_id: caseId});
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(proven.resolved_payloads[i],
        Array.from(components[i].payload));
      assert.equal((await offer(i)).phase, 'Proven');
    }
    const restoredAt = await timestamp(worker);
    console.log('TWO CSV COMPONENTS VERIFIED ON CHAIN: PASS');
    console.log('SIMULATED CHAIN RECOVERY SECONDS:',
      ((restoredAt - failureObservedAt) / SECOND).toString());

    console.log('=== SETTLE PROVIDERS AND CONTINUE SELECTED JOBS ===');
    await keeper.call(contract, 'settle_rescue_bundle',
      {bundle_id: bundleId}, {gas: GAS});
    for (const provider of providers) {
      assert.equal(BigInt(await view('get_claimable',
        {account: provider.accountId})), 18n * UNIT);
    }
    assert.equal(BigInt((await totals()).rescue_escrow), 3n * UNIT);
    assert.equal(BigInt(await view('claimable_total')), 45n * UNIT);

    const recoveredData = {
      total: totalFromRecovered(proven.resolved_payloads)
    };
    assert.equal(recoveredData.total, 632n);
    console.log('WORKER INPUT FROM VERIFIED CHAIN PAYLOADS: PASS');

    for (const i of [0, 1]) {
      const result = makeWorkerResult(
        recoveredData, caseId, i, thresholds[i]
      );
      assert.deepEqual(result.commitment,
        minimumCommitment(caseId, thresholds[i]));
      if (i === 0) {
        const badResult = Array.from(result.payload);
        badResult[25] ^= 1;
        await assert.rejects(() => workers[i].call(
          contract, 'complete_rescue_job',
          {job_id: i, result_payload: badResult}, {gas: GAS}
        ));
        assert.equal((await job(i)).phase, 'Accepted');
      }
      await workers[i].call(contract, 'complete_rescue_job',
        {job_id: i, result_payload: Array.from(result.payload)},
        {gas: GAS});
      assert.equal((await job(i)).phase, 'Completed');
      assert.equal(BigInt(await view('get_claimable',
        {account: workers[i].accountId})), UNIT);
    }
    assert.equal(BigInt((await totals()).rescue_escrow), UNIT);
    assert.equal(BigInt(await view('claimable_total')), 47n * UNIT);
    console.log('TWO SELECTED WORKER RESULTS COMPLETED: PASS');
    console.log('PROVIDERS CREDITED: 18 + 18 UNIT');

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

    console.log(
      '=== R7-DEMO-02 RECOVERY LIFECYCLE: PASS ==='
    );
    console.log(
      'ECONOMIC EVIDENCE: 48 = 39 + 9 = 3 + 45 = 1 + 47 = 0 + 48'
    );
    console.log('LIMIT: source outage is local HTTP 503 simulation');
    console.log(
      'LIMIT: consent storage refund not implemented'
    );
    console.log(
      'LIMIT: public Testnet not yet deployed'
    );

  } finally {
    if (service) {
      service.closeAllConnections?.();
      await new Promise(resolve => service.close(resolve));
    }
    for (const child of isolatedBuyerChildren) {
      if (!child.killed) child.kill();
    }

    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error(
    '=== R7-06E/03B-05C ECONOMIC SANDBOX: FAIL ==='
  );
  console.error(error.stack || error);
  process.exitCode = 1;
});
