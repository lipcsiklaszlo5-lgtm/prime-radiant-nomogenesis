'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert(['--check', '--live'].includes(mode));
const live = mode === '--live';

const ROOT = path.join(os.homedir(), '.nomogenesis-r7-13');
const RUN = path.join(ROOT, 'live-v2-once-08');
const NEXT = path.join(ROOT, 'run08-recovery-once-01');

const CASE =
  'ed82e7e61bbaea90f5c8a5c31166ef9fe65745c3422367c28a8391bff2880593';
const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';
const PARENT = 'nmg-r713-8d99c17cced1.testnet';
const SIGNER = 'keeper.' + PARENT;
const WASM =
  '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';

const UNIT = 10n ** 21n;

const READ = [
  'https://rpc.testnet.fastnear.com',
  'https://archival-rpc.testnet.fastnear.com',
  'https://rpc.testnet.near.org'
];

const SEND = 'https://near-testnet.drpc.org';

const STEPS = [
  {
    name: 'release-offer-16',
    method: 'release_open_rescue_offer',
    args: {offer_id: 16},
    units: 12
  },
  {
    name: 'release-offer-17',
    method: 'release_open_rescue_offer',
    args: {offer_id: 17},
    units: 12
  },
  {
    name: 'release-mandate-12',
    method: 'release_expired_rescue_mandate',
    args: {job_id: 12},
    units: 7
  },
  {
    name: 'expire-job-12',
    method: 'expire_rescue_job',
    args: {job_id: 12},
    units: 1
  }
];

function secureFile(file) {
  const s = fs.lstatSync(file);
  assert(
    s.isFile() && !s.isSymbolicLink() &&
    s.uid === process.getuid() &&
    (s.mode & 0o077) === 0,
    'Unsafe private file: ' + path.basename(file)
  );
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function secureDir(dir) {
  const s = fs.lstatSync(dir);
  assert(
    s.isDirectory() && !s.isSymbolicLink() &&
    s.uid === process.getuid() &&
    (s.mode & 0o077) === 0
  );
}

function exists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

function writeNew(file, obj) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(obj, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function replace(file, obj) {
  const tmp = file + '.' +
    crypto.randomBytes(8).toString('hex') + '.tmp';
  writeNew(tmp, obj);
  fs.renameSync(tmp, file);
}

let readCalls = 0;

async function rpcOnce(url, method, params, timeout = 12000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'run08-recovery',
      method,
      params
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(timeout)
  });

  if (response.status !== 200) {
    throw Error('HTTP_' + response.status + ' ' + method);
  }

  const raw = await response.text();
  assert(raw.length < 16 * 1024 * 1024);
  const body = JSON.parse(raw);

  if (body.error) {
    throw Error('RPC_' + JSON.stringify(body.error).slice(0, 180));
  }

  assert(Object.hasOwn(body, 'result'));
  return body.result;
}

async function read(method, params) {
  assert(['status', 'block', 'query', 'tx'].includes(method));

  let last;
  for (const endpoint of READ) {
    try {
      assert(++readCalls <= 160, 'Read budget exhausted');
      return await rpcOnce(endpoint, method, params);
    } catch (e) {
      last = e;
      console.log(
        'READ_FAIL=' + method +
        ' VIA=' + new URL(endpoint).hostname +
        ' REASON=' + e.message.slice(0, 100)
      );
    }
  }
  throw last;
}

async function view(block, method, args = {}) {
  const result = await read('query', {
    request_type: 'call_function',
    account_id: CONTRACT,
    method_name: method,
    args_base64:
      Buffer.from(JSON.stringify(args)).toString('base64'),
    block_id: block
  });

  return JSON.parse(
    Buffer.from(result.result).toString('utf8')
  );
}

