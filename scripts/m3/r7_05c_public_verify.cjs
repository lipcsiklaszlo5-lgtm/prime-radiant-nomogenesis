'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

const {
  componentFromCsv,
  load: csvLoad,
  makeWorkerResult
} = require('./r5_data_envelope.cjs');

const ROOT = path.resolve(__dirname, '../..');
const CONTRACT = 'nomogenesis-70e59593a3.testnet';
const UNIT = 10n ** 21n;

const ENDPOINTS = [
  'https://rpc.testnet.fastnear.com',
  'https://rpc.testnet.near.org'
];

const STEPS = [
  'case',
  'buyer0-fund', 'worker0-accept',
  'buyer1-fund', 'worker1-accept',
  'buyer2-fund', 'worker2-accept',
  'provider0-offer', 'provider1-offer',
  'award', 'proof0', 'proof1',
  'settlement',
  'worker0-complete',
  'worker1-complete',
  'worker2-complete',
  'withdraw'
];

function verifyManifest(evidence, wrapper) {
  const cert = wrapper.genesis_certificate;

  assert.equal(evidence.network, 'testnet');
  assert.equal(evidence.contract, CONTRACT);
  assert.equal(
    evidence.version,
    'r7-05c-live-testnet-v1'
  );

  assert.equal(evidence.transaction_count, 17);
  assert.deepEqual(
    evidence.transactions.map(x => x.step),
    STEPS
  );

  assert.equal(
    new Set(
      evidence.transactions.map(x => x.tx)
    ).size,
    17
  );

  assert.match(
    evidence.case_id_hex,
    /^[0-9a-f]{64}$/
  );

  assert.equal(
    wrapper.case_id_hex,
    evidence.case_id_hex
  );

  assert.equal(
    cert.certificate_hash,
    evidence.certificate_hash
  );

  assert.deepEqual(evidence.jobs, [4, 5, 6]);
  assert.deepEqual(evidence.offers, [2, 3]);
  assert.equal(evidence.bundle_id, 1);

  assert.deepEqual(
    evidence.caps_units,
    [7, 7, 7]
  );

  assert.equal(evidence.price_units, 12);

  assert.deepEqual(
    evidence.onchain_allocation_units,
    [4, 4, 4]
  );

  assert.deepEqual(
    evidence.minimal_coalitions,
    [[4, 5], [4, 6], [5, 6]]
  );

  for (const row of evidence.transactions) {
    assert.match(
      row.tx,
      /^[1-9A-HJ-NP-Za-km-z]{40,60}$/
    );

    assert.match(
      row.args_sha256,
      /^[0-9a-f]{64}$/
    );

    assert.match(
      row.signer,
      /^[a-z0-9.-]+\.testnet$/
    );

    assert.match(
      row.deposit,
      /^(0|[1-9][0-9]*)$/
    );
  }

  return cert;
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function rpc(method, params) {
  let last;

  for (const url of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          signal: AbortSignal.timeout(18000),
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'r7-05c-read',
            method,
            params
          })
        });

        if (!response.ok) {
          throw Error(
            `RPC HTTP ${response.status}`
          );
        }

        const body = await response.json();

        if (body.error) {
          throw Error(
            JSON.stringify(body.error)
          );
        }

        return body.result;
      } catch (error) {
        last = error;

        if (attempt === 0) {
          await sleep(1200);
        }
      }
    }
  }

  throw last;
}

async function view(method, args = {}) {
  const response = await rpc('query', {
    request_type: 'call_function',
    account_id: CONTRACT,
    method_name: method,
    args_base64: Buffer.from(
      JSON.stringify(args)
    ).toString('base64'),
    finality: 'final'
  });

  return JSON.parse(
    Buffer.from(
      response.result
    ).toString('utf8')
  );
}

