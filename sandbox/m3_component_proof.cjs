const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Worker } = require('near-workspaces');

const WASM = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;
const GAS = '200000000000000';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest();
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

function componentPayload(index) {
  const parts = [Buffer.from([1, index + 1, 2])];
  for (const [id, value] of [[4, 9], [8, 15]]) {
    const record = Buffer.alloc(10);
    record.writeUInt16BE(id, 0);
    record.writeBigUInt64BE(BigInt(value), 2);
    parts.push(record);
  }
  return Buffer.concat(parts);
}

function siblingFor(index) {
  return sha256(Buffer.concat([
    Buffer.from([0]),
    u64(1),
    u32(3),
    Buffer.from([1, 0x7f, index + 1])
  ]));
}

function commitment(payload, sibling) {
  const leaf = sha256(Buffer.concat([
    Buffer.from([0]),
    u64(0),
    u32(payload.length),
    payload
  ]));
  return sha256(Buffer.concat([
    Buffer.from([1]),
    leaf,
    sibling
  ]));
}

async function rpc(worker, method, params) {
  const url = worker.config?.rpcAddr;
  assert.match(url || '', /^http:\/\/127\.0\.0\.1:\d+$/);
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
  const json = await response.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function timestamp(worker) {
  const block = await rpc(worker, 'block', {
    finality: 'optimistic'
  });
  return BigInt(
    block.header.timestamp_nanosec ?? block.header.timestamp
  );
}

async function advanceTo(worker, target) {
  for (let i = 0; i < 120; i++) {
    const now = await timestamp(worker);
    if (now >= target) return;
    const blocks = Math.max(20, Math.min(100,
      Number((target - now + 500000000n - 1n) / 500000000n)
    ));
    await rpc(worker, 'sandbox_fast_forward', {
      delta_height: blocks
    });
  }
  throw new Error('Sandbox time advance failed');
}

async function main() {
  assert.ok(WASM, 'NOMOGENESIS_WASM required');

  let worker;
  try {
    worker = await Worker.init();
    const root = worker.rootAccount;
    const contract = await root.devDeploy(WASM);

    const creator = await root.createSubAccount('creator');
    const source = await root.createSubAccount('source');
    const keeper = await root.createSubAccount('keeper');
    const alpha = await root.createSubAccount('alpha');
    const beta = await root.createSubAccount('beta');
    const outsider = await root.createSubAccount('outsider');

    const buyers = [];
    const workers = [];
    for (let i = 0; i < 3; i++) {
      buyers.push(await root.createSubAccount(`buyer${i}`));
      workers.push(await root.createSubAccount(`worker${i}`));
    }

    const payloads = [componentPayload(0), componentPayload(1)];
    const siblings = [siblingFor(0), siblingFor(1)];
    const roots = payloads.map((p, i) =>
      Array.from(commitment(p, siblings[i]))
    );

    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const jobStorage = BigInt(quote.job_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);

    const start = await timestamp(worker);
    const bidClose = start + 1500n * SECOND;

    console.log('=== AUTHENTICATED COMMITMENTS ===');

    const caseId = await creator.call(
      contract,
      'create_rescue_case',
      {
        descriptor: {
          descriptor_version: 1,
          original_provider: source.accountId,
          component_commitments: roots,
          dependency_deadline: Number(start + 1200n * SECOND),
          bid_close: Number(bidClose),
          award_close: Number(start + 3600n * SECOND),
          recovery_deadline: Number(start + 4800n * SECOND)
        }
      },
      {attachedDeposit: caseStorage.toString()}
    );

    console.log('=== THREE FUNDED JOBS ===');

    for (let i = 0; i < 3; i++) {
      const jobId = await buyers[i].call(
        contract,
        'create_funded_rescue_job',
        {
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
        },
        {
          attachedDeposit: (
            30n * UNIT + jobStorage
          ).toString()
        }
      );
      assert.equal(Number(jobId), i);

      await workers[i].call(contract, 'accept_rescue_job', {
        job_id: i
      });
    }

    console.log('=== TWO FULLY BONDED PROVIDERS ===');

    for (const [index, provider] of [alpha, beta].entries()) {
      const offerId = await provider.call(
        contract,
        'post_rescue_offer',
        {
          input: {
            case_id: caseId,
            component_index: index,
            slot_id: `slot_${index}`,
            fee: (6n * UNIT).toString(),
            bond_capacity: (12n * UNIT).toString()
          }
        },
        {
          attachedDeposit: (
            12n * UNIT + offerStorage
          ).toString()
        }
      );
      assert.equal(Number(offerId), index);
    }

    await advanceTo(worker, bidClose);

    console.log('=== ATOMIC RECOVERYRIGHT AWARD ===');

    const bundleId = await keeper.call(
      contract,
      'award_rescue_bundle',
      {case_id: caseId},
      {gas: GAS}
    );
    assert.equal(Number(bundleId), 0);

    const storageBefore = (
      await contract.view('m3_totals', {})
    ).storage_reserves;

    const economicSnapshot = async () => {
      const totals = await contract.view('m3_totals', {});
      const claimable = await contract.view('claimable_total', {});
      return {
        escrow: BigInt(totals.rescue_escrow),
        claimable: BigInt(claimable),
        storage: totals.storage_reserves
      };
    };

    const before = await economicSnapshot();
    assert.equal(before.escrow, 111n * UNIT);
    assert.equal(before.claimable, 3n * UNIT);
    assert.equal(before.escrow + before.claimable, 114n * UNIT);

    const submit = (actor, index, payload, sibling, id = 0) =>
      actor.call(
        contract,
        'submit_rescue_component',
        {
          bundle_id: id,
          component_index: index,
          payload: Array.from(payload),
          sibling: Array.from(sibling)
        },
        {gas: GAS}
      );

    const assertProofPending = async () => {
      const c = await contract.view('get_rescue_case', {
        case_id: caseId
      });
      assert.deepEqual(c.resolved_payloads, [null, null]);
      assert.equal(
        (await contract.view('get_rescue_offer', {
          offer_id: 0
        })).phase,
        'Locked'
      );
    };

    console.log('=== FORGED AND UNAUTHORIZED PROOFS ===');

    await assert.rejects(() =>
      submit(outsider, 0, payloads[0], siblings[0])
    );

    await assert.rejects(() =>
      submit(alpha, 0, payloads[0], siblings[0], 999)
    );

    await assert.rejects(() =>
      submit(alpha, 2, payloads[0], siblings[0])
    );

    await assert.rejects(() =>
      submit(alpha, 1, payloads[1], siblings[1])
    );

    const forged = Buffer.from(payloads[0]);
    forged[forged.length - 1] ^= 1;

    await assert.rejects(() =>
      submit(alpha, 0, forged, siblings[0])
    );

    await assert.rejects(() =>
      submit(alpha, 0, payloads[0], siblings[0].subarray(0, 31))
    );

    await assertProofPending();
    assert.deepEqual(await economicSnapshot(), before);

    console.log('=== FIRST VALID PROVIDER PROOF ===');

    await submit(alpha, 0, payloads[0], siblings[0]);

    const afterFirst = await contract.view('get_rescue_case', {
      case_id: caseId
    });
    assert.deepEqual(
      afterFirst.resolved_payloads[0],
      Array.from(payloads[0])
    );
    assert.equal(afterFirst.resolved_payloads[1], null);
    assert.equal(
      (await contract.view('get_rescue_offer', {
        offer_id: 0
      })).phase,
      'Proven'
    );

    await assert.rejects(() =>
      submit(alpha, 0, payloads[0], siblings[0])
    );

    console.log('=== SECOND VALID PROVIDER PROOF ===');

    await submit(beta, 1, payloads[1], siblings[1]);

    const afterSecond = await contract.view('get_rescue_case', {
      case_id: caseId
    });

    assert.deepEqual(
      afterSecond.resolved_payloads,
      payloads.map(p => Array.from(p))
    );
    assert.equal(afterSecond.phase, 'BundleAwarded');
    assert.equal(
      (await contract.view('get_rescue_offer', {
        offer_id: 1
      })).phase,
      'Proven'
    );

    console.log('=== CAPACITY AND ECONOMIC CONSERVATION ===');

    for (const [i, provider] of [alpha, beta].entries()) {
      const holder = await contract.view('capacity_lock_holder', {
        provider: provider.accountId,
        slot_id: `slot_${i}`
      });
      assert.deepEqual(holder, {M3RescueOffer: i});
    }

    for (let i = 0; i < 3; i++) {
      const job = await contract.view('get_rescue_job', {
        job_id: i
      });
      assert.equal(
        BigInt(job.held_worker_reward),
        25n * UNIT
      );
    }

    const after = await economicSnapshot();
    assert.deepEqual(after, before);
    assert.equal(after.storage, storageBefore);

    console.log('=== SANDBOX/M3-R4-01 RESULT: PASS ===');

  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(err => {
  console.error('=== SANDBOX/M3-R4-01 RESULT: FAIL ===');
  console.error(err);
  process.exitCode = 1;
});