async function snapshot() {
  const block = await read('block', {finality: 'final'});
  const h = block.header.hash;
  const ns = BigInt(
    block.header.timestamp_nanosec ?? block.header.timestamp
  );

  const age = Date.now() - Number(ns / 1000000n);
  assert(age >= -10000 && age < 180000, 'Stale finalized block');

  const c = await view(h, 'get_rescue_case', {
    case_id: [...Buffer.from(CASE, 'hex')]
  });

  assert(c && Buffer.from(c.id).toString('hex') === CASE);

  const job = await view(h, 'get_rescue_job', {job_id: 12});
  const mandate = await view(
    h, 'get_rescue_mandate', {job_id: 12}
  );
  const consent = await view(
    h, 'get_r7_v2_consent', {job_id: 12}
  );

  const offers = [];
  for (const id of [16, 17]) {
    offers.push(
      await view(h, 'get_rescue_offer', {offer_id: id})
    );
  }

  const totals = await view(h, 'm3_totals');
  const claimable = BigInt(
    await view(h, 'claimable_total')
  );

  return {
    h, ns, c, job, mandate, consent, offers, totals,
    claimable,
    escrow: BigInt(totals.rescue_escrow)
  };
}

function assertState(s, index, storage) {
  assert.equal(s.c.phase, 'Open');
  assert.equal(s.c.awarded_bundle_id, null);
  assert.deepEqual(s.c.job_ids, [12]);
  assert.deepEqual(s.c.offer_ids, [16, 17]);
  assert(s.ns >= BigInt(s.c.award_close));

  assert.equal(s.job.id, 12);
  assert.equal(s.job.buyer, 'buyer-2.' + PARENT);
  assert.equal(s.job.worker, 'worker1.' + PARENT);
  assert.equal(s.consent, null);

  const released = STEPS.slice(0, index)
    .reduce((sum, item) => sum + item.units, 0);

  assert.equal(s.escrow, BigInt(32 - released) * UNIT);
  assert.equal(s.claimable, BigInt(270 + released) * UNIT);
  assert.equal(s.totals.storage_reserves, storage);

  const mandateDone = index >= 3;
  const jobDone = index >= 4;

  assert.equal(
    s.mandate.phase,
    mandateDone ? 'Released' : 'Open'
  );

  assert.equal(
    BigInt(s.mandate.held_principal),
    mandateDone ? 0n : 7n * UNIT
  );

  if (mandateDone) {
    assert.equal(s.mandate.release_reason, 'AwardExpired');
  }

  assert.equal(s.job.phase, jobDone ? 'Expired' : 'Accepted');

  assert.equal(
    BigInt(s.job.held_worker_reward),
    jobDone ? 0n : UNIT
  );

  for (let j = 0; j < 2; j++) {
    const offer = s.offers[j];
    const done = index > j;

    assert.equal(offer.id, 16 + j);
    assert.equal(
      offer.provider,
      (j === 0 ? 'provider-beta.' : 'provider-alpha.') + PARENT
    );

    assert.equal(
      offer.phase,
      done ? 'Released' : 'Open'
    );

    assert.equal(
      BigInt(offer.held_bond),
      done ? 0n : 12n * UNIT
    );

    if (done) {
      assert.equal(offer.release_reason, 'AwardExpired');
    }
  }
}

function history() {
  secureDir(ROOT);
  secureDir(RUN);

  assert(
    !exists(NEXT),
    'Recovery already exists; NEVER restart'
  );

  const launch = secureFile(
    path.join(ROOT, 'live-v2-once-08-launch-intent.json')
  );

  assert.equal(launch.run, 'live-v2-once-08');
  assert.equal(launch.restart_allowed, false);

  const run = secureFile(path.join(RUN, 'run.json'));

  assert.equal(run.restart_allowed, false);
  assert.equal(Buffer.from(run.case_id).toString('hex'), CASE);
  assert.equal(run.contract, CONTRACT);
  assert.equal(BigInt(run.baseline.claimable), 270n * UNIT);
  assert.equal(BigInt(run.baseline.totals.rescue_escrow), 0n);

  const expected = {
    'bootstrap__create_rescue_case.json': 'confirmed',
    'buyer-1__create_funded_rescue_job.json':
      'signed_not_confirmed',
    'buyer-2__create_funded_rescue_job.json': 'confirmed',
    'provider-alpha__post_rescue_offer.json': 'confirmed',
    'provider-beta__post_rescue_offer.json': 'confirmed',
    'provider-gamma__post_rescue_offer.json':
      'signed_not_confirmed',
    'worker1__accept_rescue_job.json': 'confirmed'
  };

  const names = fs.readdirSync(RUN)
    .filter(n =>
      /^[a-z0-9-]+__[a-z0-9_]+\.json$/.test(n)
    )
    .sort();

  assert.deepEqual(names, Object.keys(expected).sort());

  for (const [filename, state] of Object.entries(expected)) {
    const record = secureFile(path.join(RUN, filename));
    assert.equal(record.state, state);
    assert.match(
      record.tx,
      /^[1-9A-HJ-NP-Za-km-z]{43,44}$/
    );
  }

  return run;
}

