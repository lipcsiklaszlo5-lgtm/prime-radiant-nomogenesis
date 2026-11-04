const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Worker } = require('near-workspaces');

const WASM = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;
const GAS = '200000000000000';

const amount = n => (BigInt(n) * UNIT).toString();
const hash = b => crypto.createHash('sha256').update(b).digest();

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function payload(component, scenario) {
  const parts = [Buffer.from([1, component + 1, 2])];
  for (const [id, value] of [[4, 9 + scenario], [8, 15 + scenario]]) {
    const record = Buffer.alloc(10);
    record.writeUInt16BE(id, 0);
    record.writeBigUInt64BE(BigInt(value), 2);
    parts.push(record);
  }
  return Buffer.concat(parts);
}

function sibling(component) {
  return hash(Buffer.concat([
    Buffer.from([0]),
    u64(1),
    u32(3),
    Buffer.from([1, 0x7f, component + 1])
  ]));
}

function commitment(data, proofSibling) {
  const leaf = hash(Buffer.concat([
    Buffer.from([0]),
    u64(0),
    u32(data.length),
    data
  ]));
  return Array.from(hash(Buffer.concat([
    Buffer.from([1]),
    leaf,
    proofSibling
  ])));
}

async function rpc(worker, method, params) {
  const url = worker.config?.rpcAddr;
  assert.match(url || '', /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method, params
    })
  });
  assert.equal(response.ok, true);
  const result = await response.json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.result;
}

async function accountState(worker, accountId) {
  return rpc(worker, 'query', {
    request_type: 'view_account',
    account_id: accountId,
    finality: 'optimistic'
  });
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
    console.log('ADVANCE BLOCKS:', blocks);
    await rpc(worker, 'sandbox_fast_forward', {
      delta_height: blocks
    });
  }
  throw new Error('Sandbox time target not reached');
}

async function snapshot(contract) {
  const totals = await contract.view('m3_totals', {});
  return {
    escrow: BigInt(totals.rescue_escrow),
    claimable: BigInt(
      await contract.view('claimable_total', {})
    ),
    storage: BigInt(totals.storage_reserves)
  };
}

