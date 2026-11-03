const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const YOCTO = 10n ** 24n;
const UNIT = YOCTO / 10n;

const rootHash =
  '37931d88e0728e9809cc9a71af1494e90174f8ecee166627eb22eac5b40c9314';

const siblings = [
  'dc5fe2eda0ba5ac4f85d2c3d30c93cef8994276ede3f4008ce395526fb9e2f35',
  '4f1acd1519355baa8c1519e131833af25e0a24c178f8791c79e9d9f34f91cdb3'
];

const bytes = hex => Array.from(Buffer.from(hex, 'hex'));

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

    async function state(contract) {
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

      return {
        balance: BigInt(body.result.amount),
        bytes: BigInt(body.result.storage_usage)
      };
    }

    console.log('=== MEASURE CONTRACT CODE CAPITAL ===');

    const probe = await root.devDeploy(wasm);
    const probeState = await state(probe);

    const reserve = BigInt(
      await probe.view('storage_reserve_required', {})
    );

    const byteCost = reserve / 2048n;

    assert.equal(reserve, 2048n * byteCost);
    assert(byteCost > 0n);

    const codeStake = probeState.bytes * byteCost;

    console.log('Baseline bytes:', probeState.bytes.toString());
    console.log('Baseline stake:', codeStake.toString());

    async function scenario(name, margin, shouldPay) {
      console.log('=== SCENARIO:', name, '===');

      const initialCapital = codeStake + margin;

      const contract = await root.devDeploy(wasm, {
        initialBalance: initialCapital
      });

      const initial = await state(contract);

      // Verify that initialBalance was actually respected.
      assert(
        initial.balance <= initialCapital,
        'Deployment unexpectedly received extra funds'
      );

      assert(
        initial.balance >= initial.bytes * byteCost,
        'Deployment lacks code-storage backing'
      );

      assert(
        initial.balance - initial.bytes * byteCost <
          margin + YOCTO / 100n,
        'Deployment has unexpected hidden capital'
      );

      console.log(
        'Actual initial NEAR balance:',
        initial.balance.toString()
      );

      const buyer = await root.createSubAccount(
        shouldPay ? 'buyerok' : 'buyerlow'
      );
      const primary = await root.createSubAccount(
        shouldPay ? 'primaryok' : 'primarylow'
      );
      const reserveAccount = await root.createSubAccount(
        shouldPay ? 'reserveok' : 'reservelow'
      );

      async function liabilities() {
        const escrow = (
          await contract.view('escrow_totals', {})
        ).map(BigInt);

        const payout = (
          await contract.view('payout_totals', {})
        ).map(BigInt);

        return {escrow, payout};
      }

      async function check(label) {
        const current = await state(contract);
        const {escrow, payout} = await liabilities();

        const obligations = [...escrow, ...payout]
          .reduce((a, b) => a + b, 0n);

        const required = obligations +
          current.bytes * byteCost;

        const surplus = current.balance - required;

        console.log(
          label,
          'surplus:',
          surplus.toString(),
          'bytes:',
          current.bytes.toString()
        );

        assert(
          surplus >= 0n,
          `${name}: economic liabilities underbacked`
        );

        return {surplus, escrow, payout};
      }

      await check('After deployment');

      const now = Date.now();

      const task = Number(await buyer.call(
        contract, 'create_task', {
          primary: primary.accountId,
          root: bytes(rootHash),
          height: 2,
          index: 2,
          primary_deadline: (now + 600000) * 1e6,
          reserve_deadline: (now + 1200000) * 1e6
        }, {
          attachedDeposit: reserve.toString()
        }
      ));

      await check('After task creation');

      await buyer.call(contract, 'fund_task', {
        task_id: task,
        primary_reward: (20n * UNIT).toString(),
        reserve_reward: (10n * UNIT).toString(),
        option_premium: (3n * UNIT).toString(),
        keeper_bounty: (2n * UNIT).toString()
      }, {
        attachedDeposit: (
          35n * UNIT + reserve
        ).toString()
      });

      await primary.call(contract, 'accept_primary', {
        task_id: task
      });

      const offer = Number(await reserveAccount.call(
        contract, 'post_offer', {
          task_id: task,
          slot_id: 'capital_test',
          expires_at: (now + 500000) * 1e6
        }, {
          attachedDeposit: reserve.toString()
        }
      ));

      await reserveAccount.call(contract, 'fund_offer', {
        offer_id: offer,
        collateral: (13n * UNIT).toString()
      }, {
        attachedDeposit: (
          13n * UNIT + reserve
        ).toString()
      });

      await buyer.call(contract, 'select_offer', {
        task_id: task,
        offer_id: offer
      });

      await check('After full funding');

      await primary.call(contract, 'submit_primary_proof', {
        task_id: task,
        payload: Array.from(Buffer.from('charlie')),
        siblings: siblings.map(bytes)
      });

      const claim = async account => BigInt(
        await contract.view('get_claimable', {
          account: account.accountId
        })
      );

      assert.equal(await claim(buyer), 12n * UNIT);
      assert.equal(await claim(primary), 20n * UNIT);
      assert.equal(await claim(reserveAccount), 16n * UNIT);

      const settled = await check('After settlement');

      assert.deepEqual(
        settled.escrow,
        [0n, 0n, 4n * reserve]
      );

      assert.deepEqual(
        settled.payout,
        [48n * UNIT, 0n]
      );

      const withdraw = () => buyer.call(
        contract,
        'withdraw',
        {amount: (5n * UNIT).toString()},
        {gas: '200000000000000'}
      );

      if (shouldPay) {
        console.log('=== EXPECT SUCCESSFUL PAYOUT ===');

        await withdraw();

        assert.equal(await claim(buyer), 7n * UNIT);

        assert.deepEqual(
          (
            await contract.view('payout_totals', {})
          ).map(BigInt),
          [43n * UNIT, 0n]
        );

        assert.equal(
          await contract.view('get_pending_withdrawal', {
            withdrawal_id: 0
          }),
          null
        );

        await check('After paid withdrawal');

        console.log(
          '=== CAPITALIZED WITHDRAWAL: PASS ==='
        );

      } else {
        console.log('=== EXPECT BACKING GUARD REJECTION ===');

        await assert.rejects(
          withdraw,
          /insufficient native NEAR backing/
        );

        assert.equal(await claim(buyer), 12n * UNIT);

        assert.deepEqual(
          (
            await contract.view('payout_totals', {})
          ).map(BigInt),
          [48n * UNIT, 0n]
        );

        assert.equal(
          await contract.view('get_pending_withdrawal', {
            withdrawal_id: 0
          }),
          null
        );

        await check('After rejected withdrawal');

        console.log(
          '=== UNDERCAPITALIZED CLAIM PROTECTED: PASS ==='
        );
      }
    }

    await scenario(
      'FUNDED',
      6n * YOCTO / 100n,
      true
    );

    await scenario(
      'LOW CAPITAL',
      15n * YOCTO / 1000n,
      false
    );

    console.log('=== M2/05D CAPITAL AUDIT: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== M2/05D CAPITAL AUDIT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
