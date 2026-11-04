const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;

async function rpc(worker, method, params) {
  const url = worker.config?.rpcAddr;
  assert.match(url || '', /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})
  });
  assert.equal(response.ok, true);
  const data = await response.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function timestamp(worker) {
  const block = await rpc(worker, 'block', {finality: 'optimistic'});
  return BigInt(block.header.timestamp_nanosec ?? block.header.timestamp);
}

async function advanceTo(worker, target) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const now = await timestamp(worker);
    if (now >= target) return;
    const blocks = Math.max(20, Math.min(100,
      Number((target - now + 500000000n - 1n) / 500000000n)));
    console.log('Fast-forward blocks:', blocks);
    await rpc(worker, 'sandbox_fast_forward', {delta_height: blocks});
  }
  throw new Error('bid close not reached');
}

async function main() {
  assert.ok(wasm, 'NOMOGENESIS_WASM is required');
  let worker;
  try {
    worker = await Worker.init();
    const root = worker.rootAccount;
    const contract = await root.devDeploy(wasm);
    const creator = await root.createSubAccount('creator');
    const source = await root.createSubAccount('source');
    const buyers = [];
    const workers = [];
    const providers = [];
    for (let i = 0; i < 3; i++) {
      buyers.push(await root.createSubAccount(`buyer${i}`));
      workers.push(await root.createSubAccount(`worker${i}`));
    }
    for (let i = 0; i < 4; i++) {
      providers.push(await root.createSubAccount(`provider${i}`));
    }
    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const jobStorage = BigInt(quote.job_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);
    const start = await timestamp(worker);
    const bidClose = start + 1500n * SECOND;
    const caseId = await creator.call(contract, 'create_rescue_case', {
      descriptor: {
        descriptor_version: 1,
        original_provider: source.accountId,
        component_commitments: [Array(32).fill(1), Array(32).fill(2)],
        dependency_deadline: Number(start + 1200n * SECOND),
        bid_close: Number(bidClose),
        award_close: Number(start + 3600n * SECOND),
        recovery_deadline: Number(start + 4800n * SECOND)
      }
    }, {attachedDeposit: caseStorage.toString()});

    console.log('=== THREE INDEPENDENT FUNDED JOBS ===');
    for (let i = 0; i < 3; i++) {
      const job = await buyers[i].call(contract, 'create_funded_rescue_job', {
        input: {
          case_id: caseId,
          worker: workers[i].accountId,
          worker_reward: (25n * UNIT).toString(),
          rescue_cap: (5n * UNIT).toString(),
          result_profile: 'ExactCommitment',
          result_commitment: Array(32).fill(10 + i),
          threshold: null,
          final_deadline: Number(start + 6000n * SECOND)
        }
      }, {attachedDeposit: (30n * UNIT + jobStorage).toString()});
      assert.equal(Number(job), i);
      await workers[i].call(contract, 'accept_rescue_job', {job_id: i});
    }

    console.log('=== UNDER-BONDED AND FULLY BONDED PAIRS ===');
    for (let i = 0; i < 4; i++) {
      const cheap = i < 2;
      const fee = (cheap ? 1n : 6n) * UNIT;
      const bond = (cheap ? 1n : 12n) * UNIT;
      const id = await providers[i].call(contract, 'post_rescue_offer', {
        input: {
          case_id: caseId,
          component_index: i % 2,
          slot_id: `slot_${i}`,
          fee: fee.toString(),
          bond_capacity: bond.toString()
        }
      }, {attachedDeposit: (bond + offerStorage).toString()});
      assert.equal(Number(id), i);
    }
    await assert.rejects(() => contract.view('preview_rescue_pair', {case_id: caseId}));
    await advanceTo(worker, bidClose);

    console.log('=== READ-ONLY DETERMINISTIC PREVIEW ===');
    const preview = await contract.view('preview_rescue_pair', {case_id: caseId});
    assert.deepEqual(preview.offer_ids, [2, 3]);
    assert.equal(BigInt(preview.total_price), 12n * UNIT);
    assert.deepEqual(preview.eligible_job_ids, [0, 1, 2]);
    assert.equal(BigInt(preview.eligible_cap_total), 15n * UNIT);
    const totals = await contract.view('m3_totals', {});
    assert.equal(BigInt(totals.rescue_escrow), 116n * UNIT);
    assert.equal(BigInt(totals.storage_reserves),
      caseStorage + 3n * jobStorage + 4n * offerStorage);
    assert.equal(await contract.view('next_rescue_bundle_id', {}), 0);
    assert.equal(await contract.view('has_rescue_bundle', {bundle_id: 0}), false);
    const caseView = await contract.view('get_rescue_case', {case_id: caseId});
    assert.equal(caseView.phase, 'Open');
    assert.equal(caseView.awarded_bundle_id, null);
    for (const i of [2, 3]) {
      assert.equal((await contract.view('get_rescue_offer', {offer_id: i})).phase, 'Open');
      assert.equal(await contract.view('capacity_lock_holder', {
        provider: providers[i].accountId, slot_id: `slot_${i}`
      }), null);
    }

    console.log('=== CAP REVOCATION REMOVES THE CANDIDATE ===');
    await buyers[2].call(contract, 'revoke_open_rescue_mandate', {job_id: 2});
    assert.equal(await contract.view('preview_rescue_pair', {case_id: caseId}), null);
    assert.equal(await contract.view('next_rescue_bundle_id', {}), 0);
    assert.equal(BigInt((await contract.view('m3_totals', {})).rescue_escrow), 111n * UNIT);
    console.log('=== SANDBOX/M3-R3-03A RESULT: PASS ===');
  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/M3-R3-03A RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
