const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const RESERVED_BYTES = 2048n;

async function main() {
  let worker;

  try {
    console.log('=== START STORAGE ADMISSION AUDIT ===');

    worker = await Worker.init();

    const master = worker.rootAccount;

    const contract = await master.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await master.createSubAccount('buyer');
    const primary = await master.createSubAccount('primary');
    const reserve = await master.createSubAccount('reserve');
    const stranger = await master.createSubAccount('stranger');

    const required = BigInt(
      await contract.view('storage_reserve_required', {})
    );

    assert(required > 1n);
    assert.equal(required % RESERVED_BYTES, 0n);

    const byteCost = required / RESERVED_BYTES;

    const now = Date.now();

    const taskArgs = {
      primary: primary.accountId,
      root: Array(32).fill(7),
      height: 2,
      index: 2,
      primary_deadline: Math.floor((now + 600000) * 1e6),
      reserve_deadline: Math.floor((now + 1200000) * 1e6)
    };

    const offerArgs = {
      task_id: 0,
      slot_id: 'storage_admission_test',
      expires_at: Math.floor((now + 500000) * 1e6)
    };

    async function contractAccount() {
      const response = await fetch(worker.config.rpcAddr, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'query',
          params: {
            request_type: 'view_account',
            account_id: contract.accountId,
            finality: 'optimistic'
          }
        })
      });

      assert.equal(response.ok, true);

      const data = await response.json();

      if (data.error) {
        throw new Error(JSON.stringify(data.error));
      }

      return {
        bytes: BigInt(data.result.storage_usage),
        balance: BigInt(data.result.amount)
      };
    }

    async function escrow() {
      return (
        await contract.view('escrow_totals', {})
      ).map(BigInt);
    }

    async function assertSolvency(label) {
      const state = await contractAccount();
      const [economic, collateral, storage] = await escrow();

      const [claimable, pending] = (
        await contract.view('payout_totals', {})
      ).map(BigInt);

      const requiredBacking =
        state.bytes * byteCost +
        economic +
        collateral +
        storage +
        claimable +
        pending;

      assert(
        state.balance >= requiredBacking,
        `${label}: insufficient measured backing`
      );

      console.log(
        label,
        'storage bytes:',
        state.bytes.toString(),
        'reserve:',
        storage.toString()
      );

      return state;
    }

    async function rejectWithoutStorageChange(
      actor, method, args, amount, expectedBytes
    ) {
      await assert.rejects(
        () => actor.call(contract, method, args, {
          attachedDeposit: amount.toString()
        }),
        `${method} must reject invalid funding`
      );

      const state = await contractAccount();

      assert.equal(
        state.bytes,
        expectedBytes,
        'Rejected transaction changed persistent storage'
      );
    }

    console.log('=== REJECT UNFUNDED TASK CREATION ===');

    const baseline = await assertSolvency('Baseline');

    assert.deepEqual(await escrow(), [0n, 0n, 0n]);

    for (const actor of [buyer, stranger]) {
      for (const amount of [0n, required - 1n, required + 1n]) {
        await rejectWithoutStorageChange(
          actor,
          'create_task',
          taskArgs,
          amount,
          baseline.bytes
        );
      }
    }

    assert.equal(
      await contract.view('get_task', {task_id: 0}),
      null
    );

    assert.equal(
      await contract.view('task_storage_bond', {task_id: 0}),
      null
    );

    assert.deepEqual(await escrow(), [0n, 0n, 0n]);

    console.log('Six rejected task writes: PASS');

    console.log('=== AUTHENTIC TASK CREATION ===');

    const task = Number(await buyer.call(
      contract, 'create_task', taskArgs, {
        attachedDeposit: required.toString()
      }
    ));

    assert.equal(task, 0);

    assert.deepEqual(
      await contract.view('task_storage_bond', {task_id: task}),
      [buyer.accountId, required.toString()]
    );

    assert.deepEqual(
      await escrow(),
      [0n, 0n, required]
    );

    const afterTask = await assertSolvency('Task created');

    const taskGrowth = afterTask.bytes - baseline.bytes;

    assert(taskGrowth > 0n);
    assert(taskGrowth <= RESERVED_BYTES);

    console.log('Task payer, reserve and storage growth: PASS');

    await primary.call(contract, 'accept_primary', {
      task_id: task
    });

    console.log('=== REJECT UNFUNDED OFFER CREATION ===');

    const beforeOffer = await contractAccount();

    for (const actor of [reserve, stranger]) {
      for (const amount of [0n, required - 1n, required + 1n]) {
        await rejectWithoutStorageChange(
          actor,
          'post_offer',
          offerArgs,
          amount,
          beforeOffer.bytes
        );
      }
    }

    assert.equal(
      await contract.view('get_offer', {offer_id: 0}),
      null
    );

    assert.equal(
      await contract.view('offer_storage_bond', {offer_id: 0}),
      null
    );

    assert.deepEqual(
      await escrow(),
      [0n, 0n, required]
    );

    console.log('Six rejected offer writes: PASS');

    console.log('=== AUTHENTIC OFFER CREATION ===');

    const offer = Number(await reserve.call(
      contract, 'post_offer', offerArgs, {
        attachedDeposit: required.toString()
      }
    ));

    assert.equal(offer, 0);

    assert.deepEqual(
      await contract.view('offer_storage_bond', {offer_id: offer}),
      [reserve.accountId, required.toString()]
    );

    assert.deepEqual(
      await escrow(),
      [0n, 0n, 2n * required]
    );

    const final = await assertSolvency('Offer created');

    const offerGrowth = final.bytes - beforeOffer.bytes;

    assert(offerGrowth > 0n);
    assert(offerGrowth <= RESERVED_BYTES);

    const totalGrowth = final.bytes - baseline.bytes;

    assert(totalGrowth <= 2n * RESERVED_BYTES);

    assert.deepEqual(
      (
        await contract.view('payout_totals', {})
      ).map(BigInt),
      [0n, 0n]
    );

    console.log('Offer payer, reserve and storage growth: PASS');

    console.log('=== ADMISSION INVARIANTS ===');
    console.log('Rejected persistent writes: 12');
    console.log('Task storage growth:', taskGrowth.toString());
    console.log('Offer storage growth:', offerGrowth.toString());
    console.log('Total storage growth:', totalGrowth.toString());

    console.log('Storage reserves:', (2n * required).toString());

    console.log('=== SANDBOX/08 STORAGE ADMISSION: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== SANDBOX/08 STORAGE ADMISSION: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
