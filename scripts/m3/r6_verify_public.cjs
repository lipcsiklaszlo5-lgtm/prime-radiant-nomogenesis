'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');

const manifest = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'docs/evidence/R6-05-public.json'),
  'utf8'
));

const {componentFromCsv, load} =
  require('./r5_data_envelope.cjs');

const endpoints = [
  'https://rpc.testnet.fastnear.com',
  'https://near-testnet.drpc.org'
];

const UNIT = BigInt(manifest.unit_yocto);
const units = n => BigInt(n) * UNIT;
const contract = manifest.contract;
const actors = manifest.actors;

function success(status) {
  return status && (
    Object.hasOwn(status, 'SuccessValue') ||
    Object.hasOwn(status, 'SuccessReceiptId')
  );
}

async function rpc(url, method, params) {
  let lastError;

  for (let i = 0; i < 4; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params
        })
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const body = await response.json();

      if (body.error) {
        throw new Error(JSON.stringify(body.error));
      }

      return body.result;
    } catch (error) {
      lastError = error;

      if (i < 3) {
        await new Promise(resolve =>
          setTimeout(resolve, 900 * (i + 1))
        );
      }
    }
  }

  throw lastError;
}

async function query(url, request) {
  return rpc(url, 'query', {
    ...request,
    finality: 'final'
  });
}

async function view(url, method, args = {}) {
  const result = await query(url, {
    request_type: 'call_function',
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(
      JSON.stringify(args)
    ).toString('base64')
  });

  return JSON.parse(
    Buffer.from(result.result).toString('utf8')
  );
}

function verifyNativeReceipt(tx) {
  const recipient = actors.worker0;

  const outcomes = new Map(
    tx.receipts_outcome.map(row => [
      row.id, row.outcome.status
    ])
  );

  const transfers = [];
  const callbacks = [];

  for (const receipt of tx.receipts) {
    if (receipt.predecessor_id !== contract) continue;

    const actions =
      receipt.receipt?.Action?.actions || [];

    for (const action of actions) {
      if (
        receipt.receiver_id === recipient &&
        action.Transfer
      ) {
        transfers.push({
          id: receipt.receipt_id,
          amount: BigInt(action.Transfer.deposit)
        });
      }

      if (
        receipt.receiver_id === contract &&
        action.FunctionCall?.method_name ===
          'on_withdraw_complete'
      ) {
        callbacks.push(receipt.receipt_id);
      }
    }
  }

  assert.equal(transfers.length, 1);
  assert.equal(callbacks.length, 1);
  assert.equal(transfers[0].amount, units(20));

  for (const id of [
    transfers[0].id,
    callbacks[0]
  ]) {
    assert(
      success(outcomes.get(id)),
      'native receipt or callback failed'
    );
  }

  console.log('NATIVE_RECEIPT_AND_CALLBACK: PASS');
}

function expectedDeposit(method, quote) {
  if (method === 'create_rescue_case') {
    return BigInt(quote.case_storage_cost);
  }

  if (method === 'create_funded_rescue_job') {
    return units(30) +
      BigInt(quote.job_storage_cost);
  }

  if (method === 'post_rescue_offer') {
    return units(12) +
      BigInt(quote.offer_storage_cost);
  }

  return 0n;
}

