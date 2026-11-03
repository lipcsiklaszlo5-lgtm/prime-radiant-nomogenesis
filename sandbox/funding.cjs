const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const wasm = process.env.NOMOGENESIS_WASM;
const root = Array(32).fill(7);

const funding = 35n;
const collateral = 13n;

async function main() {
  let worker;

  try {
    console.log('=== START FUNDING SANDBOX ===');
    worker = await Worker.init();

    const master = worker.rootAccount;
    const contract = await master.devDeploy(wasm);

    const buyer = await master.createSubAccount('buyer');
    const primary = await master.createSubAccount('primary');
    const reserve = await master.createSubAccount('reserve');
    const stranger = await master.createSubAccount('stranger');

    const storage = BigInt(
      await contract.view('storage_reserve_required', {})
    );

    const now = Date.now();

    const taskId = await buyer.call(
      contract,
      'create_task',
      {
        primary: primary.accountId,
        root,
        height: 2,
        index: 2,
        primary_deadline: (now + 600000) * 1000000,
        reserve_deadline: (now + 1200000) * 1000000
      }
    );

    assert.equal(Number(taskId), 0);

    const budget = {
      task_id: 0,
      primary_reward: '20',
      reserve_reward: '10',
      option_premium: '3',
      keeper_bounty: '2'
    };

    const call = (actor, method, args, deposit = 0n) =>
      actor.call(
        contract,
        method,
        args,
        { attachedDeposit: deposit.toString() }
      );

    const totals = async () =>
      (await contract.view('escrow_totals', {}))
        .map(x => BigInt(x));

    assert.deepEqual(
      await totals(),
      [0n, 0n, 0n]
    );

    console.log('=== REJECT UNAUTHORIZED FUNDING ===');

    await assert.rejects(
      () => call(
        stranger,
        'fund_task',
        budget,
        funding + storage
      )
    );

    console.log('Unauthorized buyer rejected: PASS');

    console.log('=== REJECT WRONG DEPOSIT ===');

    await assert.rejects(
      () => call(
        buyer,
        'fund_task',
        budget,
        funding + storage - 1n
      )
    );

    assert.equal(
      await contract.view('is_task_funded', {task_id: 0}),
      false
    );

    console.log('Incorrect deposit rejected: PASS');

    console.log('=== AUTHENTIC BUYER DEPOSIT ===');

    await call(
      buyer,
      'fund_task',
      budget,
      funding + storage
    );

    assert.equal(
      await contract.view('is_task_funded', {task_id: 0}),
      true
    );

    assert.deepEqual(
      await totals(),
      [funding, 0n, storage]
    );

    console.log('Buyer deposit persisted: PASS');

    await assert.rejects(
      () => call(
        buyer,
        'fund_task',
        budget,
        funding + storage
      )
    );

    console.log('Double buyer funding rejected: PASS');

    await primary.call(
      contract,
      'accept_primary',
      {task_id: 0}
    );

    const offerId = await reserve.call(
      contract,
      'post_offer',
      {
        task_id: 0,
        slot_id: 'funded_slot',
        expires_at: (now + 500000) * 1000000
      }
    );

    assert.equal(Number(offerId), 0);

    console.log('=== REJECT UNFUNDED OFFER ===');

    await assert.rejects(
      () => buyer.call(
        contract,
        'select_offer',
        {task_id: 0, offer_id: 0}
      )
    );

    console.log('Unfunded option rejected: PASS');

    console.log('=== REJECT INSUFFICIENT COLLATERAL ===');

    await assert.rejects(
      () => call(
        reserve,
        'fund_offer',
        {offer_id: 0, collateral: '12'},
        12n + storage
      )
    );

    await assert.rejects(
      () => call(
        stranger,
        'fund_offer',
        {offer_id: 0, collateral: '13'},
        collateral + storage
      )
    );

    console.log('Insufficient and foreign collateral rejected: PASS');

    console.log('=== AUTHENTIC RESERVE DEPOSIT ===');

    await call(
      reserve,
      'fund_offer',
      {offer_id: 0, collateral: '13'},
      collateral + storage
    );

    assert.equal(
      await contract.view(
        'is_offer_collateralized',
        {offer_id: 0}
      ),
      true
    );

    assert.deepEqual(
      await totals(),
      [35n, 13n, storage * 2n]
    );

    console.log('Reserve collateral persisted: PASS');

    await buyer.call(
      contract,
      'select_offer',
      {task_id: 0, offer_id: 0}
    );

    const task = await contract.view(
      'get_task',
      {task_id: 0}
    );

    assert.equal(task.phase, 'OfferSelected');

    const holder = await contract.view(
      'slot_holder',
      {
        reserve: reserve.accountId,
        slot_id: 'funded_slot'
      }
    );

    assert.equal(Number(holder), 0);

    console.log('Collateralized option selected: PASS');
    console.log('=== SANDBOX/03 FUNDING: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== SANDBOX/03 FUNDING: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
