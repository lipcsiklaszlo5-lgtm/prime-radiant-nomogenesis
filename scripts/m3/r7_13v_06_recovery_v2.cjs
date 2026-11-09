'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const MODE = process.argv[2];

assert(
  ['--check', '--live'].includes(MODE),
  'Only --check or --live'
);

assert.equal(process.argv.length, 3);

const LIVE = MODE === '--live';

const ROOT = path.join(
  os.homedir(), '.nomogenesis-r7-13'
);

const OLD = path.join(
  ROOT, 'run04-recovery-once-01'
);

const NEXT = path.join(
  ROOT, 'run04-recovery-once-02'
);

const RUN = path.join(ROOT, 'live-v2-once-04');

const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';
const PARENT = 'nmg-r713-8d99c17cced1.testnet';
const SIGNER = `keeper.${PARENT}`;

const CASE =
  '5d65446b1f3e27f195c06c4c43b7ed7b4652af0577a4636a8865d952f952925c';

const OLD_HASH =
  'F26yCtTXj7o9nM7PR2RGWNbjoviuEGxSXbNs1sbYX35k';

const EXPECTED_SHA =
  '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';

const RPCS = [
  'https://rpc.testnet.near.org',
  'https://rpc.testnet.fastnear.com'
];

const UNIT = 10n ** 21n;

