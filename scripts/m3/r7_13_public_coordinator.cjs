'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {fork} = require('node:child_process');
const near = require('near-api-js');

const {ROSTER} = require('./r7_06_swarm.cjs');

const {
  waitForFinalizedCase,
  waitForFinalizedAward
} = require('./r7_13_finality_gate.cjs');

const {
  startServices
} = require('./r7_demo_03_bridge.cjs');

const {
  startBackupProviders
} = require('./r7_demo_03_backup_bridge.cjs');

const {
  startAutonomousWatchdog
} = require('./r7_autonomous_watchdog.cjs');

const {
  componentFromCsv
} = require('./r5_data_envelope.cjs');

const {
  callSignedOnce,
  privateDir,
  readStep
} = require('./r7_13_tx_guard.cjs');

const ROOT = path.resolve(__dirname, '../..');

const KEYROOT = path.join(
  os.homedir(), '.nomogenesis-r7-13'
);

const RUNROOT = path.join(
  KEYROOT, 'live-v2-once-03'
);

const RPC = 'https://rpc.testnet.fastnear.com';
const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';
const PARENT = 'nmg-r713-8d99c17cced1.testnet';

const SHA =
  '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';

const SECOND = 1000000000n;
const UNIT = 10n ** 21n;

const ROLES = [
  ...ROSTER,
  'worker0',
  'worker1',
  'keeper'
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const mode = process.argv[2];

assert(
  ['--dry-run', '--live'].includes(mode),
  'Use --dry-run or --live'
);

if (mode === '--live') {
  assert.equal(
    process.env.NMG_R7_13_ENABLE_LIVE,
    'YES_PUBLIC_TESTNET',
    'Live execution requires explicit opt-in'
  );
}

function secureJson(filename) {
  const stat = fs.lstatSync(filename);

  assert(
    stat.isFile() && !stat.isSymbolicLink()
  );

  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o077, 0);

  return JSON.parse(
    fs.readFileSync(filename, 'utf8')
  );
}

function saveExclusive(filename, data) {
  const fd = fs.openSync(
    filename, 'wx', 0o600
  );

  try {
    fs.writeFileSync(
      fd,
      JSON.stringify(data, null, 2) + '\n'
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function uint16(x) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(x);
  return b;
}

function uint32(x) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(x);
  return b;
}

function uint64(x) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(x);
  return b;
}

function sha(...parts) {
  const h = crypto.createHash('sha256');

  for (const part of parts) {
    h.update(part);
  }

  return h.digest();
}

function expectedCaseId(roots, deadlines) {
  assert.equal(roots.length, 2);
  assert.equal(deadlines.length, 4);

  const original = Buffer.from(PARENT);
  const contract = Buffer.from(CONTRACT);

  const descriptorHash = sha(
    Buffer.from('nomogenesis:rescue-descriptor'),
    uint16(1),
    uint32(original.length),
    original,
    ...roots.map(root => Buffer.from(root)),
    ...deadlines.map(uint64)
  );

  return Array.from(sha(
    Buffer.from('nomogenesis:rescue-case'),
    uint32(contract.length),
    contract,
    descriptorHash
  ));
}

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'r7-13-life',
      method,
      params
    }),
    signal: AbortSignal.timeout(20000)
  });

  assert.equal(
    response.status,
    200,
    `RPC HTTP ${response.status}`
  );

  const body = await response.json();

  if (body.error) {
    throw Error(
      'RPC: ' + JSON.stringify(body.error)
    );
  }

  return body.result;
}

async function view(method, args = {}) {
  const result = await rpc('query', {
    request_type: 'call_function',
    account_id: CONTRACT,
    method_name: method,
    args_base64:
      Buffer.from(
        JSON.stringify(args)
      ).toString('base64'),
    finality: 'final'
  });

  return JSON.parse(
    Buffer.from(result.result).toString('utf8')
  );
}

async function chainTime() {
  const block = await rpc(
    'block',
    {finality: 'final'}
  );

  return BigInt(
    block.header.timestamp_nanosec ??
    block.header.timestamp
  );
}

