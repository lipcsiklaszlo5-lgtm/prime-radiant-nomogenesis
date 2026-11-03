const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const UNIT = 10n ** 23n;
const BYTE_COUNT = 2048n;
const ZERO = 0n;
const YOCTO = 10n ** 24n;

function fmtNear(value) {
  const sign = value < 0n ? '-' : '';
  const n = value < 0n ? -value : value;
  return sign + (n / YOCTO).toString() + '.' +
    (n % YOCTO).toString().padStart(24, '0').slice(0, 10);
}

async function main() {
  let worker;

  try {
    worker = await Worker.init();

    assert.match(
      worker.config.rpcAddr,
      /^http:\/\/127\.0\.0\.1:\d+$/
    );

    const root = worker.rootAccount;
    const wasm = process.env.NOMOGENESIS_WASM;

    assert(wasm, 'Missing WASM path');

    async function rawAccount(account) {
      const response = await fetch(worker.config.rpcAddr, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'query',
          params: {
            request_type: 'view_account',
            account_id: account.accountId,
            finality: 'optimistic'
          }
        })
      });

      assert(response.ok);

      const reply = await response.json();

      if (reply.error) {
        throw new Error(JSON.stringify(reply.error));
      }

      return {
        bytes: BigInt(reply.result.storage_usage),
        balance: BigInt(reply.result.amount)
      };
    }

    const probe = await root.devDeploy(wasm);

    const bond = BigInt(
      await probe.view('storage_reserve_required', {})
    );

    assert.equal(bond % BYTE_COUNT, ZERO);

    const byteCost = bond / BYTE_COUNT;
    assert(byteCost > ZERO);

    const startStake =
      (await rawAccount(probe)).bytes * byteCost;

    // 0.12 NEAR free margin above WASM storage stake.
    const margin = 12n * 10n ** 22n;

    const contract = await root.devDeploy(wasm, {
      initialBalance: startStake + margin
    });

    const initial = await rawAccount(contract);

    assert.equal(initial.balance, startStake + margin);

    const buyers = [
      await root.createSubAccount('buyer_a'),
      await root.createSubAccount('buyer_b')
    ];

    const sellers = [
      await root.createSubAccount('reserve_a'),
      await root.createSubAccount('reserve_b')
    ];

    const primary = await root.createSubAccount('primary');
    const outsider = await root.createSubAccount('outsider');

    const claim = async who => BigInt(
      await contract.view('get_claimable', {
        account: who.accountId
      })
    );

    const capitalTrace = [];

    async function snapshot() {
      const account = await rawAccount(contract);

      const escrow = (
        await contract.view('escrow_totals', {})
      ).map(BigInt);

      const payout = (
        await contract.view('payout_totals', {})
      ).map(BigInt);

      const ledger = [...escrow, ...payout]
        .reduce((a, b) => a + b, ZERO);

      const surplus =
        account.balance - account.bytes * byteCost - ledger;

      assert(
        surplus >= ZERO,
        `Negative contract backing: ${surplus}`
      );

      const guarded = surplus - 2048n * byteCost;

      const previous = capitalTrace.length
        ? capitalTrace[capitalTrace.length - 1]
        : null;

      const drift = previous
        ? surplus - previous.surplus
        : ZERO;

      capitalTrace.push({
        bytes: account.bytes,
        surplus,
        guarded,
        ledger
      });

      console.log(
        'CAPITAL TRACE',
        capitalTrace.length,
        'bytes=' + account.bytes,
        'reserve=' + fmtNear(escrow[2]),
        'claimable=' + fmtNear(payout[0]),
        'free=' + fmtNear(surplus),
        'guarded=' + fmtNear(guarded),
        'delta=' + fmtNear(drift)
      );

      return {
        ...account, escrow, payout, ledger,
        surplus, guarded
      };
    }

    const start = await snapshot();

    console.log('=== TWO BUYERS, TWO RESERVE PROVIDERS ===');
    console.log('Initial balance:', start.balance.toString());
    console.log('Initial free margin:', start.surplus.toString());

    const now = Date.now();
    const tasks = [];
    const offers = [];

    for (let i = 0; i < 2; i++) {
      const buyer = buyers[i];

      const taskId = Number(await buyer.call(
        contract,
        'create_task',
        {
          primary: primary.accountId,
          root: Array(32).fill(i + 1),
          height: 2,
          index: 2,
          primary_deadline: (now + 600000) * 1e6,
          reserve_deadline: (now + 1200000) * 1e6
        },
        {attachedDeposit: bond.toString()}
      ));

      tasks.push(taskId);

      await buyer.call(contract, 'fund_task', {
        task_id: taskId,
        primary_reward: (20n * UNIT).toString(),
        reserve_reward: (10n * UNIT).toString(),
        option_premium: (3n * UNIT).toString(),
        keeper_bounty: (2n * UNIT).toString()
      }, {
        attachedDeposit: (35n * UNIT + bond).toString()
      });

      await primary.call(contract, 'accept_primary', {
        task_id: taskId
      });

      for (let j = 0; j < 2; j++) {
        const seller = sellers[(i + j) % 2];

        const offerId = Number(await seller.call(
          contract,
          'post_offer',
          {
            task_id: taskId,
            slot_id: `audit_${i}_${j}`,
            expires_at: (now + 500000) * 1e6
          },
          {attachedDeposit: bond.toString()}
        ));

        await seller.call(contract, 'fund_offer', {
          offer_id: offerId,
          collateral: (13n * UNIT).toString()
        }, {
          attachedDeposit: (13n * UNIT + bond).toString()
        });

        offers.push({id: offerId, seller, taskId});

        assert.deepEqual(
          await contract.view('offer_storage_bond', {
            offer_id: offerId
          }),
          [seller.accountId, bond.toString()]
        );
      }

      assert.deepEqual(
        await contract.view('task_storage_bond', {
          task_id: taskId
        }),
        [buyer.accountId, bond.toString()]
      );
    }

    let state = await snapshot();

    assert.deepEqual(
      state.escrow,
      [70n * UNIT, 52n * UNIT, 12n * bond]
    );

    assert.deepEqual(state.payout, [ZERO, ZERO]);

    console.log('=== REJECT FOREIGN EARLY RELEASE ===');

    const beforeDenial = await snapshot();

    await assert.rejects(() => outsider.call(
      contract,
      'release_unaccepted_offer',
      {offer_id: offers[0].id}
    ));

    await assert.rejects(() => sellers[0].call(
      contract,
      'release_unaccepted_offer',
      {offer_id: offers[1].id}
    ));

    const afterDenial = await snapshot();

    assert.equal(afterDenial.bytes, beforeDenial.bytes);
    assert.deepEqual(afterDenial.escrow, beforeDenial.escrow);
    assert.deepEqual(afterDenial.payout, beforeDenial.payout);

    console.log('Unauthorized early release: REJECTED');

    console.log('=== CANCEL UNMATCHED TASKS ===');

    for (let i = 0; i < 2; i++) {
      await buyers[i].call(contract, 'cancel_unmatched', {
        task_id: tasks[i]
      });

      assert.equal(await claim(buyers[i]), 35n * UNIT);

      assert.equal(
        await contract.view('is_task_settled', {
          task_id: tasks[i]
        }),
        true
      );
    }

    state = await snapshot();

    assert.deepEqual(
      state.escrow,
      [ZERO, 52n * UNIT, 12n * bond]
    );

    assert.deepEqual(
      state.payout,
      [70n * UNIT, ZERO]
    );

    console.log('=== OUTSIDER RELEASES OTHER USERS OFFERS ===');

    const rebates = [ZERO, ZERO];

    // Interleaved order: reserve B, A, B, A.
    const order = JSON.parse(process.env.RELEASE_ORDER || '[2,0,1,3]');

    assert(Array.isArray(order), 'Release order must be an array');
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      [0, 1, 2, 3],
      'Each offer must occur exactly once'
    );

    console.log('Release order:', JSON.stringify(order));

    for (const index of order) {
      const offer = offers[index];
      const ownerIndex = sellers.indexOf(offer.seller);
      const otherIndex = 1 - ownerIndex;

      const pre = await snapshot();
      const preOwner = await claim(offer.seller);
      const preOther = await claim(sellers[otherIndex]);
      const preOutsider = await claim(outsider);
      const preBuyers = await Promise.all(buyers.map(claim));

      await outsider.call(
        contract,
        'release_unaccepted_offer',
        {offer_id: offer.id}
      );

      const post = await snapshot();

      const freed = pre.bytes > post.bytes
        ? pre.bytes - post.bytes
        : ZERO;

      const rebate = freed * byteCost < bond
        ? freed * byteCost
        : bond;

      rebates[ownerIndex] += rebate;

      assert.equal(pre.escrow[0], post.escrow[0]);

      assert.equal(
        pre.escrow[1] - post.escrow[1],
        13n * UNIT
      );

      assert.equal(
        pre.escrow[2] - post.escrow[2],
        rebate
      );

      assert.equal(
        post.payout[0] - pre.payout[0],
        13n * UNIT + rebate
      );

      assert.equal(post.payout[1], ZERO);
      assert.equal(pre.ledger, post.ledger);

      assert.equal(
        await claim(offer.seller),
        preOwner + 13n * UNIT + rebate
      );

      assert.equal(
        await claim(sellers[otherIndex]),
        preOther
      );

      assert.equal(await claim(outsider), preOutsider);

      assert.deepEqual(
        await Promise.all(buyers.map(claim)),
        preBuyers
      );

      assert.equal(
        await contract.view('is_offer_collateralized', {
          offer_id: offer.id
        }),
        false
      );

      assert.equal(
        (await contract.view('get_offer', {
          offer_id: offer.id
        })).status,
        'Released'
      );

      assert.deepEqual(
        await contract.view('offer_storage_bond', {
          offer_id: offer.id
        }),
        [offer.seller.accountId, bond.toString()]
      );

      console.log(
        `Offer ${offer.id}: owner=${offer.seller.accountId}` +
        ` freed=${freed} rebate=${rebate}`
      );

      const beforeReplay = await snapshot();

      await assert.rejects(() => outsider.call(
        contract,
        'release_unaccepted_offer',
        {offer_id: offer.id}
      ));

      const afterReplay = await snapshot();

      assert.equal(beforeReplay.bytes, afterReplay.bytes);
      assert.deepEqual(beforeReplay.escrow, afterReplay.escrow);
      assert.deepEqual(beforeReplay.payout, afterReplay.payout);
    }

    console.log('=== GLOBAL ACCOUNTING ===');

    const final = await snapshot();
    const totalRebate = rebates[0] + rebates[1];

    assert(rebates[0] > ZERO && rebates[1] > ZERO);

    assert.deepEqual(
      final.escrow,
      [ZERO, ZERO, 12n * bond - totalRebate]
    );

    assert.deepEqual(
      final.payout,
      [122n * UNIT + totalRebate, ZERO]
    );

    assert.equal(
      await claim(sellers[0]),
      26n * UNIT + rebates[0]
    );

    assert.equal(
      await claim(sellers[1]),
      26n * UNIT + rebates[1]
    );

    assert.equal(await claim(outsider), ZERO);

    assert.equal(
      final.ledger,
      122n * UNIT + 12n * bond
    );

    console.log('Cross-owner accounting and replay: PASS');

    console.log('=== NATIVE WITHDRAWAL OF REFUND CREDIT ===');

    const ownRebate = rebates[0];
    const otherBefore = await claim(sellers[1]);
    const buyerBefore = await Promise.all(buyers.map(claim));

    await sellers[0].call(contract, 'withdraw', {
      amount: ownRebate.toString()
    }, {
      gas: '200000000000000'
    });

    assert.equal(
      await claim(sellers[0]),
      26n * UNIT
    );

    assert.equal(await claim(sellers[1]), otherBefore);

    assert.deepEqual(
      await Promise.all(buyers.map(claim)),
      buyerBefore
    );

    const afterWithdrawal = await snapshot();

    console.log('=== MIXED LIFECYCLE CAPITAL SUMMARY ===');

    const byteGrowth = afterWithdrawal.bytes - start.bytes;
    const stakeGrowth = byteGrowth * byteCost;

    const balanceChange =
      afterWithdrawal.balance - start.balance;

    const liabilityChange =
      afterWithdrawal.ledger - start.ledger;

    const capitalChange =
      afterWithdrawal.surplus - start.surplus;

    assert.equal(
      capitalChange,
      balanceChange - liabilityChange - stakeGrowth
    );

    assert(capitalTrace.length >= 20);
    assert(afterWithdrawal.surplus >= ZERO);

    console.log('Storage growth:', byteGrowth.toString());
    console.log('Stake growth:', fmtNear(stakeGrowth));
    console.log('Balance change:', fmtNear(balanceChange));
    console.log('Liability change:', fmtNear(liabilityChange));
    console.log('Net capital change:', fmtNear(capitalChange));
    console.log(
      'Remaining free capital:',
      fmtNear(afterWithdrawal.surplus)
    );
    console.log(
      'Remaining guarded capital:',
      fmtNear(afterWithdrawal.guarded)
    );
    console.log(
      'Storage reserve still recorded:',
      fmtNear(afterWithdrawal.escrow[2])
    );

    assert.deepEqual(afterWithdrawal.escrow, final.escrow);

    assert.deepEqual(
      afterWithdrawal.payout,
      [final.payout[0] - ownRebate, ZERO]
    );

    console.log('Native rebate withdrawal: PASS');
    console.log('=== M2/07B MIXED LIFECYCLE TRACE: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== M2/07B MIXED LIFECYCLE TRACE: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