const STEPS = [
  {
    name: 'expire-job-4',
    method: 'expire_unaccepted_rescue_job',
    args: {job_id: 4},
    amount: 8n * UNIT
  },
  {
    name: 'expire-job-5',
    method: 'expire_unaccepted_rescue_job',
    args: {job_id: 5},
    amount: 8n * UNIT
  },
  {
    name: 'release-offer-6',
    method: 'release_open_rescue_offer',
    args: {offer_id: 6},
    amount: 12n * UNIT
  }
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function exists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

function secure(p) {
  const s = fs.lstatSync(p);

  assert(
    s.isFile() &&
    !s.isSymbolicLink() &&
    s.uid === process.getuid() &&
    (s.mode & 0o077) === 0,
    'Insecure file: ' + path.basename(p)
  );

  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeNew(p, obj) {
  const fd = fs.openSync(p, 'wx', 0o600);

  try {
    fs.writeFileSync(
      fd, JSON.stringify(obj, null, 2) + '\n'
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function update(p, obj) {
  const tmp = p + '.' +
    crypto.randomBytes(8).toString('hex') + '.tmp';

  writeNew(tmp, obj);
  fs.renameSync(tmp, p);
}

function request(method, params) {
  return {
    jsonrpc: '2.0',
    id: 'run04-recovery-v2',
    method,
    params
  };
}

function sendEnvelope(encoded) {
  return request('send_tx', {
    signed_tx_base64: encoded,
    wait_until: 'NONE'
  });
}

assert.deepEqual(
  sendEnvelope('TEST').params,
  {
    signed_tx_base64: 'TEST',
    wait_until: 'NONE'
  }
);

let requests = 0;
let last = 0;

async function single(url, method, params) {
  await sleep(
    Math.max(0, 750 - (Date.now() - last))
  );

  last = Date.now();
  requests++;

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(request(method, params)),
    signal: AbortSignal.timeout(12000)
  });

  const body = await response.text();
  let json;

  try {
    json = JSON.parse(body);
  } catch {
    throw Error(
      'RPC HTTP ' + response.status + ' non-JSON'
    );
  }

  if (!response.ok || json.error) {
    const e = new Error(
      'RPC HTTP ' + response.status + ' ' +
      JSON.stringify(json.error ?? json).slice(0, 320)
    );

    e.rpcError = json.error;
    throw e;
  }

  return json.result;
}

async function read(method, params) {
  let lastError;

  for (const url of RPCS) {
    for (let tries = 0; tries < 2; tries++) {
      try {
        return await single(url, method, params);
      } catch (e) {
        lastError = e;

        if (tries === 0) await sleep(900);
      }
    }
  }

  throw lastError;
}

async function view(block, method, args = {}) {
  const x = await read('query', {
    request_type: 'call_function',
    account_id: CONTRACT,
    method_name: method,
    args_base64: Buffer.from(
      JSON.stringify(args)
    ).toString('base64'),
    block_id: block
  });

  return JSON.parse(
    Buffer.from(x.result).toString('utf8')
  );
}

async function state() {
  const b = await read(
    'block', {finality: 'final'}
  );

  const ts = BigInt(
    b.header.timestamp_nanosec ??
    b.header.timestamp
  );

  const ageMs = Date.now() -
    Number(ts / 1000000n);

  assert(
    ageMs >= -10000 && ageMs < 180000,
    'Stale finalized block'
  );

  const hash = b.header.hash;
  const caseId = [...Buffer.from(CASE, 'hex')];

  const c = await view(
    hash, 'get_rescue_case',
    {case_id: caseId}
  );

  assert(
    c &&
    Buffer.from(c.id).toString('hex') === CASE
  );

  const totals = await view(hash, 'm3_totals');

  const claimable = BigInt(
    await view(hash, 'claimable_total')
  );

  const jobs = [];

  for (const id of [4, 5]) {
    jobs.push({
      job: await view(
        hash, 'get_rescue_job', {job_id: id}
      ),
      mandate: await view(
        hash, 'get_rescue_mandate', {job_id: id}
      )
    });
  }

  const offer = await view(
    hash, 'get_rescue_offer',
    {offer_id: 6}
  );

  return {
    hash,
    ts,
    case: c,
    totals,
    escrow: BigInt(totals.rescue_escrow),
    claimable,
    jobs,
    offer
  };
}

function assertState(s, index) {
  assert.equal(s.case.phase, 'Open');
  assert.equal(s.case.awarded_bundle_id, null);

  assert.deepEqual(s.case.job_ids, [4, 5]);
  assert.deepEqual(s.case.offer_ids, [6]);

  const remaining = STEPS.slice(index)
    .reduce(
      (sum, step) => sum + step.amount,
      0n
    );

  assert.equal(
    s.escrow, remaining,
    'Unexpected escrow'
  );

  assert.equal(
    s.claimable,
    114n * UNIT - remaining,
    'Unexpected claimable'
  );

  s.jobs.forEach(({job, mandate}, j) => {
    assert.equal(job.id, j + 4);

    assert.equal(
      job.buyer,
      `buyer-${j + 1}.${PARENT}`
    );

    if (j < index) {
      assert.equal(job.phase, 'Expired');

      assert.equal(
        BigInt(job.held_worker_reward), 0n
      );

      assert.equal(mandate.phase, 'Released');

      assert.equal(
        BigInt(mandate.held_principal), 0n
      );
    } else {
      assert.equal(job.phase, 'Funded');

      assert.equal(
        BigInt(job.held_worker_reward), UNIT
      );

      assert.equal(mandate.phase, 'Open');

      assert.equal(
        BigInt(mandate.held_principal),
        7n * UNIT
      );
    }
  });

  assert.equal(
    s.offer.provider,
    `provider-gamma.${PARENT}`
  );

  if (index === 3) {
    assert.equal(s.offer.phase, 'Released');

    assert.equal(
      BigInt(s.offer.held_bond), 0n
    );
  } else {
    assert.equal(s.offer.phase, 'Open');

    assert.equal(
      BigInt(s.offer.held_bond),
      12n * UNIT
    );
  }
}

async function checkOldHash() {
  let unknown = 0;

  for (const url of RPCS) {
    try {
      const result = await single(
        url,
        'tx',
        {
          tx_hash: OLD_HASH,
          sender_account_id: SIGNER,
          wait_until: 'NONE'
        }
      );

      if (result?.transaction) {
        throw Error(
          'OLD TRANSACTION EXISTS: ' + OLD_HASH
        );
      }

      throw Error('Unexpected transaction result');

    } catch (e) {
      const cause = e.rpcError?.cause?.name;

      if (cause === 'UNKNOWN_TRANSACTION') {
        unknown++;

        console.log(
          'OLD_TX_NOT_FOUND:', url
        );
      } else {
        throw Error(
          'Old transaction status uncertain: ' +
          url + ' ' + e.message
        );
      }
    }
  }

  assert.equal(
    unknown, 2,
    'Need two independent unknown results'
  );
}

async function verifyHistoric() {
  assert(fs.statSync(RUN).isDirectory());

  const run = secure(
    path.join(RUN, 'run.json')
  );

  assert.equal(run.restart_allowed, false);

  assert.equal(
    Buffer.from(run.case_id).toString('hex'),
    CASE
  );

  const intent = secure(
    path.join(OLD, 'intent.json')
  );

  const signed = secure(
    path.join(OLD, 'expire-job-4.json')
  );

  assert.equal(intent.restart_allowed, false);

  assert.equal(
    signed.state, 'signed_not_confirmed'
  );

  assert.equal(signed.hash, OLD_HASH);
  assert.equal(signed.signer, SIGNER);

  assert.equal(
    signed.method,
    'expire_unaccepted_rescue_job'
  );

  assert(
    !exists(NEXT),
    'Recovery attempt 02 exists: DO NOT RESTART'
  );
}

async function waitFinal(hash) {
  for (let tries = 0; tries < 28; tries++) {
    let receipt = null;

    try {
      receipt = await read('tx', {
        tx_hash: hash,
        sender_account_id: SIGNER,
        wait_until: 'FINAL'
      });
    } catch (e) {
      console.log(
        'TX_STATUS_WAIT:',
        tries + 1,
        e.message.slice(0, 95)
      );

      await sleep(2500);
      continue;
    }

    if (receipt?.transaction?.hash !== hash) {
      throw Error('Unexpected returned hash');
    }

    assert.equal(
      receipt.transaction.signer_id,
      SIGNER
    );

    assert.equal(
      receipt.transaction.receiver_id,
      CONTRACT
    );

    if (receipt.final_execution_status === 'FINAL') {
      assert(
        !Object.hasOwn(
          receipt.status ?? {}, 'Failure'
        ),
        'Final execution failed'
      );

      assert(
        Object.hasOwn(
          receipt.status ?? {}, 'SuccessValue'
        ) ||
        Object.hasOwn(
          receipt.status ?? {}, 'SuccessReceiptId'
        )
      );

      assert(
        !(receipt.receipts_outcome ?? []).some(
          r => Object.hasOwn(
            r.outcome?.status ?? {},
            'Failure'
          )
        )
      );

      return;
    }

    await sleep(2500);
  }

  throw Error('FINALITY_UNCERTAIN: ' + hash);
}

async function sendOnce(account, step) {
  const dest = path.join(
    NEXT, step.name + '.json'
  );

  const record = {
    schema: 'run04-recovery-v2.once',
    step: step.name,
    method: step.method,
    args: step.args,
    signer: SIGNER,
    receiver: CONTRACT,
    state: 'prepared',
    hash: null
  };

  // Durable marker before signing.
  writeNew(dest, record);

  account.accessKeyByPublicKeyCache = {};

  const near = require('near-api-js');

  const action = near.transactions.functionCall(
    step.method,
    step.args,
    200000000000000n,
    0n
  );

  const [hash, signed] =
    await account.signTransaction(
      CONTRACT,
      [action]
    );

  const {baseEncode} =
    require('@near-js/utils');

  assert.equal(
    typeof signed.encode, 'function'
  );

  const raw = Buffer.from(signed.encode());

  assert(raw.length > 100);

  assert(
    crypto.createHash('sha256')
      .update(
        Buffer.from(signed.transaction.encode())
      )
      .digest()
      .equals(Buffer.from(hash))
  );

  record.hash = baseEncode(hash);
  record.state = 'signed_not_confirmed';

  // Persist hash BEFORE broadcast.
  update(dest, record);

  console.log(
    'SIGNED_HASH:',
    step.name,
    record.hash
  );

  // One send_tx request. No broadcast retry.
  const result = await fetch(RPCS[0], {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(
      sendEnvelope(raw.toString('base64'))
    ),
    signal: AbortSignal.timeout(15000)
  });

  const response = await result.text();

  let parsed;

  try {
    parsed = JSON.parse(response);
  } catch {
    throw Error(
      'BROADCAST_UNCERTAIN_NONJSON HTTP ' +
      result.status
    );
  }

  if (!result.ok || parsed.error) {
    throw Error(
      'BROADCAST_UNCERTAIN HTTP ' +
      result.status + ' ' +
      JSON.stringify(
        parsed.error ?? parsed
      ).slice(0, 420)
    );
  }

  console.log(
    'SEND_TX_ACCEPTED:',
    step.name,
    parsed.result?.final_execution_status ??
      'UNKNOWN'
  );

  await waitFinal(record.hash);

  record.state = 'confirmed';
  record.final_utc = new Date().toISOString();

  update(dest, record);

  console.log(
    'FINALIZED_RELEASE:',
    step.name,
    record.hash
  );
}

async function main() {
  console.log('=== RECOVERY V2 CHECK ===');

  await verifyHistoric();

  const chain = await read('status', []);

  assert.equal(chain.chain_id, 'testnet');

  const s = await state();

  assertState(s, 0);

  assert(
    s.ts >= BigInt(s.case.award_close),
    'Award deadline not reached'
  );

  console.log('ESCROW_UNIT: 28');
  console.log('CLAIMABLE_UNIT: 86');

  const code = await read('query', {
    request_type: 'view_code',
    account_id: CONTRACT,
    block_id: s.hash
  });

  assert.equal(
    crypto.createHash('sha256')
      .update(
        Buffer.from(code.code_base64, 'base64')
      )
      .digest('hex'),
    EXPECTED_SHA
  );

  await checkOldHash();

  console.log('NEW_SEND_TX_ENVELOPE: PASS');

  if (!LIVE) {
    console.log('R7_13V_06_CHECK: PASS');
    console.log('RECOVERY02_DIRECTORY_CREATED: NO');
    console.log('PUBLIC_WRITES: 0');
    console.log('RPC_READS:', requests);
    return;
  }

  assert.equal(
    process.env.NMG_R7_13V_06_LIVE_APPROVAL,
    'YES_RECOVER_RUN04_28_TESTNET_UNITS',
    'Separate public recovery approval required'
  );

  const near = require('near-api-js');

  assert.equal(
    require('near-api-js/package.json').version,
    '5.1.1'
  );

  const cred = secure(
    path.join(ROOT, 'actors', 'keeper.json')
  );

  assert.equal(cred.role, 'keeper');
  assert.equal(cred.account_id, SIGNER);

  const pair = near.KeyPair.fromString(
    cred.private_key
  );

  assert.equal(
    pair.getPublicKey().toString(),
    cred.public_key
  );

  const access = await read('query', {
    request_type: 'view_access_key',
    account_id: SIGNER,
    public_key: cred.public_key,
    block_id: s.hash
  });

  assert.equal(access.permission, 'FullAccess');

  const ks =
    new near.keyStores.InMemoryKeyStore();

  await ks.setKey(
    'testnet', SIGNER, pair
  );

  const conn = await near.connect({
    networkId: 'testnet',
    nodeUrl: RPCS[0],
    keyStore: ks,
    deps: {keyStore: ks}
  });

  const account = await conn.account(SIGNER);

  // One-time recovery identity.
  fs.mkdirSync(NEXT, {mode: 0o700});

  writeNew(
    path.join(NEXT, 'intent.json'),
    {
      schema: 'run04-recovery-v2.intent',
      created_utc: new Date().toISOString(),
      restart_allowed: false,
      old_hash: OLD_HASH,
      case: CASE,
      baseline_escrow: s.escrow.toString(),
      baseline_claimable: s.claimable.toString(),
      storage_reserves:
        s.totals.storage_reserves
    }
  );

  for (let i = 0; i < STEPS.length; i++) {
    const before = await state();

    assertState(before, i);

    assert.equal(
      before.totals.storage_reserves,
      s.totals.storage_reserves
    );

    await sendOnce(account, STEPS[i]);

    const after = await state();

    assertState(after, i + 1);

    assert.equal(
      after.totals.storage_reserves,
      s.totals.storage_reserves
    );

    console.log(
      'ECONOMIC_STEP_' + (i + 1) + ': PASS'
    );
  }

  const final = await state();

  assertState(final, 3);

  writeNew(
    path.join(NEXT, 'final-summary.json'),
    {
      schema: 'run04-recovery-v2.summary',
      status: 'PASS',
      released_yocto: (28n * UNIT).toString(),
      escrow_yocto: final.escrow.toString(),
      claimable_yocto: final.claimable.toString(),
      storage_reserves:
        final.totals.storage_reserves
    }
  );

  console.log(
    'R7_13V_06_RELEASE_28_UNITS: PASS'
  );
}

main().catch(e => {
  console.error(
    'R7_13V_06_STOP:',
    e.stack || String(e)
  );

  console.error(
    'DO NOT AUTOMATICALLY RESTART'
  );

  process.exitCode = 1;
});