function waitFor(child, kind, timeoutMs) {
  return new Promise((resolve, reject) => {
    let closed = false;

    const timer = setTimeout(
      () => done(Error(
        `Timeout: ${kind} pid=${child.pid}`
      )),
      timeoutMs
    );

    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function done(error, value) {
      if (closed) return;
      closed = true;
      cleanup();

      if (error) reject(error);
      else resolve(value);
    }

    function onMessage(message) {
      if (message?.kind === kind) {
        done(null, message);
      }
    }

    function onExit(code, signal) {
      done(Error(
        `Early child exit ${code}/${signal} waiting for ${kind}`
      ));
    }

    function onError(error) {
      done(error);
    }

    child.on('message', onMessage);
    child.on('exit', onExit);
    child.on('error', onError);
  });
}

function spawnAgent(role, url, dir, manifest) {
  const special = !ROSTER.includes(role);

  const program = path.join(
    __dirname,
    special
      ? 'r7_13_live_special.cjs'
      : 'r7_13_live_agent.cjs'
  );

  const argv = special
    ? [role, url, RPC]
    : [
        path.join(
          ROOT,
          'demo/policies/r7-06b',
          role + '.json'
        ),
        url,
        RPC
      ];

  const child = fork(program, argv, {
    stdio: [
      'ignore',
      'inherit',
      'inherit',
      'ipc'
    ],
    env: {
      ...process.env,
      NMG_R7_13_RUN_DIR: dir
    }
  });

  const info = {
    role,
    child,
    exitCode: null,
    signal: null
  };

  child.on('exit', (code, signal) => {
    info.exitCode = code;
    info.signal = signal;
  });

  info.ready = waitFor(
    child,
    'ready',
    30000
  ).then(msg => {
    const entry = manifest.get(role);

    assert(entry, `Unknown role ${role}`);
    assert.equal(msg.actor, role);
    assert.equal(
      msg.accountId,
      entry.account_id
    );
    assert.equal(
      msg.publicKey,
      entry.public_key
    );
    assert.equal(msg.pid, child.pid);

    return msg;
  });

  return info;
}

async function connectedAgents(infos) {
  await Promise.all(
    infos.map(item => item.ready)
  );

  assert.equal(
    new Set(
      infos.map(x => x.child.pid)
    ).size,
    10
  );

  const signals = infos.map(item =>
    waitFor(
      item.child,
      'connected',
      30000
    ).then(msg => {
      assert.equal(msg.actor, item.role);
      return msg;
    })
  );

  for (const item of infos) {
    item.child.send({kind: 'connect'});
  }

  await Promise.all(signals);

  console.log(
    'TEN_AGENT_CONNECTIONS: PASS'
  );
}

