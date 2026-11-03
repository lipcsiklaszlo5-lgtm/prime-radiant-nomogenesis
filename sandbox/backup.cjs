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
    const root = worker.rootAccount;
    const contract = await root.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await root.createSubAccount('buyer');
    const primary = await root.createSubAccount('primary');
    const reserve = await root.createSubAccount('reserve');
    const keeper = await root.createSubAccount('keeper');

    const now = Date.now();
    const primaryDeadline = (now + 90_000) * 1e6;
    const reserveDeadline = (now + 1_800_000) * 1e6;

    async function createSelected(slot) {
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

      await primary.call(contract, 'accept_primary', {
        task_id: task
      });

      const offer = Number(await reserve.call(
        contract, 'post_offer', {
          task_id: task,
          slot_id: slot,
          expires_at: primaryDeadline - 10_000_000_000
        }
      ));

      await buyer.call(contract, 'select_offer', {
        task_id: task,
        offer_id: offer
      });

      return { task, offer, slot };
    }

    const success = await createSelected('success_slot');
    const failure = await createSelected('failure_slot');

    assert.notEqual(success.task, failure.task);
    assert.notEqual(success.offer, failure.offer);

    console.log('Two independent reservations: PASS');

    await assert.rejects(
      () => keeper.call(contract, 'trigger_backup', {
        task_id: success.task
      })
    );

    console.log('Early activation rejected: PASS');

    console.log('=== ADVANCE PAST PRIMARY DEADLINE ===');
    await fastForwardPast(worker, primaryDeadline, 'Primary');

    await keeper.call(contract, 'trigger_backup', {
      task_id: success.task
    });

    await keeper.call(contract, 'trigger_backup', {
      task_id: failure.task
    });

    await assert.rejects(
      () => keeper.call(contract, 'trigger_backup', {
        task_id: success.task
      })
    );

    let state = await contract.view('get_task', {
      task_id: success.task
    });

    assert.equal(state.phase, 'BackupActive');
    assert.equal(state.backup_activator, keeper.accountId);

    console.log('Keeper activation and replay protection: PASS');

    console.log('=== RESERVE SUCCESS TRANSACTION ===');

    await reserve.call(contract, 'submit_reserve_proof', {
      task_id: success.task,
      payload: Array.from(Buffer.from('charlie')),
      siblings: siblings.map(bytes)
    });

    state = await contract.view('get_task', {
      task_id: success.task
    });

    let offer = await contract.view('get_offer', {
      offer_id: success.offer
    });

    let holder = await contract.view('slot_holder', {
      reserve: reserve.accountId,
      slot_id: success.slot
    });

    assert.equal(state.phase, 'ReserveProofAccepted');
    assert.equal(offer.status, 'Released');
    assert.equal(holder, null);

    console.log('Reserve success and slot release: PASS');

    console.log('=== ADVANCE PAST RESERVE DEADLINE ===');
    await fastForwardPast(worker, reserveDeadline, 'Reserve');

    await keeper.call(contract, 'finalize_reserve_failure', {
      task_id: failure.task
    });

    state = await contract.view('get_task', {
      task_id: failure.task
    });

    offer = await contract.view('get_offer', {
      offer_id: failure.offer
    });

    holder = await contract.view('slot_holder', {
      reserve: reserve.accountId,
      slot_id: failure.slot
    });

    assert.equal(state.phase, 'ReserveFailed');
    assert.equal(state.backup_activator, keeper.accountId);
    assert.equal(offer.status, 'Released');
    assert.equal(holder, null);

    console.log('Reserve failure and slot release: PASS');

    await assert.rejects(
      () => keeper.call(contract, 'finalize_reserve_failure', {
        task_id: failure.task
      })
    );

    console.log('Terminal replay rejected: PASS');
    console.log('=== SANDBOX/02 RESULT: PASS ===');
  } finally {
    if (worker) await worker.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/02 RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
