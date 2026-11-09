'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

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
  ROOT, 'live-v2-once-04'
);

const INTENT = path.join(
  ROOT, 'live-v2-once-04-launch-intent.json'
);

const LOG = path.join(
  ROOT, 'live-v2-once-04-launch.log'
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

  assert(absent(RUN), 'RUN04 already exists');
  assert(absent(INTENT), 'RUN04 launch intent exists');
  assert(absent(LOG), 'RUN04 launch log exists');

  if (!live) {
    for (const name of [
      'NMG_R7_13_ENABLE_LIVE',
      'NMG_R7_13H_LIVE_APPROVAL',
      'NMG_R7_13V_LIVE_APPROVAL'
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
    process.env.NMG_R7_13V_LIVE_APPROVAL,
    'YES_AUTHORIZE_RUN04_17_TESTNET_TX'
  );
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'r7-13v-launcher',
      method,
      params
    }),
    signal: AbortSignal.timeout(25000)
  });

  assert.equal(
    response.status, 200,
    `Read-only RPC ${method}: HTTP ${response.status}`
  );

  const body = await response.json();

  if (body.error) {
    throw Error(
      `Read-only RPC ${method}: ` +
      JSON.stringify(body.error).slice(0, 250)
    );
  }

  return body.result;
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

  console.log('RUN04_CONTRACT_GATE: PASS');
  console.log('FINALIZED_BLOCK:', hash);

  return {block: hash, sha};
}

async function runChild(url, logFd) {
  const env = {
    ...process.env,
    NMG_R7_13H_RPC_URL: url,
    NMG_R7_13H_RUN_ID: 'live-v2-once-04'
  };

  if (!live) {
    delete env.NMG_R7_13_ENABLE_LIVE;
    delete env.NMG_R7_13H_LIVE_APPROVAL;
    delete env.NMG_R7_13V_LIVE_APPROVAL;
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
      'https://near-testnet.drpc.org',
      'https://rpc.testnet.fastnear.com'
    ],
    minGapMs: 180,
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
        schema: 'nomogenesis.r7-13v.run04-intent.v1',
        run: 'live-v2-once-04',
        network: 'testnet',
        contract: CONTRACT,
        source_commit:
          '719e82b7652c2e380de9c044bd09f432798a6040',
        finalized_preflight_block: chain.block,
        contract_sha256: chain.sha,
        created_utc: new Date().toISOString(),
        restart_allowed: false,
        state: 'initiated'
      });

      logFd = fs.openSync(LOG, 'wx', 0o600);

      console.log(
        'RUN04_DURABLE_LAUNCH_INTENT: WRITTEN'
      );
    }

    await runChild(url, logFd);

    const response = await fetch(url + 'health');

    assert.equal(response.status, 200);

    const health = await response.json();

    assert.equal(health.ok, true);
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
        'R7_13V_01_READ_ONLY_RUNNER: PASS'
      );

      console.log('NEW_TESTNET_TRANSACTIONS: 0');
      console.log('RUN04_DIRECTORY_CREATED: NO');

    } else {
      console.log(
        'RUN04_BROADCAST_PAYLOADS:',
        health.distinct_signed_payloads
      );

      console.log(
        'R7_13V_RUN04_LIVE_LIFECYCLE: PASS'
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
    'DO NOT AUTOMATICALLY RESTART RUN04.'
  );

  process.exitCode = 1;
});
