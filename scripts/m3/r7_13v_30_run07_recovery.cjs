'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const MODE = process.argv[2];

assert(['--check', '--live'].includes(MODE));
assert.equal(process.argv.length, 3);

const LIVE = MODE === '--live';

const ROOT = path.join(
  os.homedir(), '.nomogenesis-r7-13'
);
const RUN = path.join(ROOT, 'live-v2-once-07');
const NEXT = path.join(ROOT, 'run07-recovery-once-01');

const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';
const PARENT = 'nmg-r713-8d99c17cced1.testnet';
const SIGNER = `keeper.${PARENT}`;

const CASE =
  'a8ed54f2ee8160e7f51039d189827452628ecccefddf8a7864cfa58516121df6';

const WASM =
  '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';

const UNIT = 10n ** 21n;

const RPCS = [
  'https://rpc.testnet.fastnear.com',
  'https://archival-rpc.testnet.fastnear.com'
];

const STEPS = [
  {
    name: 'release-offer-13',
    method: 'release_open_rescue_offer',
    args: {offer_id: 13},
    amount: 12n * UNIT
  },
  {
    name: 'release-offer-14',
    method: 'release_open_rescue_offer',
    args: {offer_id: 14},
    amount: 12n * UNIT
  },
  {
    name: 'release-offer-15',
    method: 'release_open_rescue_offer',
    args: {offer_id: 15},
    amount: 12n * UNIT
  },
  {
    name: 'release-mandate-10',
    method: 'release_expired_rescue_mandate',
    args: {job_id: 10},
    amount: 7n * UNIT
  },
  {
    name: 'release-mandate-11',
    method: 'release_expired_rescue_mandate',
    args: {job_id: 11},
    amount: 7n * UNIT
  },
  {
    name: 'expire-job-10',
    method: 'expire_rescue_job',
    args: {job_id: 10},
    amount: 1n * UNIT
  },
  {
    name: 'expire-job-11',
    method: 'expire_rescue_job',
    args: {job_id: 11},
    amount: 1n * UNIT
  }
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

let requests = 0;
let last = 0;

function exists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

function secureFile(p) {
  const s = fs.lstatSync(p);

  assert(
    s.isFile() &&
    !s.isSymbolicLink() &&
    s.uid === process.getuid() &&
    (s.mode & 0o077) === 0,
    'Unsafe private file: ' + path.basename(p)
  );

  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function secureDir(p) {
  const s = fs.lstatSync(p);

  assert(
    s.isDirectory() &&
    !s.isSymbolicLink() &&
    s.uid === process.getuid() &&
    (s.mode & 0o077) === 0
  );
}

function saveNew(p, value) {
  const fd = fs.openSync(p, 'wx', 0o600);

  try {
    fs.writeFileSync(
      fd, JSON.stringify(value, null, 2) + '\n'
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function replace(p, value) {
  const tmp = p + '.' +
    crypto.randomBytes(8).toString('hex') + '.tmp';

  saveNew(tmp, value);
  fs.renameSync(tmp, p);
}

async function single(
  url, method, params, timeoutMs = 14000
) {
  await sleep(
    Math.max(0, 750 - (Date.now() - last))
  );

  last = Date.now();
  requests++;

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'run07-recovery-read',
      method,
      params
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const raw = await response.text();
  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    throw Error(
      'RPC_NON_JSON ' + method +
      ' HTTP ' + response.status
    );
  }

  if (!response.ok || body.error) {
    throw Error(
      'RPC_ERROR ' + method +
      ' HTTP ' + response.status + ' ' +
      JSON.stringify(
        body.error ?? body
      ).slice(0, 220)
    );
  }

  assert(Object.hasOwn(body, 'result'));
  return body.result;
}

async function read(method, params) {
  assert(
    ['status', 'block', 'query', 'tx'].includes(method),
    'Read-only RPC only'
  );

  let lastError;

  for (const url of RPCS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await single(url, method, params);
      } catch (e) {
        lastError = e;
        if (attempt === 0) await sleep(800);
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

async function snapshot() {
  const b = await read(
    'block', {finality: 'final'}
  );

  const ns = BigInt(
    b.header.timestamp_nanosec ??
    b.header.timestamp
  );

  const age = Date.now() -
    Number(ns / 1000000n);

  assert(
    age >= -10000 && age < 180000,
    'Stale finalized Testnet block'
  );

  const h = b.header.hash;

  const rescue = await view(
    h,
    'get_rescue_case',
    {case_id: [...Buffer.from(CASE, 'hex')]}
  );

  assert(
    rescue &&
    Buffer.from(rescue.id).toString('hex') === CASE,
    'RUN07 case identity mismatch'
  );

  const jobs = [];

  for (const id of [10, 11]) {
    jobs.push({
      job: await view(
        h, 'get_rescue_job', {job_id: id}
      ),
      mandate: await view(
        h, 'get_rescue_mandate', {job_id: id}
      ),
      consent: await view(
        h, 'get_r7_v2_consent', {job_id: id}
      )
    });
  }

  const offers = [];

  for (const id of [13, 14, 15]) {
    offers.push(
      await view(
        h, 'get_rescue_offer', {offer_id: id}
      )
    );
  }

  const totals = await view(h, 'm3_totals');

  const claimable = BigInt(
    await view(h, 'claimable_total')
  );

  return {
    h, ns, rescue, jobs, offers, totals,
    claimable,
    escrow: BigInt(totals.rescue_escrow)
  };
}

function assertState(s, index, history) {
  assert.equal(s.rescue.phase, 'Open');
  assert.equal(s.rescue.awarded_bundle_id, null);

  assert.deepEqual(s.rescue.job_ids, [10, 11]);
  assert.deepEqual(s.rescue.offer_ids, [13, 14, 15]);

  const remaining = STEPS.slice(index).reduce(
    (sum, row) => sum + row.amount,
    0n
  );

  assert.equal(s.escrow, remaining);
  assert.equal(s.claimable, 270n * UNIT - remaining);

  assert.equal(
    s.totals.storage_reserves,
    history.storage
  );

  for (let j = 0; j < 2; j++) {
    const {job, mandate, consent} = s.jobs[j];
    const id = j + 10;

    assert.equal(job.id, id);
    assert.equal(
      job.buyer,
      `buyer-${j + 1}.${PARENT}`
    );
    assert.equal(
      job.worker,
      `worker${j}.${PARENT}`
    );
    assert.equal(
      BigInt(job.final_deadline),
      history.finalDeadline
    );

    assert.equal(consent, null);

    const mandateDone = index >= 4 + j;
    const jobDone = index >= 6 + j;

    assert.equal(
      mandate.phase,
      mandateDone ? 'Released' : 'Open'
    );

    assert.equal(
      BigInt(mandate.held_principal),
      mandateDone ? 0n : 7n * UNIT
    );

    if (mandateDone) {
      assert.equal(
        mandate.release_reason,
        'AwardExpired'
      );
    }

    assert.equal(
      job.phase,
      jobDone ? 'Expired' : 'Accepted'
    );

    assert.equal(
      BigInt(job.held_worker_reward),
      jobDone ? 0n : UNIT
    );
  }

  const owners = [
    'provider-alpha',
    'provider-gamma',
    'provider-beta'
  ];

  s.offers.forEach((offer, j) => {
    assert.equal(offer.id, j + 13);

    assert.equal(
      offer.provider,
      `${owners[j]}.${PARENT}`
    );

    const done = index > j;

    assert.equal(
      offer.phase,
      done ? 'Released' : 'Open'
    );

    assert.equal(
      BigInt(offer.held_bond),
      done ? 0n : 12n * UNIT
    );

    if (done) {
      assert.equal(
        offer.release_reason,
        'AwardExpired'
      );
    }
  });
}

function history() {
  secureDir(ROOT);
  secureDir(RUN);

  assert(
    !exists(NEXT),
    'Recovery01 already exists: NEVER restart'
  );

  const launch = secureFile(
    path.join(
      ROOT, 'live-v2-once-07-launch-intent.json'
    )
  );

  assert.equal(launch.restart_allowed, false);
  assert.equal(launch.run, 'live-v2-once-07');

  assert.equal(
    launch.source_commit,
    'ab19ca4e5d82766026516249f050391d169e28b0'
  );

  const run = secureFile(
    path.join(RUN, 'run.json')
  );

  assert.equal(run.restart_allowed, false);

  assert.equal(
    Buffer.from(run.case_id).toString('hex'),
    CASE
  );

  assert.equal(run.contract, CONTRACT);

  assert.equal(
    BigInt(run.baseline.claimable),
    218n * UNIT
  );

  assert.equal(
    BigInt(run.baseline.totals.rescue_escrow),
    0n
  );

  assert.equal(run.deadlines_ns.length, 5);

  const journalNames = fs.readdirSync(RUN)
    .filter(x =>
      /^[a-z0-9-]+__[a-z0-9_-]+\.json$/.test(x)
    )
    .sort();

  const expected = {
    'bootstrap__create_rescue_case.json':
      ['confirmed', 'ETX2DGbNNcY5cTqtPBNiv9CdtgCPKypVQgANnmH55Vev'],
    'buyer-1__create_funded_rescue_job.json':
      ['confirmed', '9k7G3rF7R4kt1hwYfs7wJwhhjpMrRMuk2bDNhwh1jMmx'],
    'buyer-1__register_r7_v2_consent.json':
      ['signed_not_confirmed', '9gVm8VWwxJnK5cDf1uZp3EUPYQugYULNpcZNTbDTBjp4'],
    'buyer-2__create_funded_rescue_job.json':
      ['confirmed', '9Vo5h2WhtZSsW34JBZbCDSgUB6Qiq2vSqEJNpfXuBhJA'],
    'buyer-2__register_r7_v2_consent.json':
      ['signed_not_confirmed', '5ZJnkUX6PKp5wapbBnjcWfnCoAQ2HrTouHg5VnKwBArV'],
    'provider-alpha__post_rescue_offer.json':
      ['confirmed', 'EqjjMvRHhCgWjJ14oq4ByubSyJj8nFnti4B1MGWBhK8G'],
    'provider-beta__post_rescue_offer.json':
      ['confirmed', 'DaHy6T7jQW1iiaAF2B97iwe9qbrG1WvVYH37Ks8RJHJt'],
    'provider-gamma__post_rescue_offer.json':
      ['confirmed', '2ipugmHkLjCmieiwyqq4dPC2MscpcHy5tcXmWLZdPYqD'],
    'worker0__accept_rescue_job.json':
      ['confirmed', '6XyGMSmWBRbq6DYL6rprzKKCVBX2SyEVGZQKytCz7KS7'],
    'worker1__accept_rescue_job.json':
      ['confirmed', 'HHh6NMWcduVp3hWrdDNqHazavaVKaKoMiCzKt9XBDzxc']
  };

  assert.deepEqual(
    journalNames,
    Object.keys(expected).sort(),
    'Unexpected RUN07 journal set'
  );

  for (const [name, [state, hash]] of Object.entries(expected)) {
    const j = secureFile(
      path.join(RUN, name)
    );

    assert.equal(j.state, state);
    assert.equal(j.tx, hash);
  }

  return {
    storage: null,
    finalDeadline: BigInt(run.deadlines_ns[4])
  };
}

function utc(ns) {
  return new Date(
    Number(ns / 1000000n)
  ).toISOString();
}

async function finalizedTx(hash) {
  const tx = await read('tx', {
    tx_hash: hash,
    sender_account_id: SIGNER,
    wait_until: 'FINAL'
  });

  assert.equal(
    tx.final_execution_status,
    'FINAL'
  );

  assert.equal(tx.transaction?.hash, hash);
  assert.equal(tx.transaction?.signer_id, SIGNER);
  assert.equal(tx.transaction?.receiver_id, CONTRACT);

  assert(
    !Object.hasOwn(tx.status ?? {}, 'Failure'),
    'Finalized transaction failed'
  );

  assert(
    Object.hasOwn(
      tx.status ?? {}, 'SuccessValue'
    ) ||
    Object.hasOwn(
      tx.status ?? {}, 'SuccessReceiptId'
    )
  );

  assert(
    !(tx.receipts_outcome ?? []).some(row =>
      Object.hasOwn(
        row.outcome?.status ?? {},
        'Failure'
      )
    )
  );

  return tx;
}

async function sendOnce(account, step) {
  const filename = path.join(
    NEXT, step.name + '.json'
  );

  const record = {
    schema: 'nomogenesis.run07.recovery.once.v1',
    name: step.name,
    method: step.method,
    args: step.args,
    amount_yocto: step.amount.toString(),
    signer: SIGNER,
    receiver: CONTRACT,
    state: 'prepared',
    hash: null
  };

  saveNew(filename, record);

  account.accessKeyByPublicKeyCache = {};

  const near = require('near-api-js');
  const {baseEncode} = require('@near-js/utils');

  const action = near.transactions.functionCall(
    step.method,
    step.args,
    200000000000000n,
    0n
  );

  const [rawHash, signed] =
    await account.signTransaction(
      CONTRACT, [action]
    );

  assert.equal(typeof signed.encode, 'function');

  const digest = crypto.createHash('sha256')
    .update(
      Buffer.from(
        signed.transaction.encode()
      )
    )
    .digest();

  assert(
    digest.equals(Buffer.from(rawHash)),
    'Signed transaction hash mismatch'
  );

  const signedBytes = Buffer.from(
    signed.encode()
  );

  assert(signedBytes.length > 100);

  record.hash = baseEncode(rawHash);
  record.state = 'signed_not_confirmed';

  replace(filename, record);

  console.log(
    'SIGNED_HASH:',
    step.name,
    record.hash
  );

  // Exactly one public broadcast.
  // Never retry or fail over signed submissions.
  const submitted = await single(
    RPCS[0],
    'send_tx',
    {
      signed_tx_base64:
        signedBytes.toString('base64'),
      wait_until: 'NONE'
    },
    15000
  );

  console.log(
    'SEND_TX_ACCEPTED:',
    step.name,
    submitted?.final_execution_status ?? 'UNKNOWN'
  );

  let outcome = null;

  for (let n = 0; n < 35; n++) {
    try {
      outcome = await finalizedTx(record.hash);
      break;
    } catch (error) {
      if (n === 34) {
        throw Error(
          'FINALITY_UNCERTAIN HASH=' +
          record.hash + ' ' + error.message
        );
      }

      await sleep(2200);
    }
  }

  assert(outcome);

  record.state = 'confirmed';
  record.confirmed_utc = new Date().toISOString();

  replace(filename, record);

  console.log(
    'FINALIZED_RELEASE:',
    step.name,
    record.hash
  );

  return record;
}

async function main() {
  console.log(
    '=== RUN07 52-UNIT RECOVERY ' + MODE + ' ==='
  );

  const historical = history();

  const network = await read('status', []);
  assert.equal(network.chain_id, 'testnet');

  const baseline = await snapshot();

  // Storage reserves increased during RUN07 funding.
  // They must NOT drift during the recovery itself.
  historical.storage =
    baseline.totals.storage_reserves;

  assertState(baseline, 0, historical);

  const code = await read('query', {
    request_type: 'view_code',
    account_id: CONTRACT,
    block_id: baseline.h
  });

  assert.equal(
    crypto.createHash('sha256')
      .update(
        Buffer.from(code.code_base64, 'base64')
      )
      .digest('hex'),
    WASM
  );

  const awardClose =
    BigInt(baseline.rescue.award_close);

  const finalDeadline =
    historical.finalDeadline;

  assert(
    finalDeadline >
    BigInt(baseline.rescue.recovery_deadline)
  );

  const ready =
    baseline.ns >= awardClose &&
    baseline.ns >= finalDeadline;

  console.log('BASELINE_ESCROW_UNIT: 52');
  console.log('BASELINE_CLAIMABLE_UNIT: 218');

  console.log(
    'AWARD_CLOSE_UTC:',
    utc(awardClose)
  );

  console.log(
    'JOB_FINAL_DEADLINE_UTC:',
    utc(finalDeadline)
  );

  console.log(
    'FINALIZED_CHAIN_UTC:',
    utc(baseline.ns)
  );

  console.log(
    'SEVEN_RELEASE_STEPS:',
    STEPS.map(s => s.name).join(',')
  );

  console.log(
    'RECOVERY_ELIGIBLE:',
    ready ? 'YES' : 'NOT_YET'
  );

  if (!LIVE) {
    console.log('R7_13V_30_READ_ONLY_CHECK: PASS');
    console.log('RECOVERY_DIRECTORY_CREATED: NO');
    console.log('PUBLIC_WRITES: 0');
    console.log('RPC_REQUESTS:', requests);
    return;
  }

  assert(
    ready,
    'Recovery too early: NO transaction was sent'
  );

  assert.equal(
    process.env.NMG_R7_13V_30_LIVE_APPROVAL,
    'YES_RELEASE_RUN07_52_TESTNET_UNITS_ONCE',
    'Separate RUN07 recovery approval required'
  );

  const repo = path.resolve(
    __dirname, '../..'
  );

  assert.equal(
    execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=all'],
      {cwd: repo, encoding: 'utf8'}
    ).trim(),
    '',
    'Live recovery requires clean repository'
  );

  assert.equal(
    execFileSync(
      'git',
      ['branch', '--show-current'],
      {cwd: repo, encoding: 'utf8'}
    ).trim(),
    'feat/r7-13v-30-run07-recovery'
  );

  const near = require('near-api-js');

  assert.equal(
    require('near-api-js/package.json').version,
    '5.1.1'
  );

  const credentials = secureFile(
    path.join(ROOT, 'actors', 'keeper.json')
  );

  assert.equal(credentials.role, 'keeper');
  assert.equal(credentials.network, 'testnet');
  assert.equal(credentials.account_id, SIGNER);

  const pair = near.KeyPair.fromString(
    credentials.private_key
  );

  assert.equal(
    pair.getPublicKey().toString(),
    credentials.public_key
  );

  const access = await read('query', {
    request_type: 'view_access_key',
    account_id: SIGNER,
    public_key: credentials.public_key,
    block_id: baseline.h
  });

  assert.equal(access.permission, 'FullAccess');

  const balance = await read('query', {
    request_type: 'view_account',
    account_id: SIGNER,
    block_id: baseline.h
  });

  assert(
    BigInt(balance.amount) > 50n * UNIT,
    'Keeper balance below safety bound'
  );

  const ks = new near.keyStores.InMemoryKeyStore();

  await ks.setKey('testnet', SIGNER, pair);

  const conn = await near.connect({
    networkId: 'testnet',
    nodeUrl: RPCS[0],
    keyStore: ks,
    deps: {keyStore: ks}
  });

  const account = await conn.account(SIGNER);

  // Unique immutable recovery identity.
  fs.mkdirSync(NEXT, {mode: 0o700});

  saveNew(
    path.join(NEXT, 'intent.json'),
    {
      schema: 'nomogenesis.run07.recovery.intent.v1',
      created_utc: new Date().toISOString(),
      restart_allowed: false,
      source_run: 'live-v2-once-07',
      case_id_hex: CASE,
      baseline_finalized_block: baseline.h,
      baseline_escrow_yocto:
        baseline.escrow.toString(),
      baseline_claimable_yocto:
        baseline.claimable.toString(),
      storage_reserves_yocto: historical.storage,
      planned_steps: STEPS.map(step => ({
        name: step.name,
        method: step.method,
        args: step.args,
        amount_yocto: step.amount.toString()
      }))
    }
  );

  const records = [];

  for (let i = 0; i < STEPS.length; i++) {
    const before = await snapshot();

    assertState(before, i, historical);

    assert(before.ns >= finalDeadline);

    const record = await sendOnce(
      account, STEPS[i]
    );

    records.push({
      name: record.name,
      method: record.method,
      args: record.args,
      hash: record.hash,
      amount_yocto: record.amount_yocto
    });

    const after = await snapshot();

    assertState(after, i + 1, historical);

    console.log(
      'ECONOMIC_STEP_' + (i + 1) + ': PASS'
    );
  }

  const result = await snapshot();

  assertState(result, 7, historical);

  saveNew(
    path.join(NEXT, 'final-summary.json'),
    {
      schema: 'nomogenesis.run07.recovery.final.v1',
      status: 'PASS',
      finished_utc: new Date().toISOString(),
      case_id_hex: CASE,
      finalized_block: result.h,
      released_yocto: (52n * UNIT).toString(),
      escrow_yocto: result.escrow.toString(),
      claimable_yocto: result.claimable.toString(),
      storage_reserves_yocto:
        result.totals.storage_reserves,
      transactions: records
    }
  );

  console.log('=================================');
  console.log('R7_13V_30_RELEASE_52_UNITS: PASS');
  console.log('ESCROW_UNIT: 0');
  console.log('CLAIMABLE_UNIT: 270');
  console.log('STORAGE_RESERVE_DRIFT: 0');
  console.log('NEW_PUBLIC_TRANSACTIONS: 7');
  console.log('=================================');
}

main().catch(error => {
  console.error(
    'R7_13V_30_STOP:',
    error.stack || String(error)
  );

  console.error(
    'DO NOT RESTART LIVE RECOVERY'
  );

  process.exitCode = 1;
});
