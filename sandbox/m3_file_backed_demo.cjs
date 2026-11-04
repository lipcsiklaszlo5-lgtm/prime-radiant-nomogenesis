'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {Worker} = require('near-workspaces');
const {
  createIsolatedSigners
} = require('../scripts/m3/r5_role_signers.cjs');

const {
  componentFromCsv,
  minimumCommitment,
  load,
  makeWorkerResult
} = require('../scripts/m3/r5_data_envelope.cjs');

const WASM = process.env.NOMOGENESIS_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;
const GAS = '200000000000000';
const amount = value => (BigInt(value) * UNIT).toString();

const inputDir = path.join(__dirname, '..', 'demo', 'data');
const quantityFile = path.join(inputDir, 'quantities.csv');
const priceFile = path.join(inputDir, 'prices.csv');

async function rpc(worker, method, params) {
  const url = worker.config.rpcAddr;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method, params
    })
  });
  assert(response.ok);
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}

async function timestamp(worker) {
  const result = await rpc(worker, 'block', {
    finality: 'optimistic'
  });
  return BigInt(
    result.header.timestamp_nanosec ?? result.header.timestamp
  );
}

async function advanceTo(worker, target) {
  for (let n = 0; n < 120; n++) {
    const now = await timestamp(worker);
    if (now >= target) return;

    const count = Math.max(20, Math.min(100,
      Number((target - now + 500000000n - 1n) / 500000000n)
    ));

    await rpc(worker, 'sandbox_fast_forward', {
      delta_height: count
    });
  }
  throw new Error('Sandbox clock did not reach bid close');
}

async function ledger(contract) {
  const totals = await contract.view('m3_totals', {});
  return {
    escrow: BigInt(totals.rescue_escrow),
    claimable: BigInt(
      await contract.view('claimable_total', {})
    )
  };
}

async function nativeBalance(sandbox, accountId) {
  const state = await rpc(sandbox, 'query', {
    request_type: 'view_account',
    account_id: accountId,
    finality: 'optimistic'
  });
  return BigInt(state.amount);
}

function verifyNativePayout(tx, contractId, recipientId, amount) {
  assert.equal(tx.transaction.signer_id, recipientId);
  assert.equal(tx.transaction.receiver_id, contractId);

  assert(
    tx.status && !Object.hasOwn(tx.status, 'Failure'),
    'withdrawal transaction failed'
  );

  assert(Array.isArray(tx.receipts), 'missing RPC receipts');
  assert(
    Array.isArray(tx.receipts_outcome),
    'missing RPC receipt outcomes'
  );

  const outcomes = new Map(
    tx.receipts_outcome.map(row => [row.id, row.outcome.status])
  );

  const succeeded = receiptId => {
    const status = outcomes.get(receiptId);
    assert(status, 'missing receipt execution outcome');

    assert(
      Object.hasOwn(status, 'SuccessValue') ||
      Object.hasOwn(status, 'SuccessReceiptId'),
      'receipt execution failed'
    );
  };

  const transfers = [];
  const callbacks = [];

  for (const receipt of tx.receipts) {
    const actions = receipt.receipt?.Action?.actions || [];

    if (receipt.predecessor_id !== contractId) continue;

    for (const action of actions) {
      if (
        receipt.receiver_id === recipientId &&
        Object.hasOwn(action, 'Transfer')
      ) {
        transfers.push({
          id: receipt.receipt_id,
          amount: BigInt(action.Transfer.deposit)
        });
      }

      if (
        receipt.receiver_id === contractId &&
        action.FunctionCall?.method_name ===
          'on_withdraw_complete'
      ) {
        callbacks.push(receipt.receipt_id);
      }
    }
  }

  assert.equal(
    transfers.length, 1,
    'expected exactly one native payout receipt'
  );

  assert.equal(
    transfers[0].amount, amount,
    'wrong on-chain transfer amount'
  );

  assert.equal(
    callbacks.length, 1,
    'expected exactly one withdrawal callback'
  );

  succeeded(transfers[0].id);
  succeeded(callbacks[0]);

  console.log('TRANSFER RECEIPT:', transfers[0].id);
  console.log('CALLBACK RECEIPT:', callbacks[0]);
  console.log('VERIFIED NATIVE AMOUNT:', amount.toString());
}

