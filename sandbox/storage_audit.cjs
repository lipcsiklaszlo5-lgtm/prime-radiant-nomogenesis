const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const UNIT = 10n ** 23n;
const RESERVED_BYTES = 2048n;

const rootHash =
  '37931d88e0728e9809cc9a71af1494e90174f8ecee166627eb22eac5b40c9314';

const siblings = [
  'dc5fe2eda0ba5ac4f85d2c3d30c93cef8994276ede3f4008ce395526fb9e2f35',
  '4f1acd1519355baa8c1519e131833af25e0a24c178f8791c79e9d9f34f91cdb3'
];

const bytes = hex => Array.from(Buffer.from(hex, 'hex'));

async function rpc(worker, method, params) {
  assert.match(
    worker.config.rpcAddr,
    /^http:\/\/127\.0\.0\.1:\d+$/
  );

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
    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await root.createSubAccount('buyer');
    const primary = await root.createSubAccount('primary');
    const reserve = await root.createSubAccount('reserve');

    const reservePerRecord = BigInt(
      await contract.view('storage_reserve_required', {})
    );

    assert.equal(
      reservePerRecord % RESERVED_BYTES,
      0n
    );

    const byteCost = reservePerRecord / RESERVED_BYTES;

    assert(byteCost > 0n);

    const records = [];

    async function snapshot(label) {
      const account = await rpc(worker, 'query', {
        request_type: 'view_account',
        account_id: contract.accountId,
        finality: 'optimistic'
      });

      const usage = BigInt(account.storage_usage);
      const balance = BigInt(account.amount);

      const escrow = (
        await contract.view('escrow_totals', {})
      ).map(BigInt);

      const payout = (
        await contract.view('payout_totals', {})
      ).map(BigInt);

      const liabilities =
        escrow[0] +
        escrow[1] +
        escrow[2] +
        payout[0] +
        payout[1];

      const storageStake = usage * byteCost;
      const required = storageStake + liabilities;
      const surplus = balance - required;

      const previous = records.at(-1);
      const delta = previous ? usage - previous.usage : 0n;

      const record = {
        label,
        usage,
        delta,
        balance,
        escrow,
        payout,
        liabilities,
        storageStake,
        surplus
      };

      records.push(record);

      console.log(
        label.padEnd(25),
        'bytes=' + usage,
        'delta=' + delta,
        'reserve=' + escrow[2],
        'surplus=' + surplus
      );

      assert(
        surplus >= 0n,
        'Contract backing below measured liabilities'
      );

      return record;
    }

    async function credit(account) {
      return BigInt(
        await contract.view('get_claimable', {
          account: account.accountId
        })
      );
    }

    const now = Date.now();

    const deadlines = {
      primary: (now + 600000) * 1e6,
      reserve: (now + 1200000) * 1e6,
      offer: (now + 500000) * 1e6
    };

    async function createTask() {
      return Number(await buyer.call(
        contract, 'create_task', {
          primary: primary.accountId,
          root: bytes(rootHash),
          height: 2,
          index: 2,
          primary_deadline: deadlines.primary,
          reserve_deadline: deadlines.reserve
        }, { attachedDeposit: reservePerRecord.toString() }
      ));
    }

    async function fundTask(task) {
      await buyer.call(contract, 'fund_task', {
        task_id: task,
        primary_reward: (20n * UNIT).toString(),
        reserve_reward: (10n * UNIT).toString(),
        option_premium: (3n * UNIT).toString(),
        keeper_bounty: (2n * UNIT).toString()
      }, {
        attachedDeposit: (
          35n * UNIT + reservePerRecord
        ).toString()
      });
    }

    async function createOffer(task, slot) {
      return Number(await reserve.call(
        contract, 'post_offer', {
          task_id: task,
          slot_id: slot,
          expires_at: deadlines.offer
        }, { attachedDeposit: reservePerRecord.toString() }
      ));
    }

    async function fundOffer(offer) {
      await reserve.call(contract, 'fund_offer', {
        offer_id: offer,
        collateral: (13n * UNIT).toString()
      }, {
        attachedDeposit: (
          13n * UNIT + reservePerRecord
        ).toString()
      });
    }

    console.log('=== STORAGE COST CONFIGURATION ===');
    console.log('Cost per byte:', byteCost.toString());
    console.log('Reserve per record:', reservePerRecord.toString());

    console.log('=== FUNDED PRIMARY SUCCESS ===');

    const baseline = await snapshot('Deployed baseline');

    const task1 = await createTask();
    const afterCreate = await snapshot('Create task');

    await fundTask(task1);
    await snapshot('Fund task');

    await primary.call(contract, 'accept_primary', {
      task_id: task1
    });
    await snapshot('Accept primary');

    const offer1 = await createOffer(task1, 'a'.repeat(64));
    const afterOffer = await snapshot('Post offer');

    await fundOffer(offer1);
    await snapshot('Fund offer');

    await buyer.call(contract, 'select_offer', {
      task_id: task1,
      offer_id: offer1
    });
    await snapshot('Select offer');

    await primary.call(contract, 'submit_primary_proof', {
      task_id: task1,
      payload: Array.from(Buffer.from('charlie')),
      siblings: siblings.map(bytes)
    });

    await snapshot('Primary settlement');

    assert.equal(await credit(buyer), 12n * UNIT);
    assert.equal(await credit(primary), 20n * UNIT);
    assert.equal(await credit(reserve), 16n * UNIT);

    await buyer.call(contract, 'withdraw', {
      amount: (5n * UNIT).toString()
    }, {
      gas: '200000000000000'
    });

    await snapshot('Withdrawal completed');

    assert.equal(await credit(buyer), 7n * UNIT);

    console.log('=== UNSELECTED OFFER REFUND ===');

    const task2 = await createTask();
    await snapshot('Create second task');

    await fundTask(task2);
    await snapshot('Fund second task');

    await primary.call(contract, 'accept_primary', {
      task_id: task2
    });

    const offer2 = await createOffer(task2, 'b'.repeat(64));
    await snapshot('Post second offer');

    await fundOffer(offer2);
    const beforeRelease = await snapshot('Fund second offer');

    await reserve.call(contract, 'release_unaccepted_offer', {
      offer_id: offer2
    });

    const afterRelease = await snapshot('Release unselected');

    const freed = beforeRelease.usage > afterRelease.usage
      ? beforeRelease.usage - afterRelease.usage
      : 0n;

    const releaseRebate = (
      freed * byteCost < reservePerRecord
        ? freed * byteCost
        : reservePerRecord
    );

    assert.equal(
      beforeRelease.escrow[2] - afterRelease.escrow[2],
      releaseRebate
    );

    assert.equal(
      afterRelease.payout[0] - beforeRelease.payout[0],
      13n * UNIT + releaseRebate
    );

    await buyer.call(contract, 'cancel_unmatched', {
      task_id: task2
    });

    const final = await snapshot('Cancel unmatched');

    assert.equal(await credit(buyer), 42n * UNIT);
    assert.equal(await credit(primary), 20n * UNIT);
    assert.equal(await credit(reserve), 29n * UNIT + releaseRebate);

    assert.deepEqual(
      final.escrow,
      [0n, 0n, 8n * reservePerRecord - releaseRebate]
    );

    assert.deepEqual(
      final.payout,
      [91n * UNIT + releaseRebate, 0n]
    );

    console.log('=== MEASURED STORAGE FINDINGS ===');

    console.log(
      'Task creation storage growth:',
      afterCreate.usage - baseline.usage,
      'bytes'
    );

    console.log(
      'Offer creation storage growth:',
      afterOffer.delta,
      'bytes'
    );

    assert(
      afterCreate.usage > baseline.usage,
      'Task creation did not increase storage'
    );

    assert(
      afterOffer.delta > 0n,
      'Offer creation did not increase storage'
    );

    const netGrowth = final.usage - baseline.usage;
    const netGrowthCost = netGrowth * byteCost;
    const reservesHeld = final.escrow[2];

    console.log(
      'Net persistent storage growth:',
      netGrowth.toString(),
      'bytes'
    );

    console.log(
      'Net growth stake:',
      netGrowthCost.toString(),
      'yoctoNEAR'
    );

    console.log(
      'Provisional storage reserves still held:',
      reservesHeld.toString(),
      'yoctoNEAR'
    );

    console.log(
      'Difference (reserve minus net growth stake):',
      (reservesHeld - netGrowthCost).toString(),
      'yoctoNEAR'
    );

    console.log(
      'Contract backing surplus after measured liabilities:',
      final.surplus.toString(),
      'yoctoNEAR'
    );

    console.log(
      'Measured lifecycle checkpoints:',
      records.length
    );

    console.log('=== M2/05A STORAGE MEASUREMENT: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== M2/05A STORAGE MEASUREMENT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
