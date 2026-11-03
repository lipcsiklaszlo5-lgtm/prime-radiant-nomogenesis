const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const YOCTO = 10n ** 24n;
const BUFFER_BYTES = 2048n;
const CASES = 6;

function near(value) {
  const sign = value < 0n ? '-' : '';
  const n = value < 0n ? -value : value;
  return sign +
    (n / YOCTO).toString() + '.' +
    (n % YOCTO).toString().padStart(24, '0').slice(0, 8);
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

    async function accountState(account) {
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
      const result = await response.json();

      if (result.error) {
        throw new Error(JSON.stringify(result.error));
      }

      return {
        balance: BigInt(result.result.amount),
        bytes: BigInt(result.result.storage_usage)
      };
    }

    console.log('=== MEASURE BASELINE ===');

    const probe = await root.devDeploy(wasm);
    const probeState = await accountState(probe);

    const bond = BigInt(
      await probe.view('storage_reserve_required', {})
    );

    assert.equal(bond % BUFFER_BYTES, 0n);
    const byteCost = bond / BUFFER_BYTES;
    assert(byteCost > 0n);

    const codeStake = probeState.bytes * byteCost;
    const margin = 8n * YOCTO / 100n;
    const initialCapital = codeStake + margin;

    console.log('Code stake:', near(codeStake));
    console.log('Operating margin:', near(margin));
    console.log('Storage bond:', near(bond));

    const contract = await root.devDeploy(wasm, {
      initialBalance: initialCapital
    });

    const buyer = await root.createSubAccount('driftbuyer');
    const primary = await root.createSubAccount('driftprimary');

    async function snapshot(label) {
      const state = await accountState(contract);

      const escrow = (
        await contract.view('escrow_totals', {})
      ).map(BigInt);

      const payout = (
        await contract.view('payout_totals', {})
      ).map(BigInt);

      const obligations = [...escrow, ...payout]
        .reduce((a, b) => a + b, 0n);

      const stake = state.bytes * byteCost;

      const surplus =
        state.balance - obligations - stake;

      const guardedSurplus =
        surplus - BUFFER_BYTES * byteCost;

      console.log(
        label,
        'bytes=' + state.bytes,
        'reserve=' + near(escrow[2]),
        'surplus=' + near(surplus),
        'guarded=' + near(guardedSurplus)
      );

      return {
        ...state,
        escrow,
        payout,
        surplus,
        guardedSurplus
      };
    }

    console.log('=== CHECK INITIAL CAPITAL ===');

    const initial = await snapshot('Initial');

    assert(initial.balance <= initialCapital);
    assert(initial.surplus > 0n);
    assert(initial.guardedSurplus > 0n);

    let previous = initial;
    const now = Date.now();

    console.log('=== SIX STORAGE ALLOCATIONS ===');

    for (let i = 0; i < CASES; i++) {
      const task = Number(await buyer.call(
        contract,
        'create_task',
        {
          primary: primary.accountId,
          root: Array(32).fill(7),
          height: 2,
          index: 2,
          primary_deadline: (now + 600000) * 1e6,
          reserve_deadline: (now + 1200000) * 1e6
        },
        {
          attachedDeposit: bond.toString()
        }
      ));

      assert.equal(task, i);

      const owner = await contract.view(
        'task_storage_bond',
        {task_id: task}
      );

      assert.deepEqual(
        owner,
        [buyer.accountId, bond.toString()]
      );

      const after = await snapshot(`Task ${i + 1}`);

      const storageGrowth =
        after.bytes - previous.bytes;

      const balanceGrowth =
        after.balance - previous.balance;

      const reserveGrowth =
        after.escrow[2] - previous.escrow[2];

      const capitalLoss =
        previous.surplus - after.surplus;

      assert(storageGrowth > 0n);

      assert.equal(reserveGrowth, bond);

      const additionalInflow = balanceGrowth - bond;

      assert(
        additionalInflow >= 0n,
        'Unexpected contract balance loss'
      );

      const expectedLoss =
        storageGrowth * byteCost - additionalInflow;

      assert.equal(
        capitalLoss,
        expectedLoss,
        'Capital accounting mismatch'
      );

      assert(
        capitalLoss > 0n,
        'Expected positive capital consumption'
      );

      console.log(
        'Additional balance inflow:',
        near(additionalInflow)
      );

      assert.equal(
        after.surplus,
        previous.surplus - capitalLoss
      );

      console.log(
        'Capital consumed:',
        near(capitalLoss),
        'NEAR'
      );

      previous = after;
    }

    console.log('=== AGGREGATE RESULT ===');

    const totalBytes = previous.bytes - initial.bytes;
    const totalLoss = initial.surplus - previous.surplus;

    const totalBonds = BigInt(CASES) * bond;

    const totalAdditionalInflow =
      previous.balance - initial.balance - totalBonds;

    assert(totalAdditionalInflow >= 0n);

    assert.equal(
      totalLoss,
      totalBytes * byteCost - totalAdditionalInflow
    );

    assert(totalLoss > 0n);

    console.log(
      'Additional balance inflow:',
      near(totalAdditionalInflow)
    );

    assert.equal(
      previous.escrow[2] - initial.escrow[2],
      BigInt(CASES) * bond
    );

    console.log('Added bytes:', totalBytes.toString());
    console.log('Collected bonds:', near(BigInt(CASES) * bond));
    console.log('Capital consumed:', near(totalLoss));
    console.log('Remaining surplus:', near(previous.surplus));
    console.log(
      'Remaining guarded surplus:',
      near(previous.guardedSurplus)
    );

    console.log('=== M2/07A CAPITAL DRIFT: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== M2/07A CAPITAL DRIFT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
