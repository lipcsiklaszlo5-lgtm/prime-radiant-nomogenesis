
const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const rootHash =
  '37931d88e0728e9809cc9a71af1494e90174f8ecee166627eb22eac5b40c9314';

const siblings = [
  'dc5fe2eda0ba5ac4f85d2c3d30c93cef8994276ede3f4008ce395526fb9e2f35',
  '4f1acd1519355baa8c1519e131833af25e0a24c178f8791c79e9d9f34f91cdb3'
];

const bytes = hex => Array.from(Buffer.from(hex, 'hex'));

async function sandboxRpc(worker, method, params) {
  const url = worker.config?.rpcAddr;

  assert.match(
    url || '',
    /^http:\/\/127\.0\.0\.1:\d+$/,
    'Expected local sandbox RPC address'
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

  assert.equal(response.ok, true, 'Sandbox RPC HTTP failure');

  const data = await response.json();

  if (data.error) {
    throw new Error(
      method + ': ' + JSON.stringify(data.error)
    );
  }

  return data.result;
}

async function fastForwardPast(worker, target, label) {
  const goal = BigInt(Math.ceil(target));

  for (let attempt = 1; attempt <= 16; attempt++) {
    const block = await sandboxRpc(
      worker, 'block', {finality: 'optimistic'}
    );

    const current = BigInt(
      block.header.timestamp_nanosec ??
      block.header.timestamp
    );

    if (current >= goal) {
      console.log(label + ' deadline reached: PASS');
      return;
    }

    const remaining = goal - current;
    const estimate = Number(
      (remaining + 500000000n - 1n) / 500000000n
    );

    const limit = label === 'Primary' ? 250 : 5000;
    const blocks = Math.max(20, Math.min(limit, estimate));

    console.log(
      label + ' time advance:',
      blocks,
      'blocks, step',
      attempt
    );

    await sandboxRpc(
      worker,
      'sandbox_fast_forward',
      {delta_height: blocks}
    );
  }

  throw new Error(label + ' deadline was not reached');
}


async function main() {
  let worker;

  try {
    worker = await Worker.init();

    const master = worker.rootAccount;
    const contract = await master.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await master.createSubAccount('buyer');
    const primary = await master.createSubAccount('primary');
    const reserve = await master.createSubAccount('reserve');
    const keeper = await master.createSubAccount('keeper');

    const storage = BigInt(
      await contract.view('storage_reserve_required', {})
    );

    const now = Date.now();
    const primaryDeadline = Math.floor((now + 600000) * 1e6);
    const reserveDeadline = Math.floor((now + 1500000) * 1e6);
    const offerExpiry = Math.floor((now + 500000) * 1e6);

    async function createFunded(slot) {
      const task = Number(await buyer.call(
        contract, 'create_task', {
          primary: primary.accountId,
          root: bytes(rootHash),
          height: 2,
          index: 2,
          primary_deadline: primaryDeadline,
          reserve_deadline: reserveDeadline
        }
      ));

      await buyer.call(contract, 'fund_task', {
        task_id: task,
        primary_reward: '20',
        reserve_reward: '10',
        option_premium: '3',
        keeper_bounty: '2'
      }, {
        attachedDeposit: (35n + storage).toString()
      });

      await primary.call(contract, 'accept_primary', {
        task_id: task
      });

      const offer = Number(await reserve.call(
        contract, 'post_offer', {
          task_id: task,
          slot_id: slot,
          expires_at: offerExpiry
        }
      ));

      await reserve.call(contract, 'fund_offer', {
        offer_id: offer,
        collateral: '13'
      }, {
        attachedDeposit: (13n + storage).toString()
      });

      await buyer.call(contract, 'select_offer', {
        task_id: task,
        offer_id: offer
      });

      return {task, offer, slot};
    }

    async function balances() {
      const accounts = [buyer, primary, reserve, keeper];
      return Promise.all(accounts.map(async account =>
        BigInt(await contract.view('get_claimable', {
          account: account.accountId
        }))
      ));
    }

    async function audit(expected, economic, collateral) {
      const actual = await balances();
      assert.deepEqual(actual, expected);

      const totals = (
        await contract.view('escrow_totals', {})
      ).map(BigInt);

      const claims = BigInt(
        await contract.view('claimable_total', {})
      );

      assert.equal(totals[0], economic);
      assert.equal(totals[1], collateral);
      assert.equal(totals[2], 8n * storage);

      assert.equal(
        economic + collateral + claims,
        192n,
        'Economic conservation violation'
      );

      assert.equal(
        actual.reduce((a, b) => a + b, 0n),
        claims
      );
    }

    console.log('=== CREATE FOUR FUNDED OPTIONS ===');

    const tasks = [];

    for (const slot of [
      'primary_case',
      'reserve_case',
      'failure_case',
      'unactivated_case'
    ]) {
      tasks.push(await createFunded(slot));
    }

    assert.equal(new Set(tasks.map(x => x.task)).size, 4);
    assert.equal(new Set(tasks.map(x => x.offer)).size, 4);

    await audit([0n, 0n, 0n, 0n], 140n, 52n);
    console.log('Four independent funded options: PASS');

    console.log('=== PRIMARY SUCCESS SETTLEMENT ===');

    await primary.call(contract, 'submit_primary_proof', {
      task_id: tasks[0].task,
      payload: Array.from(Buffer.from('charlie')),
      siblings: siblings.map(bytes)
    });

    await audit([12n, 20n, 16n, 0n], 105n, 39n);
    console.log('Primary settlement: PASS');

    console.log('=== ACTIVATE TWO BACKUPS ===');

    await fastForwardPast(
      worker, primaryDeadline, 'Primary'
    );

    for (const i of [1, 2]) {
      await keeper.call(contract, 'trigger_backup', {
        task_id: tasks[i].task
      });
    }

    assert.deepEqual(
      await balances(),
      [12n, 20n, 16n, 0n]
    );

    console.log('Activation creates no early bounty: PASS');

    console.log('=== RESERVE SUCCESS SETTLEMENT ===');

    await reserve.call(contract, 'submit_reserve_proof', {
      task_id: tasks[1].task,
      payload: Array.from(Buffer.from('charlie')),
      siblings: siblings.map(bytes)
    });

    await audit([32n, 20n, 42n, 2n], 70n, 26n);
    console.log('Reserve success settlement: PASS');

    console.log('=== RESERVE FAILURE SETTLEMENT ===');

    await fastForwardPast(
      worker, reserveDeadline, 'Reserve'
    );

    await keeper.call(contract, 'finalize_reserve_failure', {
      task_id: tasks[2].task
    });

    await audit([78n, 20n, 42n, 4n], 35n, 13n);
    console.log('Reserve failure and collateral slash: PASS');

    console.log('=== UNACTIVATED EXPIRY SETTLEMENT ===');

    await keeper.call(contract, 'close_unactivated', {
      task_id: tasks[3].task
    });

    await audit([110n, 20n, 58n, 4n], 0n, 0n);
    console.log('Unactivated expiry settlement: PASS');

    for (const item of tasks) {
      assert.equal(
        await contract.view('is_task_settled', {
          task_id: item.task
        }),
        true
      );

      const offer = await contract.view('get_offer', {
        offer_id: item.offer
      });

      assert.equal(offer.status, 'Released');

      const holder = await contract.view('slot_holder', {
        reserve: reserve.accountId,
        slot_id: item.slot
      });

      assert.equal(holder, null);
    }

    console.log('Every slot released and settled: PASS');

    await assert.rejects(
      () => keeper.call(
        contract, 'finalize_reserve_failure', {
          task_id: tasks[2].task
        }
      )
    );

    await audit([110n, 20n, 58n, 4n], 0n, 0n);
    console.log('Repeated settlement cannot create credit: PASS');

    console.log('=== SANDBOX/04 SETTLEMENT: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== SANDBOX/04 SETTLEMENT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