async function main() {
  assert(WASM, 'NOMOGENESIS_WASM required');
  let sandbox;
  let isolated = null;

  try {
    sandbox = await Worker.init();

    const root = sandbox.rootAccount;
    const contract = await root.devDeploy(WASM);

    if (process.env.NOMOGENESIS_ISOLATED_SIGNERS === '1') {
      isolated = await createIsolatedSigners(root, sandbox);
    }

    const createActor = name => isolated
      ? isolated.create(name)
      : root.createSubAccount(name);

    const creator = await createActor('creator');
    const source = await createActor('source');
    const keeper = await createActor('keeper');
    const outsider = await createActor('outsider');

    const providers = [
      await createActor('quantities'),
      await createActor('prices')
    ];

    const buyers = [];
    const workers = [];

    for (let i = 0; i < 3; i++) {
      buyers.push(await createActor(`buyer${i}`));
      workers.push(await createActor(`worker${i}`));
    }

    const allActors = [
      creator, source, keeper, outsider,
      ...providers, ...buyers, ...workers
    ];

    assert.equal(
      new Set(allActors.map(a => a.accountId)).size,
      allActors.length
    );

    console.log('=== INDEPENDENT SIGNER ACCOUNTS ===');
    console.log('BUYERS:', buyers.map(a => a.accountId));
    console.log('PROVIDERS:', providers.map(a => a.accountId));
    console.log('WORKERS:', workers.map(a => a.accountId));
    console.log('KEEPER:', keeper.accountId);

    // Each provider prepares only its own data component.
    const components = [
      componentFromCsv(quantityFile, 0),
      componentFromCsv(priceFile, 1)
    ];

    assert.equal(components[0].payload.length, 33);
    assert.equal(components[1].payload.length, 33);

    const quote = await contract.view('m3_storage_quote', {});
    const caseStorage = BigInt(quote.case_storage_cost);
    const jobStorage = BigInt(quote.job_storage_cost);
    const offerStorage = BigInt(quote.offer_storage_cost);

    const start = await timestamp(sandbox);
    const bidClose = start + 1500n * SECOND;

    console.log('=== CREATE FUNDED RECOVERY CASE ===');

    const caseId = await creator.call(
      contract, 'create_rescue_case', {
        descriptor: {
          descriptor_version: 1,
          original_provider: source.accountId,
          component_commitments: components.map(
            item => Array.from(item.root)
          ),
          dependency_deadline: Number(start + 1200n * SECOND),
          bid_close: Number(bidClose),
          award_close: Number(start + 3600n * SECOND),
          recovery_deadline: Number(start + 4800n * SECOND)
        }
      }, {attachedDeposit: caseStorage.toString()}
    );

    assert.equal(caseId.length, 32);

    const thresholds = [500n, 600n, 632n];
    const jobIds = [];

    console.log('=== THREE BUYERS FUND MINIMUM POLICIES ===');

    for (let i = 0; i < 3; i++) {
      const id = Number(await buyers[i].call(
        contract, 'create_funded_rescue_job', {
          input: {
            case_id: caseId,
            worker: workers[i].accountId,
            worker_reward: amount(25),
            rescue_cap: amount(5),
            result_profile: 'MinimumThreshold',
            result_commitment: Array.from(
              minimumCommitment(caseId, thresholds[i])
            ),
            threshold: thresholds[i].toString(),
            final_deadline: Number(start + 6000n * SECOND)
          }
        }, {
          attachedDeposit: (
            30n * UNIT + jobStorage
          ).toString()
        }
      ));

      assert.equal(id, i);
      jobIds.push(id);

      await workers[i].call(
        contract, 'accept_rescue_job', {job_id: id}
      );
    }

    console.log('=== TWO BONDED PROVIDERS OFFER RECOVERY ===');

    for (let i = 0; i < 2; i++) {
      const id = Number(await providers[i].call(
        contract, 'post_rescue_offer', {
          input: {
            case_id: caseId,
            component_index: i,
            slot_id: `csv_component_${i}`,
            fee: amount(6),
            bond_capacity: amount(12)
          }
        }, {
          attachedDeposit: (
            12n * UNIT + offerStorage
          ).toString()
        }
      ));
      assert.equal(id, i);
    }

    assert.deepEqual(await ledger(contract), {
      escrow: 114n * UNIT,
      claimable: 0n
    });

    console.log('=== JOINT AWARD AFTER BID CLOSE ===');

    await advanceTo(sandbox, bidClose);

    const awardTime = await timestamp(sandbox);
    const awardClose = start + 3600n * SECOND;

    console.log(
      'AWARD WINDOW CHECK:',
      'elapsed=' + ((awardTime - start) / SECOND),
      'open=' + ((bidClose - start) / SECOND),
      'close=' + ((awardClose - start) / SECOND)
    );

    assert(
      awardTime >= bidClose && awardTime < awardClose,
      'award must be submitted inside the chain-time window'
    );

    const bundleId = Number(await keeper.call(
      contract, 'award_rescue_bundle', {case_id: caseId},
      {gas: GAS}
    ));
    assert.equal(bundleId, 0);

    for (const id of jobIds) {
      const mandate = await contract.view(
        'get_rescue_mandate', {job_id: id}
      );
      assert.equal(mandate.phase, 'Locked');
      assert.equal(
        BigInt(mandate.locked_allocation),
        4n * UNIT
      );
    }

    assert.deepEqual(await ledger(contract), {
      escrow: 111n * UNIT,
      claimable: 3n * UNIT
    });

    console.log('JOINTLY FUNDED BUNDLE: PASS');

    console.log('=== PROVIDERS SIGN CSV PROOF DELIVERY ===');

    const proofArgs = index => ({
      bundle_id: bundleId,
      component_index: index,
      payload: Array.from(components[index].payload),
      sibling: Array.from(components[index].sibling)
    });

    await assert.rejects(() =>
      outsider.call(
        contract, 'submit_rescue_component',
        proofArgs(0), {gas: GAS}
      )
    );

    for (let i = 0; i < 2; i++) {
      await providers[i].call(
        contract, 'submit_rescue_component',
        proofArgs(i), {gas: GAS}
      );
    }

    await assert.rejects(() =>
      providers[0].call(
        contract, 'submit_rescue_component',
        proofArgs(0), {gas: GAS}
      )
    );

    const caseView = await contract.view(
      'get_rescue_case', {case_id: caseId}
    );

    for (let i = 0; i < 2; i++) {
      assert.deepEqual(
        caseView.resolved_payloads[i],
        Array.from(components[i].payload)
      );
    }

    console.log('AUTHENTICATED CSV DELIVERY: PASS');

    console.log('=== KEEPER SETTLES SUCCESSFUL RECOVERY ===');

    await keeper.call(
      contract, 'settle_rescue_bundle',
      {bundle_id: bundleId}, {gas: GAS}
    );

    assert.deepEqual(await ledger(contract), {
      escrow: 75n * UNIT,
      claimable: 39n * UNIT
    });

    console.log('=== WORKERS INDEPENDENTLY RECOMPUTE ===');

    const claim = async actor => BigInt(
      await contract.view('get_claimable', {
        account: actor.accountId
      })
    );

    for (let i = 0; i < 3; i++) {
      const data = load(quantityFile, priceFile);
      assert.equal(data.total, 632n);

      const result = makeWorkerResult(
        data, caseId, jobIds[i], thresholds[i]
      );

      assert.deepEqual(
        result.commitment,
        minimumCommitment(caseId, thresholds[i])
      );

      if (i === 0) {
        const invalid = Array.from(result.payload);
        invalid[25] ^= 1;

        await assert.rejects(() =>
          workers[i].call(
            contract, 'complete_rescue_job', {
              job_id: jobIds[i],
              result_payload: invalid
            }, {gas: GAS}
          )
        );
      }

      await workers[i].call(
        contract, 'complete_rescue_job', {
          job_id: jobIds[i],
          result_payload: Array.from(result.payload)
        }, {gas: GAS}
      );

      const job = await contract.view(
        'get_rescue_job', {job_id: jobIds[i]}
      );

      assert.equal(job.phase, 'Completed');
      assert.equal(BigInt(job.held_worker_reward), 0n);
      assert.equal(await claim(workers[i]), 25n * UNIT);
    }

    const badReplay = makeWorkerResult(
      load(quantityFile, priceFile),
      caseId, jobIds[0], thresholds[0]
    );

    await assert.rejects(() =>
      workers[0].call(
        contract, 'complete_rescue_job', {
          job_id: jobIds[0],
          result_payload: Array.from(badReplay.payload)
        }, {gas: GAS}
      )
    );

    for (const buyer of buyers) {
      assert.equal(await claim(buyer), 1n * UNIT);
    }

    for (const provider of providers) {
      assert.equal(await claim(provider), 18n * UNIT);
    }

    assert.deepEqual(await ledger(contract), {
      escrow: 0n,
      claimable: 114n * UNIT
    });

    console.log('THREE WORKER COMPLETIONS: PASS');
    console.log('114-UNIT CONSERVATION: PASS');

    console.log('=== NATIVE WORKER WITHDRAWAL ===');

    const beforeBalance = await nativeBalance(
      sandbox, workers[0].accountId
    );
    const contractBefore = await nativeBalance(
      sandbox, contract.accountId
    );

    const withdrawalTx = await workers[0].callRaw(
      contract, 'withdraw', {amount: amount(20)},
      {gas: GAS}
    );

    assert.equal(
      withdrawalTx.succeeded, true,
      'withdrawal transaction was not successful'
    );

    const afterBalance = await nativeBalance(
      sandbox, workers[0].accountId
    );
    const contractAfter = await nativeBalance(
      sandbox, contract.accountId
    );

    const recipientDelta = afterBalance - beforeBalance;
    const contractDebit = contractBefore - contractAfter;

    console.log(
      'RECIPIENT BALANCE DELTA:',
      recipientDelta.toString()
    );
    console.log(
      'CONTRACT NATIVE BALANCE DEBIT:',
      contractDebit.toString()
    );
    console.log(
      'REQUESTED TRANSFER:',
      (20n * UNIT).toString()
    );

    assert(
      recipientDelta > 0n,
      'recipient did not gain native NEAR'
    );

    // Account deltas may include unrelated NEAR balance
    // adjustments. Verify the actual signed transaction
    // and resulting action receipts instead.
    const txHash = withdrawalTx.result.transaction.hash;

    assert.match(
      txHash, /^[1-9A-HJ-NP-Za-km-z]{43,44}$/,
      'invalid transaction hash'
    );

    const tx = await rpc(
      sandbox,
      'EXPERIMENTAL_tx_status',
      [txHash, workers[0].accountId]
    );

    verifyNativePayout(
      tx,
      contract.accountId,
      workers[0].accountId,
      20n * UNIT
    );

    console.log('NATIVE TRANSFER RECEIPT: PASS');

    assert.equal(await claim(workers[0]), 5n * UNIT);

    assert.equal(
      await contract.view('get_pending_withdrawal', {
        withdrawal_id: 0
      }),
      null
    );

    assert.deepEqual(await ledger(contract), {
      escrow: 0n,
      claimable: 94n * UNIT
    });

    assert.deepEqual(
      (await contract.view('payout_totals', {})).map(BigInt),
      [94n * UNIT, 0n]
    );

    assert.equal(
      (await ledger(contract)).claimable + 20n * UNIT,
      114n * UNIT
    );

    console.log('CSV RESULT:', 632);
    console.log('PROVIDERS: 36 UNITS');
    console.log('WORKERS: 75 UNITS');
    console.log('BUYER REFUNDS: 3 UNITS');
    console.log('NATIVE WORKER TRANSFER: 20 UNITS');
    console.log('=== SANDBOX/M3-R5-02 RESULT: PASS ===');

    if (isolated) {
      isolated.audit();
      console.log('=== M3-R5-03/02 RESULT: PASS ===');
    }

  } finally {
    if (isolated) await isolated.close();
    if (sandbox) await sandbox.tearDown();
  }
}

main().catch(error => {
  console.error('=== SANDBOX/M3-R5-02 RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
