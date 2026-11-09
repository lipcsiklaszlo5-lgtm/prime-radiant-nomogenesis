'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const {readWithRetry} = require('./r7_13_read_resilience.cjs');

const {
  createRpcBroker
} = require('./r7_13h_rpc_broker.cjs');

const mode = process.argv[2];

assert.equal(
  process.argv.length, 3,
  'Exactly one mode is required'
);

assert(
  ['--check', '--live'].includes(mode),
  'Use --check or --live'
);

const live = mode === '--live';

const ROOT = path.join(
  os.homedir(), '.nomogenesis-r7-13'
);

const RUN = path.join(
  ROOT, 'live-v2-once-08'
);

const INTENT = path.join(
  ROOT, 'live-v2-once-08-launch-intent.json'
);

const LOG = path.join(
  ROOT, 'live-v2-once-08-launch.log'
);

const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';

const DEPLOYED_SHA =
  '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';

const BANNED_SEND = new Set([
  'broadcast_tx_commit',
  'broadcast_tx_async',
  'broadcast_tx',
  'send_tx'
]);

function absent(filename) {
  try {
    fs.lstatSync(filename);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}

function privateDirectory(filename) {
  const s = fs.lstatSync(filename);

  assert(s.isDirectory() && !s.isSymbolicLink());
  assert.equal(s.uid, process.getuid());
  assert.equal(s.mode & 0o077, 0);
}

function exclusiveJson(filename, value) {
  const fd = fs.openSync(filename, 'wx', 0o600);

  try {
    fs.writeFileSync(
      fd, JSON.stringify(value, null, 2) + '\n'
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function securityGate() {
  privateDirectory(ROOT);

  // RUN06 must be fully recovered before RUN08.
  const recovery = path.join(
    ROOT,
    'run07-recovery-once-01',
    'final-summary.json'
  );

  const reportStat = fs.lstatSync(recovery);

  assert(reportStat.isFile() && !reportStat.isSymbolicLink());
  assert.equal(reportStat.uid, process.getuid());
  assert.equal(reportStat.mode & 0o077, 0);

  const report = JSON.parse(
    fs.readFileSync(recovery, 'utf8')
  );

  assert.equal(report.status, 'PASS');

  const proof = JSON.parse(fs.readFileSync(
    path.join(
      __dirname,
      '../../docs/evidence/R7-13V-run07-recovery-live-proof.json'
    ),
    'utf8'
  ));

  assert.equal(
    proof.schema,
    'nomogenesis.run07.recovery.live-proof.v1'
  );
  assert.equal(proof.source_run, 'live-v2-once-07');
  assert.equal(proof.verified_transaction_count, 7);
  assert.equal(proof.case_id_hex, report.case_id_hex);

  assert.equal(
    proof.summary_sha256,
    crypto.createHash('sha256')
      .update(fs.readFileSync(recovery))
      .digest('hex')
  );

  assert.equal(proof.transactions.length, 7);
  assert(proof.transactions.every(row =>
    row.final_execution_status === 'FINAL' &&
    row.execution === 'SUCCESS'
  ));
  assert.equal(
    report.case_id_hex,
    'a8ed54f2ee8160e7f51039d189827452628ecccefddf8a7864cfa58516121df6'
  );
  assert.equal(
    BigInt(report.released_yocto),
    52n * 10n ** 21n
  );
  assert.equal(report.transactions.length, 7);
  assert.equal(BigInt(report.escrow_yocto), 0n);
  assert.equal(
    BigInt(report.claimable_yocto),
    270n * 10n ** 21n
  );

  assert(
    fs.statSync(
      path.join(ROOT, 'live-v2-once-04')
    ).isDirectory()
  );

  assert(
    fs.statSync(
      path.join(ROOT, 'live-v2-once-03')
    ).isDirectory()
  );

  assert(
    fs.statSync(
      path.join(ROOT, 'reconcile-run03-once')
    ).isDirectory()
  );

  assert(
    fs.statSync(
      path.join(ROOT, 'live-v2-once-05')
    ).isDirectory()
  );

  assert(
    fs.statSync(
      path.join(ROOT, 'live-v2-once-06')
    ).isDirectory()
  );

  assert(
    fs.statSync(
      path.join(ROOT, 'live-v2-once-07')
    ).isDirectory()
  );
  assert(absent(RUN), 'RUN08 already exists');
  assert(absent(INTENT), 'RUN08 launch intent exists');
  assert(absent(LOG), 'RUN08 launch log exists');

  if (!live) {
    for (const name of [
      'NMG_R7_13_ENABLE_LIVE',
      'NMG_R7_13H_LIVE_APPROVAL',
      'NMG_R7_13V_08_LIVE_APPROVAL'
    ]) {
      assert.equal(
        process.env[name], undefined,
        'Check mode forbids live approval flags'
      );
    }

    return;
  }

  assert.equal(
    process.env.NMG_R7_13_ENABLE_LIVE,
    'YES_PUBLIC_TESTNET'
  );

  assert.equal(
    process.env.NMG_R7_13H_LIVE_APPROVAL,
    'YES_NEW_V2_TESTNET_RUN'
  );

  assert.equal(
    process.env.NMG_R7_13V_08_LIVE_APPROVAL,
    'YES_AUTHORIZE_RUN08_17_TESTNET_TX'
  );

  const tree = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8'
    }
  );

  assert.equal(
    tree.trim(),
    '',
    'LIVE RUN08 requires clean git tree'
  );
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function rpc(url, method, params) {
  assert(
    ['status', 'block', 'query'].includes(method),
    'RUN08 launcher RPC must be read-only'
  );

  return readWithRetry(async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'r7-13v-run08-launcher',
        method,
        params
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      const error = Error(
        'RUN08 RPC HTTP ' + response.status
      );

      error.status = response.status;
      throw error;
    }

    const body = await response.json();

    if (body.error) {
      throw Error(
        'RUN08 RPC: ' +
        JSON.stringify(body.error).slice(0, 250)
      );
    }

    assert(
      Object.hasOwn(body, 'result'),
      'RUN08 RPC result missing'
    );

    return body.result;
  }, {label: 'run08-launcher-' + method});
}

async function contractGate(url) {
  const status = await rpc(url, 'status', []);
  assert.equal(status.chain_id, 'testnet');

  const block = await rpc(
    url, 'block', {finality: 'final'}
  );

  const hash = block.header.hash;

  const timestamp = BigInt(
    block.header.timestamp_nanosec ??
    block.header.timestamp
  );

  const ageMs = Date.now() -
    Number(timestamp / 1000000n);

  assert(ageMs >= -10000 && ageMs < 180000);

  const code = await rpc(url, 'query', {
    request_type: 'view_code',
    account_id: CONTRACT,
    block_id: hash
  });

  const sha = crypto.createHash('sha256')
    .update(
      Buffer.from(code.code_base64, 'base64')
    )
    .digest('hex');

  assert.equal(sha, DEPLOYED_SHA);

  const totals = await rpc(url, 'query', {
    request_type: 'call_function',
    account_id: CONTRACT,
    method_name: 'm3_totals',
    args_base64: 'e30=',
    block_id: hash
  });

  const data = JSON.parse(
    Buffer.from(totals.result).toString('utf8')
  );

  assert.equal(
    BigInt(data.rescue_escrow), 0n,
    'Existing rescue escrow detected'
  );

  const claimsResponse = await rpc(
    url,
    'query',
    {
      request_type: 'call_function',
      account_id: CONTRACT,
      method_name: 'claimable_total',
      args_base64: 'e30=',
      block_id: hash
    }
  );

  const claims = JSON.parse(
    Buffer.from(
      claimsResponse.result
    ).toString('utf8')
  );

  assert.equal(
    BigInt(claims),
    270n * 10n ** 21n,
    'RUN07 recovery claimable baseline mismatch'
  );

  console.log('RUN08_CONTRACT_GATE: PASS');
  console.log('FINALIZED_BLOCK:', hash);

  return {block: hash, sha};
}

async function runChild(url, logFd) {
  const env = {
    ...process.env,
    NMG_R7_13H_RPC_URL: url,
    NMG_R7_13H_RUN_ID: 'live-v2-once-08'
  };

  if (!live) {
    delete env.NMG_R7_13_ENABLE_LIVE;
    delete env.NMG_R7_13H_LIVE_APPROVAL;
    delete env.NMG_R7_13V_08_LIVE_APPROVAL;
  }

  const child = spawn(
    process.execPath,
    [
      path.join(
        __dirname,
        'r7_13_public_coordinator.cjs'
      ),
      live ? '--live' : '--dry-run'
    ],
    {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let outputTail = '';
  let interrupted = false;

  function signalGroup(signal) {
    if (interrupted) return;
    interrupted = true;

    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error('PROCESS_GROUP_STOP:', error.message);
      }
    }
  }

  const onInt = () => signalGroup('SIGTERM');
  const onTerm = () => signalGroup('SIGTERM');

  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);

  function stream(destination, chunk) {
    const bytes = Buffer.from(chunk);

    destination.write(bytes);

    if (logFd !== null) {
      fs.writeSync(logFd, bytes);
    }

    outputTail = (
      outputTail + bytes.toString('utf8')
    ).slice(-4000);
  }

  child.stdout.on(
    'data',
    chunk => stream(process.stdout, chunk)
  );

  child.stderr.on(
    'data',
    chunk => stream(process.stderr, chunk)
  );

  try {
    const outcome = await new Promise(
      (resolve, reject) => {
        child.once('error', reject);

        child.once('close', (code, signal) =>
          resolve({code, signal})
        );
      }
    );

    assert.equal(
      outcome.code, 0,
      `Coordinator exited: ${outcome.code}/${outcome.signal}`
    );

    assert.equal(
      interrupted, false,
      'Coordinator interrupted'
    );

    assert.match(
      outputTail,
      live
        ? /R7_13_PUBLIC_FULL_LIFECYCLE: PASS/
        : /TEN_AGENT_DRY_RUN: PASS/
    );

  } finally {
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
}

async function main() {
  securityGate();

  let blockedBroadcasts = 0;

  const broker = createRpcBroker({
    upstreams: [
      'https://rpc.testnet.fastnear.com',
      'https://archival-rpc.testnet.fastnear.com'
    ],
    sendUpstream: 'https://near-testnet.drpc.org',
    finalityUpstreams: [
      'https://archival-rpc.testnet.fastnear.com',
      'https://rpc.testnet.near.org'
    ],
    minGapMs: 180,
    maxConcurrentReads: 4,
    maxQueued: 140,
    maxReadQueueWaitMs: 5000,
    maxSendQueueWaitMs: 7000,
    maxReadTotalMs: 12000,
    timeoutMs: 18000,
    retryPauseMs: 750,

    fetchImpl: async (url, options) => {
      const message = JSON.parse(options.body);

      if (!live && BANNED_SEND.has(message.method)) {
        blockedBroadcasts++;
        throw Error('READ_ONLY_BROADCAST_BLOCKED');
      }

      return fetch(url, options);
    }
  });

  const url = await broker.listen();

  let logFd = null;

  try {
    const chain = await contractGate(url);

    if (live) {
      // Durable one-shot launch marker, before
      // any live coordinator is started.
      exclusiveJson(INTENT, {
        schema: 'nomogenesis.r7-13v.run08-intent.v1',
        run: 'live-v2-once-08',
        network: 'testnet',
        contract: CONTRACT,
        source_commit:
          execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: path.resolve(__dirname, '../..'),
            encoding: 'utf8'
          }).trim(),
        finalized_preflight_block: chain.block,
        contract_sha256: chain.sha,
        created_utc: new Date().toISOString(),
        restart_allowed: false,
        state: 'initiated'
      });

      logFd = fs.openSync(LOG, 'wx', 0o600);

      console.log(
        'RUN08_DURABLE_LAUNCH_INTENT: WRITTEN'
      );
    }

    await runChild(url, logFd);

    const response = await fetch(url + 'health');

    assert.equal(response.status, 200);

    const health = await response.json();

    assert.equal(health.ok, true);
    assert.equal(health.send_channel_isolated, true);
    assert.equal(health.finality_lane_enabled, true);
    assert.equal(health.active_finality, 0);
    assert.equal(health.queued_finality, 0);
    assert(health.upstream_requests > 0);
    assert.equal(health.queued, 0);
    assert.equal(health.pending, 0);

    if (!live) {
      assert.equal(
        health.distinct_signed_payloads, 0
      );

      assert.equal(blockedBroadcasts, 0);

      assert(absent(RUN));
      assert(absent(INTENT));
      assert(absent(LOG));

      console.log(
        'R7_13V_27_READ_ONLY_RUNNER: PASS'
      );

      console.log('NEW_TESTNET_TRANSACTIONS: 0');
      console.log('RUN08_DIRECTORY_CREATED: NO');

    } else {
      console.log(
        'RUN08_BROADCAST_PAYLOADS:',
        health.distinct_signed_payloads
      );

      console.log(
        'R7_13V_RUN08_LIVE_LIFECYCLE: PASS'
      );
    }

  } finally {
    if (logFd !== null) {
      fs.fsyncSync(logFd);
      fs.closeSync(logFd);
    }

    await broker.close();
  }
}

main().catch(error => {
  console.error(
    'R7_13V_LAUNCHER_STOP:',
    error.stack || String(error)
  );

  console.error(
    'DO NOT AUTOMATICALLY RESTART RUN08.'
  );

  process.exitCode = 1;
});