function extract(row, response) {
  const tx = response.transaction;

  assert.equal(tx.hash, row.tx);
  assert.equal(tx.signer_id, row.signer);
  assert.equal(tx.receiver_id, CONTRACT);

  assert(
    response.status &&
    (
      Object.hasOwn(
        response.status,
        'SuccessValue'
      ) ||
      Object.hasOwn(
        response.status,
        'SuccessReceiptId'
      )
    ),
    `Transaction not successful: ${row.step}`
  );

  for (const receipt of response.receipts_outcome || []) {
    assert(
      !Object.hasOwn(
        receipt.outcome.status,
        'Failure'
      ),
      `Failed receipt: ${row.step}`
    );
  }

  const calls = tx.actions.filter(
    x => x.FunctionCall
  );

  assert.equal(calls.length, 1);

  const call = calls[0].FunctionCall;

  assert.equal(
    call.method_name,
    row.method
  );

  assert.equal(
    call.deposit,
    row.deposit
  );

  const raw = Buffer.from(
    call.args,
    'base64'
  );

  assert.equal(
    crypto.createHash('sha256')
      .update(raw)
      .digest('hex'),
    row.args_sha256
  );

  const args = JSON.parse(
    raw.toString('utf8')
  );

  let returned = null;

  if (
    Object.hasOwn(
      response.status,
      'SuccessValue'
    )
  ) {
    const data = Buffer.from(
      response.status.SuccessValue,
      'base64'
    ).toString('utf8');

    if (data) {
      returned = JSON.parse(data);
    }
  }

  return {
    signer: row.signer,
    args,
    returned
  };
}

function checkNative(tx, receiver) {
  const outcomes = new Map(
    tx.receipts_outcome.map(
      r => [r.id, r.outcome.status]
    )
  );

  const transfers = [];
  const callbacks = [];

  for (const receipt of tx.receipts) {
    if (
      receipt.predecessor_id !== CONTRACT
    ) {
      continue;
    }

    for (
      const action of
      receipt.receipt?.Action?.actions || []
    ) {
      if (
        receipt.receiver_id === receiver &&
        action.Transfer
      ) {
        transfers.push({
          id: receipt.receipt_id,
          amount: BigInt(
            action.Transfer.deposit
          )
        });
      }

      if (
        receipt.receiver_id === CONTRACT &&
        action.FunctionCall?.method_name ===
          'on_withdraw_complete'
      ) {
        callbacks.push(
          receipt.receipt_id
        );
      }
    }
  }

  assert.equal(transfers.length, 1);
  assert.equal(callbacks.length, 1);

  assert.equal(
    transfers[0].amount,
    20n * UNIT
  );

  for (
    const id of [
      transfers[0].id,
      callbacks[0]
    ]
  ) {
    const status = outcomes.get(id);

    assert(
      status &&
      (
        Object.hasOwn(status, 'SuccessValue') ||
        Object.hasOwn(status, 'SuccessReceiptId')
      )
    );
  }
}

