const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const UNIT = 10n ** 23n;
const missing = 'missing-withdrawal-target.test.near';

const rootHash =
  '37931d88e0728e9809cc9a71af1494e90174f8ecee166627eb22eac5b40c9314';

const siblings = [
  'dc5fe2eda0ba5ac4f85d2c3d30c93cef8994276ede3f4008ce395526fb9e2f35',
  '4f1acd1519355baa8c1519e131833af25e0a24c178f8791c79e9d9f34f91cdb3'
];

const bytes = hex => Array.from(Buffer.from(hex, 'hex'));

async function rpc(worker, method, params) {
  const response = await fetch(worker.config.rpcAddr, {
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

  const result = await response.json();

  if (result.error) {
    throw new Error(JSON.stringify(result.error));
  }

  return result.result;
}

async function main() {
  let worker;

  try {
    console.log('=== START FAILURE-INJECTION SANDBOX ===');

    worker = await Worker.init();

    const master = worker.rootAccount;
    const contract = await master.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await master.createSubAccount('buyer');
    const primary = await master.createSubAccount('primary');
    const reserve = await master.createSubAccount('reserve');

    await assert.rejects(() => rpc(worker, 'query', {
      request_type: 'view_account',
      account_id: missing,
      finality: 'optimistic'
    }));

    console.log('Nonexistent transfer target verified: PASS');

    const storage = BigInt(
      await contract.view('storage_reserve_required', {})
    );

    const now = Date.now();

    const task = Number(await buyer.call(
      contract, 'create_task', {
        primary: primary.accountId,
        root: bytes(rootHash),
        height: 2,
        index: 2,
        primary_deadline: (now + 600000) * 1e6,
        reserve_deadline: (now + 1200000) * 1e6
      }, { attachedDeposit: storage.toString() }
    ));

    await buyer.call(contract, 'fund_task', {
      task_id: task,
      primary_reward: (20n * UNIT).toString(),
      reserve_reward: (10n * UNIT).toString(),
      option_premium: (3n * UNIT).toString(),
      keeper_bounty: (2n * UNIT).toString()
    }, {
      attachedDeposit: (35n * UNIT + storage).toString()
    });

    await primary.call(contract, 'accept_primary', {
      task_id: task
    });

    const offer = Number(await reserve.call(
      contract, 'post_offer', {
        task_id: task,
        slot_id: 'failure_slot',
        expires_at: (now + 500000) * 1e6
      }, { attachedDeposit: storage.toString() }
    ));

    await reserve.call(contract, 'fund_offer', {
      offer_id: offer,
      collateral: (13n * UNIT).toString()
    }, {
      attachedDeposit: (13n * UNIT + storage).toString()
    });

    await buyer.call(contract, 'select_offer', {
      task_id: task,
      offer_id: offer
    });

    await primary.call(contract, 'submit_primary_proof', {
      task_id: task,
      payload: Array.from(Buffer.from('charlie')),
      siblings: siblings.map(bytes)
    });

    const credit = async account => BigInt(
      await contract.view('get_claimable', {
        account: account.accountId
      })
    );

    const totals = async () => (
      await contract.view('payout_totals', {})
    ).map(BigInt);

    assert.equal(await credit(buyer), 12n * UNIT);
    assert.deepEqual(await totals(), [48n * UNIT, 0n]);

    console.log('Funded settlement: PASS');

    console.log('=== INITIATE FAILED PAYOUT ===');

    const result = await buyer.callRaw(
      contract,
      'withdraw',
      {amount: (5n * UNIT).toString()},
      {gas: '200000000000000'}
    );

    const outcomes =
      result.receipts_outcomes ??
      result.result?.receipts_outcome ??
      [];

    const failures = outcomes.filter(item =>
      item.outcome?.status?.Failure !== undefined
    );

    console.log(
      'Failed receipt count:',
      failures.length
    );

    assert(
      failures.length >= 1,
      'Expected a failed transfer receipt'
    );

    console.log('Native transfer failure observed: PASS');

    assert.equal(
      await credit(buyer),
      12n * UNIT,
      'Failed transfer did not restore buyer credit'
    );

    assert.deepEqual(
      await totals(),
      [48n * UNIT, 0n],
      'Pending accounting not restored'
    );

    assert.equal(
      await contract.view('get_pending_withdrawal', {
        withdrawal_id: 0
      }),
      null,
      'Failed payout remains pending'
    );

    assert.equal(
      await credit(primary),
      20n * UNIT
    );

    assert.equal(
      await credit(reserve),
      16n * UNIT
    );

    await assert.rejects(() => rpc(worker, 'query', {
      request_type: 'view_account',
      account_id: missing,
      finality: 'optimistic'
    }));

    console.log('Missing receiver did not receive funds: PASS');
    console.log('Original claimant restored exactly: PASS');
    console.log('Other claimants unchanged: PASS');

    console.log('=== SANDBOX/06 FAILURE RECOVERY: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== SANDBOX/06 FAILURE RECOVERY: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