async function main() {
  assert.ok(WASM, 'Missing compatible WASM');
  let worker;

  try {
    worker = await Worker.init();
    const root = worker.rootAccount;
    const contract = await root.devDeploy(WASM);

    const creator = await root.createSubAccount('creator');
    const source = await root.createSubAccount('source');
    const keeper = await root.createSubAccount('keeper');
    const outsider = await root.createSubAccount('outsider');
    const providers = [
      await root.createSubAccount('alpha'),
      await root.createSubAccount('beta')
    ];

    const buyers = [];
    const workers = [];
    for (let i = 0; i < 3; i++) {
      buyers.push(await root.createSubAccount(`buyer${i}`));
      workers.push(await root.createSubAccount(`worker${i}`));
    }

    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const jobStorage = BigInt(quote.job_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);

    const start = await timestamp(worker);
    const bidClose = start + 1500n * SECOND;
    const recoveryDeadline = start + 4800n * SECOND;

    const cases = [];

    console.log('=== CREATE FOUR INDEPENDENT RECOVERYRIGHT CASES ===');

    for (let s = 0; s < 4; s++) {
      console.log('CASE', s, 'FUNDING');

      const data = [payload(0, s), payload(1, s)];
      const siblings = [sibling(0), sibling(1)];
      const roots = data.map((p, i) =>
        commitment(p, siblings[i])
      );

      const caseId = await creator.call(
        contract, 'create_rescue_case', {
          descriptor: {
            descriptor_version: 1,
            original_provider: source.accountId,
            component_commitments: roots,
            dependency_deadline: Number(start + 1200n * SECOND),
            bid_close: Number(bidClose),
            award_close: Number(start + 3600n * SECOND),
            recovery_deadline: Number(recoveryDeadline)
          }
        }, {attachedDeposit: caseStorage.toString()}
      );

      const jobIds = [];
      const offerIds = [];

      for (let i = 0; i < 3; i++) {
        const id = Number(await buyers[i].call(
          contract, 'create_funded_rescue_job', {
            input: {
              case_id: caseId,
              worker: workers[i].accountId,
              worker_reward: amount(25),
              rescue_cap: amount(5),
              result_profile: 'ExactCommitment',
              result_commitment: Array(32).fill(10 + i),
              threshold: null,
              final_deadline: Number(start + 6000n * SECOND)
            }
          }, {
            attachedDeposit: (
              30n * UNIT + jobStorage
            ).toString()
          }
        ));

        assert.equal(id, s * 3 + i);
        jobIds.push(id);

        await workers[i].call(
          contract, 'accept_rescue_job', {job_id: id}
        );
      }

      for (let i = 0; i < 2; i++) {
        const id = Number(await providers[i].call(
          contract, 'post_rescue_offer', {
            input: {
              case_id: caseId,
              component_index: i,
              slot_id: `slot_${s}_${i}`,
              fee: amount(6),
              bond_capacity: amount(12)
            }
          }, {
            attachedDeposit: (
              12n * UNIT + offerStorage
            ).toString()
          }
        ));

        assert.equal(id, s * 2 + i);
        offerIds.push(id);
      }

      cases.push({
        caseId, jobIds, offerIds, data, siblings,
        bundleId: null
      });
    }

    console.log('=== AWARD ALL FOUR BUNDLES ===');
    await advanceTo(worker, bidClose);

    for (const [s, item] of cases.entries()) {
      item.bundleId = Number(await keeper.call(
        contract, 'award_rescue_bundle',
        {case_id: item.caseId},
        {gas: GAS}
      ));
      assert.equal(item.bundleId, s);
      assert.equal(
        (await contract.view('get_rescue_case', {
          case_id: item.caseId
        })).phase,
        'BundleAwarded'
      );
    }

    const before = await snapshot(contract);
    assert.equal(before.escrow, 444n * UNIT);
    assert.equal(before.claimable, 12n * UNIT);
    assert.equal(
      before.escrow + before.claimable,
      456n * UNIT
    );

    console.log('POST-AWARD CONSERVATION: PASS');

    const submit = (s, i) =>
      providers[i].call(
        contract, 'submit_rescue_component', {
          bundle_id: cases[s].bundleId,
          component_index: i,
          payload: Array.from(cases[s].data[i]),
          sibling: Array.from(cases[s].siblings[i])
        }, {gas: GAS}
      );

    console.log('=== AUTHENTICATED PROOFS ===');

    await submit(0, 0);
    await submit(0, 1);
    await submit(1, 0);
    await submit(2, 1);

    assert.deepEqual(await snapshot(contract), before);

    console.log('=== EARLY DEFAULT REJECTION ===');

    await assert.rejects(() =>
      outsider.call(
        contract, 'settle_rescue_bundle',
        {bundle_id: cases[1].bundleId},
        {gas: GAS}
      )
    );

    await assert.rejects(() =>
      outsider.call(
        contract, 'settle_rescue_bundle',
        {bundle_id: cases[3].bundleId},
        {gas: GAS}
      )
    );

    assert.deepEqual(await snapshot(contract), before);
    console.log('PRE-DEADLINE PROTECTION: PASS');

    const storageBefore = BigInt(
      (await accountState(worker, contract.accountId)).storage_usage
    );

    console.log('=== SUCCESS SETTLES BEFORE DEADLINE ===');

    await outsider.call(
      contract, 'settle_rescue_bundle',
      {bundle_id: cases[0].bundleId},
      {gas: GAS}
    );

    let current = await snapshot(contract);
    assert.equal(current.escrow, 408n * UNIT);
    assert.equal(current.claimable, 48n * UNIT);
    assert.equal(current.storage, before.storage);

    await assert.rejects(() =>
      outsider.call(
        contract, 'settle_rescue_bundle',
        {bundle_id: cases[0].bundleId},
        {gas: GAS}
      )
    );

    console.log('=== DEADLINE AND DEFAULT SETTLEMENT ===');
    await advanceTo(worker, recoveryDeadline);

    for (let s = 1; s < 4; s++) {
      console.log('SETTLEMENT CASE', s);

      const old = await snapshot(contract);

      await keeper.call(
        contract, 'settle_rescue_bundle',
        {bundle_id: cases[s].bundleId},
        {gas: GAS}
      );

      const updated = await snapshot(contract);
      assert.equal(updated.escrow, old.escrow - 36n * UNIT);
      assert.equal(
        updated.claimable, old.claimable + 36n * UNIT
      );
      assert.equal(updated.storage, old.storage);
    }

    console.log('=== VERIFY TERMINAL PERSISTENCE ===');

    const expected = [
      ['Proven', 'Proven'],
      ['Proven', 'Defaulted'],
      ['Defaulted', 'Proven'],
      ['Defaulted', 'Defaulted']
    ];

    for (const [s, item] of cases.entries()) {
      const caseView = await contract.view('get_rescue_case', {
        case_id: item.caseId
      });

      assert.equal(caseView.phase, 'Closed');
      assert.equal(caseView.awarded_bundle_id, item.bundleId);

      for (let i = 0; i < 2; i++) {
        const offer = await contract.view('get_rescue_offer', {
          offer_id: item.offerIds[i]
        });

        assert.equal(offer.phase, expected[s][i]);
        assert.equal(BigInt(offer.held_bond), 0n);
        assert.equal(offer.locked_bundle_id, item.bundleId);

        const proof = caseView.resolved_payloads[i];
        if (expected[s][i] === 'Proven') {
          assert.deepEqual(proof, Array.from(item.data[i]));
        } else {
          assert.equal(proof, null);
        }

        const lock = await contract.view(
          'capacity_lock_holder', {
            provider: providers[i].accountId,
            slot_id: `slot_${s}_${i}`
          }
        );
        assert.equal(lock, null);
      }

      for (const jobId of item.jobIds) {
        const mandate = await contract.view(
          'get_rescue_mandate', {job_id: jobId}
        );
        assert.equal(mandate.phase, 'Released');
        assert.equal(mandate.release_reason, 'Settled');
        assert.equal(BigInt(mandate.held_principal), 0n);
        assert.equal(mandate.locked_bundle_id, null);
        assert.equal(mandate.locked_allocation, null);

        const job = await contract.view(
          'get_rescue_job', {job_id: jobId}
        );
        assert.equal(job.phase, 'Accepted');
        assert.equal(
          BigInt(job.held_worker_reward), 25n * UNIT
        );
      }
    }

    const getCredit = async account => BigInt(
      await contract.view('get_claimable', {
        account: account.accountId
      })
    );

    for (const buyer of buyers) {
      assert.equal(await getCredit(buyer), 28n * UNIT);
    }
    for (const provider of providers) {
      assert.equal(await getCredit(provider), 36n * UNIT);
    }

    current = await snapshot(contract);

    assert.equal(current.escrow, 300n * UNIT);
    assert.equal(current.claimable, 156n * UNIT);
    assert.equal(current.storage, before.storage);
    assert.equal(
      current.escrow + current.claimable,
      456n * UNIT
    );

    console.log('=== ECONOMIC CONSERVATION: PASS ===');
    console.log('FOUR BUNDLES: 4 * 3Q = 144 UNITS');
    console.log('WORKER REWARDS HELD: 300 UNITS');
    console.log('CLAIMABLE AFTER SETTLEMENT: 156 UNITS');

    const storageAfter = BigInt(
      (await accountState(worker, contract.accountId)).storage_usage
    );
    console.log(
      'SETTLEMENT STORAGE DELTA (BYTES):',
      (storageAfter - storageBefore).toString()
    );

    console.log('=== NATIVE WITHDRAWAL CHECK ===');

    const withdrawal = 20n * UNIT;
    const recipient = buyers[0];
    const balanceBefore = BigInt(
      (await accountState(worker, recipient.accountId)).amount
    );

    await recipient.call(
      contract, 'withdraw',
      {amount: withdrawal.toString()},
      {gas: GAS}
    );

    const balanceAfter = BigInt(
      (await accountState(worker, recipient.accountId)).amount
    );

    const received = balanceAfter - balanceBefore;
    console.log(
      'RECIPIENT NET BALANCE CHANGE:',
      received.toString()
    );

    const estimatedFee = withdrawal - received;
    console.log('TRANSFER AMOUNT:', withdrawal.toString());
    console.log('ESTIMATED TRANSACTION COST:', estimatedFee.toString());

    assert(
      received > 0n &&
      estimatedFee >= 0n &&
      estimatedFee <= 15n * UNIT,
      'Unexpected withdrawal amount / transaction cost'
    );

    assert.equal(await getCredit(recipient), 8n * UNIT);
    assert.equal(
      await contract.view('get_pending_withdrawal', {
        withdrawal_id: 0
      }),
      null
    );

    const finalState = await snapshot(contract);
    assert.equal(finalState.escrow, 300n * UNIT);
    assert.equal(finalState.claimable, 136n * UNIT);
    assert.equal(finalState.storage, before.storage);

    const payout = (
      await contract.view('payout_totals', {})
    ).map(BigInt);

    assert.deepEqual(payout, [136n * UNIT, 0n]);
    assert.equal(
      finalState.escrow +
        finalState.claimable +
        withdrawal,
      456n * UNIT
    );

    console.log('=== SANDBOX/M3-R4-03 RESULT: PASS ===');

  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/M3-R4-03 RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