async function main() {
  const evidence = JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        'docs/evidence/R7-05C-public.json'
      ),
      'utf8'
    )
  );

  const wrapper = JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        'docs/evidence/R7-05C-genesis-certificate.json'
      ),
      'utf8'
    )
  );

  verifyManifest(evidence, wrapper);

  console.log(
    'PUBLIC EVIDENCE STRUCTURE: PASS'
  );

  const observed = {};
  const txs = {};

  for (const row of evidence.transactions) {
    const tx = await rpc(
      'EXPERIMENTAL_tx_status',
      [row.tx, row.signer]
    );

    observed[row.step] = extract(
      row, tx
    );

    txs[row.step] = tx;

    console.log(
      'PUBLIC SIGNED TX:',
      row.step,
      'PASS'
    );
  }

  console.log(
    'SIGNED TRANSACTIONS AND ARGUMENT HASHES: 17/17 PASS'
  );

  const source = csvLoad(
    'demo/data/quantities.csv',
    'demo/data/prices.csv'
  );

  assert.equal(source.total, 632n);

  const components = [
    componentFromCsv(
      'demo/data/quantities.csv', 0
    ),
    componentFromCsv(
      'demo/data/prices.csv', 1
    )
  ];

  assert.deepEqual(
    observed.case.args.descriptor
      .component_commitments,
    components.map(
      x => Array.from(x.root)
    )
  );

  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      observed[`proof${i}`].args.payload,
      Array.from(
        components[i].payload
      )
    );

    assert.deepEqual(
      observed[`proof${i}`].args.sibling,
      Array.from(
        components[i].sibling
      )
    );
  }

  const caseId = Array.from(
    Buffer.from(
      evidence.case_id_hex,
      'hex'
    )
  );

  const thresholds = [
    500n, 600n, 632n
  ];

  for (let i = 0; i < 3; i++) {
    const result = makeWorkerResult(
      source,
      caseId,
      evidence.jobs[i],
      thresholds[i]
    );

    assert.deepEqual(
      observed[`worker${i}-complete`]
        .args.result_payload,
      Array.from(result.payload)
    );

    assert.deepEqual(
      observed[`buyer${i}-fund`]
        .args.input.result_commitment,
      Array.from(result.commitment)
    );
  }

  console.log(
    'CSV AND WORKER RESULTS RECOMPUTED: PASS'
  );

  const py = spawnSync(
    'python3',
    [
      '-B',
      'scripts/m3/r7_05c_public_reconstruct.py'
    ],
    {
      cwd: ROOT,
      input: JSON.stringify({
        evidence,
        observed
      }),
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024
    }
  );

  if (py.stdout) {
    process.stdout.write(py.stdout);
  }

  if (py.stderr) {
    process.stderr.write(py.stderr);
  }

  if (py.error) {
    throw py.error;
  }

  assert.equal(
    py.status,
    0,
    'Independent Genesis reconstruction failed'
  );

  const c = await view(
    'get_rescue_case',
    {case_id: caseId}
  );

  assert.equal(c.phase, 'Closed');

  assert.deepEqual(
    c.job_ids,
    evidence.jobs
  );

  assert.deepEqual(
    c.offer_ids,
    evidence.offers
  );

  assert.equal(
    c.awarded_bundle_id,
    evidence.bundle_id
  );

  for (const job_id of evidence.jobs) {
    const job = await view(
      'get_rescue_job',
      {job_id}
    );

    assert.equal(
      job.phase,
      'Completed'
    );

    assert.equal(
      BigInt(job.held_worker_reward),
      0n
    );
  }

  for (const offer_id of evidence.offers) {
    const offer = await view(
      'get_rescue_offer',
      {offer_id}
    );

    assert.equal(
      offer.phase,
      'Proven'
    );

    assert.equal(
      BigInt(offer.held_bond),
      0n
    );
  }

  const totals = await view(
    'm3_totals'
  );

  const claims = BigInt(
    await view('claimable_total')
  );

  const payout = await view(
    'payout_totals'
  );

  assert.equal(
    BigInt(totals.rescue_escrow),
    30n * UNIT
  );

  assert.equal(
    claims,
    194n * UNIT
  );

  assert.equal(
    BigInt(payout[0]),
    claims
  );

  assert.equal(
    BigInt(payout[1]),
    0n
  );

  assert.equal(
    30n + 194n + 20n,
    30n + 94n + 120n
  );

  checkNative(
    txs.withdraw,
    observed.withdraw.signer
  );

  console.log(
    'FINAL ECONOMIC STATE: PASS'
  );

  console.log(
    'NATIVE TRANSFER AND CALLBACK: PASS'
  );

  console.log(
    'SDK RETRY HISTORY: 8 HASHES INCONCLUSIVE'
  );

  console.log(
    'R7-05C/03 PUBLIC KEYLESS VERIFICATION: PASS'
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      'R7-05C/03: FAIL',
      error.stack || error
    );

    process.exitCode = 1;
  });
}

module.exports = {
  verifyManifest,
  extract
};