async function verifyEndpoint(url, components) {
  const status = await rpc(url, 'status', []);
  assert.equal(status.chain_id, 'testnet');

  const code = await query(url, {
    request_type: 'view_code',
    account_id: contract
  });

  const wasm = Buffer.from(
    code.code_base64,
    'base64'
  );

  assert.equal(wasm.length, 539608);

  assert.equal(
    crypto.createHash('sha256')
      .update(wasm).digest('hex'),
    manifest.wasm_sha256
  );

  assert.equal(
    code.hash,
    manifest.contract_code_hash
  );

  console.log('ON_CHAIN_WASM: PASS', url);

  const quote = await view(url, 'm3_storage_quote');

  for (const row of manifest.transactions) {
    assert.equal(row.signer, actors[row.role]);

    const tx = await rpc(
      url,
      'EXPERIMENTAL_tx_status',
      [row.tx, row.signer]
    );

    assert.equal(tx.transaction.hash, row.tx);
    assert.equal(tx.transaction.signer_id, row.signer);
    assert.equal(tx.transaction.receiver_id, contract);
    assert(success(tx.status));

    assert(
      !(tx.receipts_outcome || []).some(
        record => record.outcome.status?.Failure
      )
    );

    const calls = tx.transaction.actions.filter(
      action =>
        action.FunctionCall?.method_name === row.method
    );

    assert.equal(calls.length, 1);

    assert.equal(
      BigInt(calls[0].FunctionCall.deposit),
      expectedDeposit(row.method, quote)
    );

    if (row.step === 'withdraw') {
      verifyNativeReceipt(tx);
    }

    console.log('VERIFIED_TX:', row.step, row.tx);
  }

  const caseId = Array.from(
    Buffer.from(manifest.case_id_hex, 'hex')
  );

  const rescue = await view(
    url,
    'get_rescue_case',
    {case_id: caseId}
  );

  assert.equal(rescue.phase, 'Closed');
  assert.equal(
    rescue.awarded_bundle_id,
    manifest.bundle_id
  );

  assert.deepEqual(rescue.job_ids, manifest.job_ids);
  assert.deepEqual(rescue.offer_ids, manifest.offer_ids);

  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      rescue.component_commitments[i],
      Array.from(components[i].root)
    );

    assert.deepEqual(
      rescue.resolved_payloads[i],
      Array.from(components[i].payload)
    );
  }

  for (let i = 0; i < 3; i++) {
    const jobId = manifest.job_ids[i];

    const job = await view(
      url, 'get_rescue_job', {job_id: jobId}
    );

    const mandate = await view(
      url, 'get_rescue_mandate', {job_id: jobId}
    );

    assert.equal(job.phase, 'Completed');
    assert.equal(job.buyer, actors['buyer' + i]);
    assert.equal(job.worker, actors['worker' + i]);
    assert.equal(BigInt(job.held_worker_reward), 0n);

    assert.equal(mandate.phase, 'Released');
    assert.equal(BigInt(mandate.held_principal), 0n);
  }

  for (let i = 0; i < 2; i++) {
    const offer = await view(
      url,
      'get_rescue_offer',
      {offer_id: manifest.offer_ids[i]}
    );

    assert.equal(offer.phase, 'Proven');
    assert.equal(BigInt(offer.held_bond), 0n);

    assert.equal(
      offer.provider,
      actors[i === 0 ? 'quantities' : 'prices']
    );
  }

  const expectedClaims = [
    ['buyer0', 1],
    ['buyer1', 1],
    ['buyer2', 1],
    ['worker0', 5],
    ['worker1', 25],
    ['worker2', 25],
    ['quantities', 18],
    ['prices', 18]
  ];

  for (const [role, expected] of expectedClaims) {
    const value = await view(
      url,
      'get_claimable',
      {account: actors[role]}
    );

    assert.equal(BigInt(value), units(expected));
  }

  const oldJob = await view(
    url,
    'get_rescue_job',
    {job_id: manifest.prior_funded_job_id}
  );

  const oldMandate = await view(
    url,
    'get_rescue_mandate',
    {job_id: manifest.prior_funded_job_id}
  );

  assert.equal(oldJob.phase, 'Accepted');
  assert.equal(
    BigInt(oldJob.held_worker_reward),
    units(25)
  );

  assert.equal(oldMandate.phase, 'Open');
  assert.equal(
    BigInt(oldMandate.held_principal),
    units(5)
  );

  const totals = await view(url, 'm3_totals');

  assert.equal(
    BigInt(totals.rescue_escrow),
    units(30)
  );

  assert.equal(
    BigInt(await view(url, 'claimable_total')),
    units(94)
  );

  const payouts = await view(url, 'payout_totals');

  assert.deepEqual(
    payouts.map(BigInt),
    [units(94), 0n]
  );

  const pending = await view(
    url,
    'get_pending_withdrawal',
    {withdrawal_id: 0}
  );

  assert.equal(pending, null);

  console.log('FINAL_ECONOMIC_STATE: PASS', url);
  console.log('PRIOR_30_UNIT_ESCROW: PRESERVED');
  console.log('17_PUBLIC_TRANSACTIONS: VERIFIED');
}

async function main() {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.network, 'testnet');
  assert.equal(manifest.transactions.length, 17);

  assert.equal(
    new Set(manifest.transactions.map(
      row => row.tx
    )).size,
    17
  );

  const files = [
    path.join(ROOT, 'demo/data/quantities.csv'),
    path.join(ROOT, 'demo/data/prices.csv')
  ];

  const components = files.map(
    (file, i) => componentFromCsv(file, i)
  );

  const data = load(files[0], files[1]);

  assert.equal(data.total, 632n);
  console.log('CSV_RECOMPUTATION: 632 PASS');

  for (const url of endpoints) {
    await verifyEndpoint(url, components);
  }

  console.log('PUBLIC_RPC_VERIFICATIONS: 2/2 PASS');
  console.log('TOTAL_TX_RPC_CHECKS: 34');
  console.log('PRIVATE_KEYS_REQUIRED: NO');
  console.log('=== R6-05 PUBLIC VERIFICATION: PASS ===');
}

main().catch(error => {
  console.error('=== R6-05 PUBLIC VERIFICATION: FAIL ===');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
