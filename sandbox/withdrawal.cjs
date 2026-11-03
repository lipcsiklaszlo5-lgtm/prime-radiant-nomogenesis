const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const YOCTO = 10n ** 24n;
const UNIT = YOCTO / 10n;
const GAS_MARGIN = YOCTO / 10n;

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
    'Expected local sandbox RPC'
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

  assert.equal(response.ok, true);

  const data = await response.json();

  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }

  return data.result;
}

async function accountBalance(worker, accountId) {
  const result = await sandboxRpc(worker, 'query', {
    request_type: 'view_account',
    account_id: accountId,
    finality: 'optimistic'
  });

  return BigInt(result.amount);
}

async function main() {
  let worker;

  try {
    console.log('=== START NEAR PAYOUT SANDBOX ===');

    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(
      process.env.NOMOGENESIS_WASM
    );

    const buyer = await root.createSubAccount('buyer');
    const primary = await root.createSubAccount('primary');
    const reserve = await root.createSubAccount('reserve');
    const outsider = await root.createSubAccount('outsider');

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
        slot_id: 'withdrawal_slot',
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
    assert.equal(await credit(primary), 20n * UNIT);
    assert.equal(await credit(reserve), 16n * UNIT);
    assert.deepEqual(
      await totals(),
      [48n * UNIT, 0n]
    );

    console.log('=== FUNDED SETTLEMENT: PASS ===');

    await assert.rejects(
      () => outsider.call(contract, 'withdraw', {
        amount: UNIT.toString()
      }, {gas: '200000000000000'})
    );

    await assert.rejects(
      () => buyer.call(contract, 'withdraw', {
        amount: '0'
      }, {gas: '200000000000000'})
    );

    await assert.rejects(
      () => buyer.call(contract, 'withdraw', {
        amount: (13n * UNIT).toString()
      }, {gas: '200000000000000'})
    );

    assert.deepEqual(
      await totals(),
      [48n * UNIT, 0n]
    );

    console.log('Unauthorized and invalid withdrawals: PASS');

    const recipients = [
      {account: buyer, amount: 5n * UNIT, remaining: 7n * UNIT},
      {account: primary, amount: 8n * UNIT, remaining: 12n * UNIT},
      {account: reserve, amount: 6n * UNIT, remaining: 10n * UNIT}
    ];

    let paid = 0n;

    for (const [index, item] of recipients.entries()) {
      const before = await accountBalance(
        worker,
        item.account.accountId
      );

      console.log(
        '=== WITHDRAWAL',
        index + 1,
        '===',
        item.account.accountId
      );

      await item.account.call(contract, 'withdraw', {
        amount: item.amount.toString()
      }, {
        gas: '200000000000000'
      });

      const after = await accountBalance(
        worker,
        item.account.accountId
      );

      const received = after - before;
      const difference = received - item.amount;

      console.log(
        'Requested transfer:',
        item.amount.toString(),
        'yoctoNEAR'
      );

      console.log(
        'Observed balance change:',
        received.toString(),
        'yoctoNEAR'
      );

      console.log(
        'Difference:',
        difference.toString(),
        'yoctoNEAR'
      );

      assert(
        difference >= -GAS_MARGIN &&
        difference <= GAS_MARGIN,
        'Balance change exceeds gas/refund tolerance'
      );

      assert.equal(
        await credit(item.account),
        item.remaining
      );

      assert.equal(
        await contract.view('get_pending_withdrawal', {
          withdrawal_id: index
        }),
        null,
        'Pending payout not finalized'
      );

      paid += item.amount;

      assert.deepEqual(
        await totals(),
        [48n * UNIT - paid, 0n]
      );

      console.log(
        'Recipient balance increase:',
        received.toString(),
        'yoctoNEAR'
      );

      console.log(
        'External transfer and callback:',
        'PASS'
      );
    }

    assert.equal(paid, 19n * UNIT);

    const remaining = 29n * UNIT;

    assert.equal(
      BigInt(await contract.view('claimable_total', {})),
      remaining
    );

    assert.deepEqual(
      await totals(),
      [remaining, 0n]
    );

    const escrow = (
      await contract.view('escrow_totals', {})
    ).map(BigInt);

    assert.deepEqual(
      escrow,
      [0n, 0n, 4n * storage]
    );

    assert.equal(
      paid + remaining,
      48n * UNIT,
      'Payout conservation failed'
    );

    console.log('=== GLOBAL PAYOUT CONSERVATION: PASS ===');

    await assert.rejects(
      () => outsider.call(
        contract,
        'on_withdraw_complete',
        {withdrawal_id: 0}
      )
    );

    assert.deepEqual(
      await totals(),
      [remaining, 0n]
    );

    console.log('Unauthorized callback rejected: PASS');
    console.log('=== SANDBOX/05 WITHDRAWAL: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== SANDBOX/05 WITHDRAWAL: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