async function openServer(
  getState, backups, services
) {
  const server = http.createServer(
    (request, response) => {
      if (
        request.method === 'GET' &&
        request.url === '/state'
      ) {
        response.writeHead(200, {
          'content-type': 'application/json'
        });

        response.end(
          JSON.stringify(getState())
        );

        return;
      }

      if (
        request.method === 'GET' &&
        /^\/backup\/[01]$/.test(request.url)
      ) {
        void (async () => {
          const state = getState();

          assert.equal(state.outage, true);
          assert(Array.isArray(state.caseId));

          const rescue = await waitForFinalizedAward({
            caseId: state.caseId,
            lookup: id => view(
              'get_rescue_case',
              {case_id: id}
            )
          });

          assert.equal(
            rescue.phase,
            'BundleAwarded'
          );

          const index = Number(
            request.url.at(-1)
          );

          const delivered =
            await backups.deliver(index);

          assert.deepEqual(
            delivered.root,
            services.sourceCommitments[index]
          );

          response.writeHead(200, {
            'content-type': 'application/json'
          });

          response.end(
            JSON.stringify(delivered)
          );

          console.log(
            'R7_13_BACKUP_DELIVERED:',
            index,
            'PID=' + delivered.pid
          );
        })().catch(error => {
          console.error(
            'BACKUP_RELEASE_DENIED:',
            error.message
          );

          if (!response.headersSent) {
            response.writeHead(500);
          }

          response.end(
            'backup release denied'
          );
        });

        return;
      }

      response.writeHead(404);
      response.end();
    }
  );

  await new Promise((resolve, reject) => {
    server.once('error', reject);

    server.listen(
      0, '127.0.0.1', resolve
    );
  });

  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`
  };
}

function manifestActors() {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        'docs/evidence/R7-13-public-actors.json'
      ),
      'utf8'
    )
  );

  assert.equal(
    data.network,
    'near-testnet'
  );

  assert.equal(
    data.controller,
    PARENT
  );

  assert.equal(
    data.actors.length,
    10
  );

  const map = new Map(
    data.actors.map(a => [a.role, a])
  );

  assert.deepEqual(
    [...map.keys()].sort(),
    [...ROLES].sort()
  );

  return map;
}

async function verifyContract() {
  const status = await rpc('status', []);
  assert.equal(
    status.chain_id,
    'testnet'
  );

  const code = await rpc('query', {
    request_type: 'view_code',
    account_id: CONTRACT,
    finality: 'final'
  });

  const digest = sha(
    Buffer.from(
      code.code_base64,
      'base64'
    )
  ).toString('hex');

  assert.equal(
    digest,
    SHA,
    'Deployed V2 bytes changed'
  );

  const quote = await view(
    'm3_storage_quote'
  );

  const totals = await view(
    'm3_totals'
  );

  const claimable = await view(
    'claimable_total'
  );

  assert.equal(
    BigInt(totals.rescue_escrow),
    0n,
    'Concurrent live escrow detected'
  );

  console.log(
    'PUBLIC_V2_WASM_AND_BASELINE: PASS'
  );

  return {
    quote,
    totals,
    claimable
  };
}

async function controllerAccount() {
  const secret = secureJson(
    path.join(
      KEYROOT,
      'bootstrap.json'
    )
  );

  assert.equal(
    secret.account_id,
    PARENT
  );

  const pair = near.KeyPair.fromString(
    secret.private_key
  );

  assert.equal(
    pair.getPublicKey().toString(),
    secret.public_key
  );

  const store =
    new near.keyStores.InMemoryKeyStore();

  await store.setKey(
    'testnet',
    PARENT,
    pair
  );

  const connection = await near.connect({
    networkId: 'testnet',
    nodeUrl: RPC,
    keyStore: store,
    deps: {keyStore: store}
  });

  return connection.account(PARENT);
}

async function waitClosed(
  caseId,
  infos,
  baseline,
  deadlines
) {
  const limit =
    deadlines[4] + 120n * SECOND;

  let lastPhase = null;

  for (;;) {
    const now = await chainTime();

    assert(
      now < limit,
      'Case finalization exceeded deadline'
    );

    const failed = infos.find(
      i => i.exitCode !== null &&
        i.exitCode !== 0
    );

    assert(
      !failed,
      `Agent failed: ${failed?.role}: ${failed?.exitCode}`
    );

    const rescue = await view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert(
      rescue,
      'Live case disappeared'
    );

    if (rescue.phase !== lastPhase) {
      console.log(
        'PUBLIC_CASE_PHASE:',
        rescue.phase,
        'JOBS=' + rescue.job_ids.length,
        'OFFERS=' + rescue.offer_ids.length
      );

      lastPhase = rescue.phase;
    }

    if (rescue.phase === 'Closed') {
      const jobs = await Promise.all(
        rescue.job_ids.map(job_id =>
          view(
            'get_rescue_job',
            {job_id}
          )
        )
      );

      if (jobs.every(
        job => job.phase === 'Completed'
      )) {
        assert.equal(
          rescue.job_ids.length,
          2
        );

        assert.equal(
          rescue.offer_ids.length,
          3
        );

        assert(
          rescue.resolved_payloads.every(
            Array.isArray
          )
        );

        const after = await view(
          'm3_totals'
        );

        const claimed = await view(
          'claimable_total'
        );

        assert.equal(
          BigInt(after.rescue_escrow),
          BigInt(
            baseline.totals.rescue_escrow
          )
        );

        assert.equal(
          BigInt(claimed) -
          BigInt(baseline.claimable),
          52n * UNIT
        );

        console.log(
          'PUBLIC_ONCHAIN_SETTLEMENT_AND_COMPLETION: PASS'
        );

        console.log(
          'DELTA_CLAIMABLE_UNIT:',
          (
            (
              BigInt(claimed) -
              BigInt(baseline.claimable)
            ) / UNIT
          ).toString()
        );

        return {
          case: rescue,
          jobs,
          totals: after,
          claimable: claimed
        };
      }
    }

    await sleep(3000);
  }
}

async function main() {
  let services;
  let backups;
  let watchdog;
  let server;
  let tempDir;

  const children = [];

  const actors = manifestActors();

  assert(
    !fs.existsSync(RUNROOT),
    'Prior live run exists; inspect journal; never restart automatically'
  );

  const baseline = await verifyContract();

  const sourceData = [
    'quantities.csv',
    'prices.csv'
  ].map((name, index) =>
    componentFromCsv(
      path.join(
        ROOT,
        'demo/data',
        name
      ),
      index
    )
  );

  try {
    services = await startServices();
    backups = await startBackupProviders();

    const roots = sourceData.map(
      item => Array.from(item.root)
    );

    assert.deepEqual(
      services.sourceCommitments,
      roots
    );

    assert.deepEqual(
      backups.commitments,
      roots
    );

    watchdog = await startAutonomousWatchdog({
      endpoint: services.endpoint,
      intervalMs: 250,
      failureThreshold: 2
    });

    console.log(
      'SOURCE_BACKUPS_WATCHDOG_READY: PASS'
    );

    const state = {
      outage: false,
      caseId: null,
      contractId: CONTRACT,
      finalDeadlineNs: null
    };

    const hosted = await openServer(
      () => state,
      backups,
      services
    );

    server = hosted.server;

    if (mode === '--dry-run') {
      tempDir = fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          'nmg-r713-dry-'
        )
      );

      fs.chmodSync(
        tempDir,
        0o700
      );
    }

    const transactionDir =
      mode === '--dry-run'
        ? tempDir
        : RUNROOT;

    const infos = ROLES.map(role =>
      spawnAgent(
        role,
        hosted.url,
        transactionDir,
        actors
      )
    );

    children.push(...infos);

    await connectedAgents(infos);

    if (mode === '--dry-run') {
      const creator =
        await controllerAccount();

      const action =
        near.transactions.functionCall(
          'get_rescue_case',
          {
            case_id: Array(32).fill(0)
          },
          200000000000000n,
          0n
        );

      const [hash, signed] =
        await creator.signTransaction(
          CONTRACT,
          [action]
        );

      assert.equal(
        Buffer.from(hash).length,
        32
      );

      assert(
        signed,
        'Unsigned dry-run transaction'
      );

      console.log(
        'UNBROADCAST_CREATOR_SIGNATURE: PASS'
      );

      console.log(
        'TEN_AGENT_DRY_RUN: PASS'
      );

      console.log(
        'PUBLIC_WRITES: 0'
      );

      return;
    }

    // Real Testnet time, no sandbox acceleration.
    const now =
      (await chainTime()) / SECOND;

    const deadlines = [
      300n,
      420n,
      720n,
      1020n,
      1500n
    ].map(offset =>
      (now + offset) * SECOND
    );

    for (const deadline of deadlines) {
      assert.equal(
        BigInt(Number(deadline)),
        deadline,
        'Timestamp cannot round-trip through JSON'
      );
    }

    const caseId = expectedCaseId(
      roots,
      deadlines.slice(0, 4)
    );

    assert.equal(
      caseId.length,
      32
    );

    const existing = await view(
      'get_rescue_case',
      {case_id: caseId}
    );

    assert.equal(
      existing,
      null,
      'Rescue case already exists'
    );

    const creator =
      await controllerAccount();

    privateDir(RUNROOT);

    saveExclusive(
      path.join(RUNROOT, 'run.json'),
      {
        schema: 'nomogenesis.r7-13.live-run.v1',
        case_id: caseId,
        contract: CONTRACT,
        creator: PARENT,
        block_time_ns:
          (now * SECOND).toString(),
        deadlines_ns:
          deadlines.map(String),
        baseline: {
          totals: baseline.totals,
          claimable: baseline.claimable
        },
        state: 'planned',
        restart_allowed: false
      }
    );

    // No automatic restart beyond this point.
    const result = await callSignedOnce({
      dir: RUNROOT,
      role: 'bootstrap',
      step: 'create_rescue_case',
      account: creator,
      contractId: CONTRACT,
      method: 'create_rescue_case',
      args: {
        descriptor: {
          descriptor_version: 1,
          original_provider: PARENT,
          component_commitments: roots,
          dependency_deadline:
            Number(deadlines[0]),
          bid_close:
            Number(deadlines[1]),
          award_close:
            Number(deadlines[2]),
          recovery_deadline:
            Number(deadlines[3])
        }
      },
      deposit: BigInt(
        baseline.quote.case_storage_cost
      )
    });

    assert.deepEqual(
      result.value,
      caseId
    );

    const finalized = await waitForFinalizedCase({
      caseId,
      expected: {
        original_provider: PARENT,
        component_commitments: roots,
        dependency_deadline: Number(deadlines[0]),
        bid_close: Number(deadlines[1]),
        award_close: Number(deadlines[2]),
        recovery_deadline: Number(deadlines[3])
      },
      lookup: id => view(
        'get_rescue_case',
        {case_id: id}
      ),
      chainTime
    });

    assert.deepEqual(finalized.id, caseId);

    console.log(
      'LIVE_CASE_FINALIZED_ON_CHAIN: PASS'
    );

    state.caseId = caseId;
    state.finalDeadlineNs =
      deadlines[4].toString();

    console.log(
      'LIVE_CASE_CREATED:',
      Buffer.from(caseId).toString('hex'),
      'TX=' + result.tx
    );

    const stopped =
      await services.stopSource();

    assert.equal(
      stopped.signal,
      'SIGTERM'
    );

    const failure =
      await watchdog.waitForOutage(15000);

    assert.equal(
      failure.kind,
      'outage'
    );

    assert.equal(
      failure.consecutive_failures,
      2
    );

    state.outage = true;

    console.log(
      'REAL_PROCESS_OUTAGE_DETECTED: PASS',
      failure.since_last_healthy_ms + 'ms'
    );

    const terminal = await waitClosed(
      caseId,
      infos,
      baseline,
      deadlines
    );

    const expected = [
      ['bootstrap', 'create_rescue_case'],
      ['buyer-1', 'create_funded_rescue_job'],
      ['buyer-2', 'create_funded_rescue_job'],
      ['worker0', 'accept_rescue_job'],
      ['worker1', 'accept_rescue_job'],
      ['provider-alpha', 'post_rescue_offer'],
      ['provider-beta', 'post_rescue_offer'],
      ['provider-gamma', 'post_rescue_offer'],
      ['buyer-1', 'register_r7_v2_consent'],
      ['buyer-2', 'register_r7_v2_consent'],
      ['keeper', 'award_r7_v2_bundle'],
      ['keeper', 'release_open_rescue_offer'],
      ['provider-beta', 'submit_rescue_component'],
      ['provider-gamma', 'submit_rescue_component'],
      ['keeper', 'settle_rescue_bundle'],
      ['worker0', 'complete_rescue_job'],
      ['worker1', 'complete_rescue_job']
    ];

    const rows = expected.map(
      ([role, step]) => {
        const row = readStep(
          RUNROOT,
          role,
          step
        );

        assert(
          row && row.state === 'confirmed',
          `Unconfirmed ${role}/${step}`
        );

        assert.equal(
          row.receiver,
          CONTRACT
        );

        return {
          role,
          step,
          tx: row.tx
        };
      }
    );

    assert.equal(
      new Set(rows.map(row => row.tx)).size,
      expected.length
    );

    saveExclusive(
      path.join(RUNROOT, 'evidence.json'),
      {
        schema:
          'nomogenesis.r7-13.live-evidence.v1',
        network: 'testnet',
        contract: CONTRACT,
        case_id: caseId,
        transactions: rows,
        terminal,
        prior_claimable:
          baseline.claimable,
        limitations: [
          'Same host synthetic agents',
          'Controlled source process outage'
        ]
      }
    );

    console.log(
      'SEVENTEEN_PUBLIC_TX_HASHES: PASS'
    );

    console.log(
      'R7_13_PUBLIC_FULL_LIFECYCLE: PASS'
    );

  } finally {
    for (const item of children) {
      const child = item.child;

      if (
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill('SIGTERM');
      }
    }

    if (watchdog) {
      await watchdog.close();
    }

    if (backups) {
      await backups.close();
    }

    if (services) {
      await services.close();
    }

    if (server) {
      await new Promise(resolve =>
        server.close(resolve)
      );
    }

    if (tempDir) {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  }
}

main().catch(error => {
  console.error(
    'R7_13_COORDINATOR_STOP:',
    error.stack || error
  );

  console.error(
    'Do not restart live mode before reconciling journals.'
  );

  process.exitCode = 1;
});
