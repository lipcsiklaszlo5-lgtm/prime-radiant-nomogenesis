const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const UNIT = 10n ** 23n;
const RESERVED_BYTES = 2048n;

async function main() {
  let worker;

  try {
    worker = await Worker.init();

    assert.match(
      worker.config.rpcAddr,
      /^http:\/\/127\.0\.0\.1:\d+$/
    );

    const root = worker.rootAccount;

    const contract = await root.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await root.createSubAccount('buyer');
    const primary = await root.createSubAccount('primary');
    const reserve = await root.createSubAccount('reserve');

    const bond = BigInt(
      await contract.view('storage_reserve_required', {})
    );

    assert.equal(bond % RESERVED_BYTES, 0n);

    const byteCost = bond / RESERVED_BYTES;

    const now = Date.now();

    const deadlines = {
      primary: (now + 600000) * 1e6,
      reserve: (now + 1200000) * 1e6,
      offer: (now + 500000) * 1e6
    };

    async function storageState(label) {
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

      assert(response.ok);

      const body = await response.json();

      if (body.error) {
        throw new Error(JSON.stringify(body.error));
      }

      const bytes = BigInt(body.result.storage_usage);
      const balance = BigInt(body.result.amount);

      const escrow = (
        await contract.view('escrow_totals', {})
      ).map(BigInt);

      const payout = (
        await contract.view('payout_totals', {})
      ).map(BigInt);

      const liabilities = [...escrow, ...payout]
        .reduce((a, b) => a + b, 0n);

      const surplus =
        balance - liabilities - bytes * byteCost;

      assert(
        surplus >= 0n,
        `${label}: negative measured solvency`
      );

      console.log(
        label,
        'bytes=' + bytes,
        'storage_reserve=' + escrow[2],
        'claimable=' + payout[0]
      );

      return {bytes, escrow, payout, surplus};
    }

    async function claim(account) {
      return BigInt(
        await contract.view('get_claimable', {
          account: account.accountId
        })
      );
    }

    async function createTask() {
      return Number(await buyer.call(
        contract,
        'create_task',
        {
          primary: primary.accountId,
          root: Array(32).fill(7),
          height: 2,
          index: 2,
          primary_deadline: deadlines.primary,
          reserve_deadline: deadlines.reserve
        },
        {
          attachedDeposit: bond.toString()
        }
      ));
    }

    async function fundTask(id) {
      await buyer.call(contract, 'fund_task', {
        task_id: id,
        primary_reward: (20n * UNIT).toString(),
        reserve_reward: (10n * UNIT).toString(),
        option_premium: (3n * UNIT).toString(),
        keeper_bounty: (2n * UNIT).toString()
      }, {
        attachedDeposit: (
          35n * UNIT + bond
        ).toString()
      });
    }

    async function postOffer(id, slot) {
      return Number(await reserve.call(
        contract,
        'post_offer',
        {
          task_id: id,
          slot_id: slot,
          expires_at: deadlines.offer
        },
        {
          attachedDeposit: bond.toString()
        }
      ));
    }

    async function fundOffer(id) {
      await reserve.call(contract, 'fund_offer', {
        offer_id: id,
        collateral: (13n * UNIT).toString()
      }, {
        attachedDeposit: (
          13n * UNIT + bond
        ).toString()
      });
    }

    async function releaseOffer(id) {
      await reserve.call(
        contract,
        'release_unaccepted_offer',
        {offer_id: id}
      );

      assert.equal(
        await contract.view('is_offer_collateralized', {
          offer_id: id
        }),
        false
      );

      const offer = await contract.view('get_offer', {
        offer_id: id
      });

      assert.equal(offer.status, 'Released');

      assert.deepEqual(
        await contract.view('offer_storage_bond', {
          offer_id: id
        }),
        [reserve.accountId, bond.toString()]
      );
    }

    const baseline = await storageState('Baseline');

    console.log('=== FIRST FUNDED OFFER RELEASE ===');

    const task1 = await createTask();

    await fundTask(task1);

    await primary.call(contract, 'accept_primary', {
      task_id: task1
    });

    const offer1 = await postOffer(task1, 'refund_slot_1');

    await fundOffer(offer1);

    const beforeFirst = await storageState('Before release 1');

    await releaseOffer(offer1);

    const afterFirst = await storageState('After release 1');

    const firstDelta =
      afterFirst.bytes - beforeFirst.bytes;

    const firstFreed = firstDelta < 0n ? -firstDelta : 0n;
    const firstRebate = (
      firstFreed * byteCost < bond
        ? firstFreed * byteCost
        : bond
    );

    assert.equal(
      beforeFirst.escrow[2] - afterFirst.escrow[2],
      firstRebate
    );

    assert.equal(
      afterFirst.payout[0] - beforeFirst.payout[0],
      13n * UNIT + firstRebate
    );

    assert.equal(
      await claim(reserve),
      13n * UNIT + firstRebate
    );

    assert.equal(
      [...beforeFirst.escrow, ...beforeFirst.payout]
        .reduce((a, b) => a + b, 0n),
      [...afterFirst.escrow, ...afterFirst.payout]
        .reduce((a, b) => a + b, 0n)
    );

    console.log(
      'First release net storage delta:',
      firstDelta.toString(),
      'bytes'
    );

    console.log('=== SECOND FUNDED OFFER RELEASE ===');

    const task2 = await createTask();

    await fundTask(task2);

    await primary.call(contract, 'accept_primary', {
      task_id: task2
    });

    const offer2 = await postOffer(task2, 'refund_slot_2');

    await fundOffer(offer2);

    const beforeSecond = await storageState('Before release 2');

    await releaseOffer(offer2);

    const afterSecond = await storageState('After release 2');

    const secondDelta =
      afterSecond.bytes - beforeSecond.bytes;

    const secondFreed = secondDelta < 0n ? -secondDelta : 0n;
    const secondRebate = (
      secondFreed * byteCost < bond
        ? secondFreed * byteCost
        : bond
    );

    assert.equal(
      beforeSecond.escrow[2] - afterSecond.escrow[2],
      secondRebate
    );

    assert.equal(
      afterSecond.payout[0] - beforeSecond.payout[0],
      13n * UNIT + secondRebate
    );

    assert.equal(
      await claim(reserve),
      26n * UNIT + firstRebate + secondRebate
    );

    assert.equal(
      [...beforeSecond.escrow, ...beforeSecond.payout]
        .reduce((a, b) => a + b, 0n),
      [...afterSecond.escrow, ...afterSecond.payout]
        .reduce((a, b) => a + b, 0n)
    );

    console.log(
      'Second release net storage delta:',
      secondDelta.toString(),
      'bytes'
    );

    // The first credit creates a new claimable record.
    // The second updates an existing claimable record.
    assert(
      firstDelta > secondDelta,
      'First and repeated credit storage behavior not distinguished'
    );

    assert(
      secondDelta < 0n,
      'Repeated funded offer release did not free net storage'
    );

    assert(secondRebate > firstRebate);

    console.log('Credit-creation overhead: VERIFIED');

    console.log('=== REFUND REPLAY PROTECTION ===');

    const replayBefore = await storageState('Before replay');

    await assert.rejects(
      () => reserve.call(
        contract,
        'release_unaccepted_offer',
        {offer_id: offer1}
      )
    );

    const replayAfter = await storageState('After replay');

    assert.equal(replayAfter.bytes, replayBefore.bytes);
    assert.deepEqual(replayAfter.escrow, replayBefore.escrow);
    assert.deepEqual(replayAfter.payout, replayBefore.payout);

    console.log('Refund replay rejected: PASS');

    console.log('=== CANCEL FUNDED TASKS ===');

    for (const task of [task1, task2]) {
      await buyer.call(
        contract,
        'cancel_unmatched',
        {task_id: task}
      );

      assert.equal(
        await contract.view('is_task_settled', {
          task_id: task
        }),
        true
      );

      // Funding records remain in persistent storage.
      assert.equal(
        await contract.view('is_task_funded', {
          task_id: task
        }),
        true
      );

      assert.deepEqual(
        await contract.view('task_storage_bond', {
          task_id: task
        }),
        [buyer.accountId, bond.toString()]
      );

      assert.equal(
        (await contract.view('get_task', {
          task_id: task
        })).phase,
        'Cancelled'
      );
    }

    assert.equal(await claim(buyer), 70n * UNIT);

    await storageState('Two tasks cancelled');

    console.log('Retained task funding records: VERIFIED');

    console.log('=== UNFUNDED RECORD RELEASE ===');

    const task3 = await createTask();

    await primary.call(contract, 'accept_primary', {
      task_id: task3
    });

    const offer3 = await postOffer(
      task3,
      'refund_slot_unfunded'
    );

    const beforeUnfunded = await storageState(
      'Before unfunded release'
    );

    await releaseOffer(offer3);

    const afterUnfunded = await storageState(
      'After unfunded release'
    );

    assert.equal(
      await contract.view('is_offer_collateralized', {
        offer_id: offer3
      }),
      false
    );

    await buyer.call(
      contract,
      'cancel_unmatched',
      {task_id: task3}
    );

    const final = await storageState('Final state');

    assert.equal(
      (await contract.view('get_task', {
        task_id: task3
      })).phase,
      'Cancelled'
    );

    assert.deepEqual(
      await contract.view('task_storage_bond', {
        task_id: task3
      }),
      [buyer.accountId, bond.toString()]
    );

    assert.deepEqual(
      final.escrow,
      [0n, 0n, 10n * bond - firstRebate - secondRebate]
    );

    assert.deepEqual(
      final.payout,
      [96n * UNIT + firstRebate + secondRebate, 0n]
    );

    assert.equal(
      await claim(reserve),
      26n * UNIT + firstRebate + secondRebate
    );
    assert.equal(await claim(buyer), 70n * UNIT);

    assert(
      final.bytes > baseline.bytes,
      'Persistent record retention not observed'
    );

    console.log('=== REFUND ELIGIBILITY FINDINGS ===');

    console.log(
      'Funded release #1 storage delta:',
      firstDelta.toString()
    );

    console.log(
      'Funded release #2 storage delta:',
      secondDelta.toString()
    );

    console.log(
      'Unfunded release storage delta:',
      (
        afterUnfunded.bytes - beforeUnfunded.bytes
      ).toString()
    );

    console.log(
      'Persistent storage growth:',
      (final.bytes - baseline.bytes).toString()
    );

    console.log(
      'Storage reserves held:',
      final.escrow[2].toString()
    );

    console.log('Economic escrow: ZERO');
    console.log('Collateral escrow: ZERO');
    console.log('Economic claims conserved: PASS');
    console.log('Storage bonds retained: PASS');
    console.log(
      'Storage refunds credited:',
      (firstRebate + secondRebate).toString()
    );

    assert.equal(
      final.escrow[2] + final.payout[0],
      10n * bond + 96n * UNIT
    );

    console.log('Total ledger conservation: PASS');

    console.log('=== M2/06B REFUND INTEGRATION: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== M2/06B REFUND INTEGRATION: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