function utc(ns) {
  return new Date(Number(ns / 1000000n)).toISOString();
}

async function finalizedTx(hash) {
  const tx = await read('tx', {
    tx_hash: hash,
    sender_account_id: SIGNER,
    wait_until: 'FINAL'
  });

  assert.equal(tx.final_execution_status, 'FINAL');
  assert.equal(tx.transaction?.hash, hash);
  assert.equal(tx.transaction?.signer_id, SIGNER);
  assert.equal(tx.transaction?.receiver_id, CONTRACT);

  const status = tx.status ?? {};

  assert(!Object.hasOwn(status, 'Failure'));

  assert(
    Object.hasOwn(status, 'SuccessValue') ||
    Object.hasOwn(status, 'SuccessReceiptId')
  );

  assert(
    !(tx.receipts_outcome ?? []).some(
      row => Object.hasOwn(
        row.outcome?.status ?? {}, 'Failure'
      )
    )
  );

  return tx;
}

async function sendOnce(account, step) {
  const file = path.join(NEXT, step.name + '.json');

  const record = {
    schema: 'nomogenesis.run08.recovery.once.v1',
    name: step.name,
    method: step.method,
    args: step.args,
    amount_yocto: (BigInt(step.units) * UNIT).toString(),
    signer: SIGNER,
    receiver: CONTRACT,
    state: 'prepared',
    hash: null
  };

  writeNew(file, record);

  const near = require('near-api-js');
  const {baseEncode} = require('@near-js/utils');

  account.accessKeyByPublicKeyCache = {};

  const [rawHash, signed] = await account.signTransaction(
    CONTRACT,
    [
      near.transactions.functionCall(
        step.method,
        step.args,
        200000000000000n,
        0n
      )
    ]
  );

  const digest = crypto.createHash('sha256')
    .update(Buffer.from(signed.transaction.encode()))
    .digest();

  assert(digest.equals(Buffer.from(rawHash)));

  const bytes = Buffer.from(signed.encode());
  assert(bytes.length > 100);

  record.hash = baseEncode(rawHash);
  record.state = 'signed_not_confirmed';
  replace(file, record);

  console.log(
    'SIGNED_ONCE=' + step.name + ' HASH=' + record.hash
  );

  // One submission. Never retry a signed transaction.
  await rpcOnce(
    SEND,
    'send_tx',
    {
      signed_tx_base64: bytes.toString('base64'),
      wait_until: 'NONE'
    },
    16000
  );

  let outcome = null;
  let lastError;

  for (let i = 0; i < 4; i++) {
    try {
      outcome = await finalizedTx(record.hash);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!outcome) {
    throw Error(
      'FINALITY_UNCERTAIN HASH=' + record.hash +
      ' LAST=' + String(lastError?.message).slice(0, 160)
    );
  }

  record.state = 'confirmed';
  record.confirmed_utc = new Date().toISOString();
  replace(file, record);

  console.log(
    'FINAL_SUCCESS=' + step.name +
    ' HASH=' + record.hash
  );

  return record;
}

async function main() {
  const historyRun = history();

  const network = await read('status', []);
  assert.equal(network.chain_id, 'testnet');

  const before = await snapshot();
  const storage = before.totals.storage_reserves;

  assertState(before, 0, storage);

  const code = await read('query', {
    request_type: 'view_code',
    account_id: CONTRACT,
    block_id: before.h
  });

  assert.equal(
    crypto.createHash('sha256')
      .update(Buffer.from(code.code_base64, 'base64'))
      .digest('hex'),
    WASM
  );

  const deadline = BigInt(before.job.final_deadline);

  assert(deadline > BigInt(before.c.recovery_deadline));
  assert.equal(
    deadline,
    BigInt(historyRun.deadlines_ns[4])
  );

  const ready = before.ns >= deadline;

  console.log('=== RUN08 RECOVERY ===');
  console.log('FINAL_BLOCK=' + before.h);
  console.log('ESCROW_UNIT=32');
  console.log('CLAIMABLE_UNIT=270');
  console.log('AWARD_CLOSE_UTC=' +
    utc(BigInt(before.c.award_close)));
  console.log('JOB_FINAL_DEADLINE_UTC=' + utc(deadline));
  console.log('FINALIZED_CHAIN_UTC=' + utc(before.ns));
  console.log('RECOVERY_ELIGIBLE=' +
    String(ready).toUpperCase());

  if (!live) {
    console.log('READ_ONLY_CHECK_PASS');
    console.log('BROADCASTS=0');
    console.log('RECOVERY_DIRECTORY_CREATED=NO');
    return;
  }

  assert(ready, 'Final deadline not reached');

  assert.equal(
    process.env.NMG_R7_13V_38_LIVE_APPROVAL,
    'YES_RELEASE_RUN08_32_TESTNET_UNITS_ONCE'
  );

  const repo = path.resolve(__dirname, '../..');

  assert.equal(
    execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=all'],
      {cwd: repo, encoding: 'utf8'}
    ).trim(),
    ''
  );

  assert.equal(
    execFileSync(
      'git',
      ['branch', '--show-current'],
      {cwd: repo, encoding: 'utf8'}
    ).trim(),
    'feat/r7-13v-34-run08-scaffold'
  );

  const near = require('near-api-js');

  assert.equal(
    require('near-api-js/package.json').version,
    '5.1.1'
  );

  const credential = secureFile(
    path.join(ROOT, 'actors', 'keeper.json')
  );

  assert.equal(credential.role, 'keeper');
  assert.equal(credential.network, 'testnet');
  assert.equal(credential.account_id, SIGNER);

  const pair = near.KeyPair.fromString(
    credential.private_key
  );

  assert.equal(
    pair.getPublicKey().toString(),
    credential.public_key
  );

  const access = await read('query', {
    request_type: 'view_access_key',
    account_id: SIGNER,
    public_key: credential.public_key,
    block_id: before.h
  });

  assert.equal(access.permission, 'FullAccess');

  const balance = await read('query', {
    request_type: 'view_account',
    account_id: SIGNER,
    block_id: before.h
  });

  assert(
    BigInt(balance.amount) > 50n * UNIT,
    'Keeper balance below safety bound'
  );

  const keys = new near.keyStores.InMemoryKeyStore();
  await keys.setKey('testnet', SIGNER, pair);

  const conn = await near.connect({
    networkId: 'testnet',
    nodeUrl: READ[0],
    keyStore: keys,
    deps: {keyStore: keys}
  });

  const account = await conn.account(SIGNER);

  fs.mkdirSync(NEXT, {mode: 0o700});

  writeNew(
    path.join(NEXT, 'intent.json'),
    {
      schema: 'nomogenesis.run08.recovery.intent.v1',
      source_run: 'live-v2-once-08',
      case_id_hex: CASE,
      created_utc: new Date().toISOString(),
      restart_allowed: false,
      baseline_block: before.h,
      baseline_escrow: before.escrow.toString(),
      baseline_claimable: before.claimable.toString(),
      storage_reserves: storage,
      steps: STEPS
    }
  );

  const records = [];

  for (let i = 0; i < STEPS.length; i++) {
    assertState(await snapshot(), i, storage);

    const record = await sendOnce(account, STEPS[i]);

    records.push({
      name: record.name,
      hash: record.hash,
      method: record.method
    });

    assertState(await snapshot(), i + 1, storage);
    console.log('ECONOMIC_STEP_' + (i + 1) + '_PASS');
  }

  const result = await snapshot();
  assertState(result, 4, storage);

  writeNew(
    path.join(NEXT, 'final-summary.json'),
    {
      status: 'PASS',
      case_id_hex: CASE,
      released_units: 32,
      escrow_yocto: result.escrow.toString(),
      claimable_yocto: result.claimable.toString(),
      storage_reserves: storage,
      finalized_block: result.h,
      transactions: records
    }
  );

  console.log('RUN08_RECOVERY_COMPLETE=PASS');
  console.log('ESCROW_UNIT=0');
  console.log('CLAIMABLE_UNIT=302');
}

main().catch(error => {
  console.error(
    'RUN08_RECOVERY_STOP=' +
    String(error.stack || error)
  );
  console.error('NEVER_RESTART; RECONCILE JOURNALS');
  process.exitCode = 1;
});
