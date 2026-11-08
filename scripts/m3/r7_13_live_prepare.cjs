'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

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

const ROOT = path.resolve(__dirname, '../..');

const RPC = 'https://rpc.testnet.fastnear.com';
const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';
const ORIGINAL = 'nmg-r713-8d99c17cced1.testnet';

const SECOND = 1000000000n;

function sha(...buffers) {
  return crypto.createHash('sha256')
    .update(Buffer.concat(buffers))
    .digest();
}

function lengthBytes(bytes) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function uint64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(value);
  return buffer;
}

function expectedCaseId(roots, deadlines) {
  assert.equal(roots.length, 2);
  assert.equal(deadlines.length, 4);

  const descriptorHash = sha(
    Buffer.from('nomogenesis:rescue-descriptor'),
    uint16(1),
    lengthBytes(Buffer.from(ORIGINAL, 'utf8')),
    ...roots.map(x => Buffer.from(x)),
    ...deadlines.map(uint64)
  );

  return sha(
    Buffer.from('nomogenesis:rescue-case'),
    lengthBytes(Buffer.from(CONTRACT, 'utf8')),
    descriptorHash
  );
}

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'r7-13-live-stage',
      method,
      params
    })
  });

  assert(response.ok, 'Public RPC unavailable');

  const result = await response.json();

  if (result.error) {
    throw Error(JSON.stringify(result.error));
  }

  return result.result;
}

async function main() {
  let services;
  let backups;
  let watchdog;

  try {
    const status = await rpc('status', []);
    assert.equal(status.chain_id, 'testnet');

    console.log('PUBLIC_NETWORK: testnet');

    const block = await rpc('block', {
      finality: 'final'
    });

    const now = BigInt(
      block.header.timestamp_nanosec ??
      block.header.timestamp
    ) / SECOND;

    assert(now > 0n);

    // These are only preview offsets.
    // A real run MUST calculate fresh deadlines.
    const deadlines = [
      now + 300n,
      now + 420n,
      now + 720n,
      now + 1020n
    ].map(x => x * SECOND);

    const finalDeadline = (
      now + 1500n
    ) * SECOND;

    for (const time of [...deadlines, finalDeadline]) {
      assert.equal(
        BigInt(Number(time)),
        time,
        'unsafe u64 JSON conversion'
      );
    }

    const data = [
      'quantities.csv',
      'prices.csv'
    ].map((filename, index) =>
      componentFromCsv(
        path.join(ROOT, 'demo/data', filename),
        index
      )
    );

    services = await startServices();
    backups = await startBackupProviders();

    const roots = data.map(
      component => Array.from(component.root)
    );

    assert.deepEqual(
      services.sourceCommitments,
      roots
    );

    assert.deepEqual(
      backups.commitments,
      roots
    );

    assert.notEqual(
      services.sourcePid,
      services.observerPid
    );

    assert.notEqual(
      backups.pids[0],
      backups.pids[1]
    );

    console.log('REAL_SOURCE_PROCESS_READY: PASS');
    console.log('TWO_BACKUP_PROCESSES_READY: PASS');
    console.log('SOURCE_BACKUP_MERKLE_ROOTS_MATCH: PASS');

    watchdog = await startAutonomousWatchdog({
      endpoint: services.endpoint,
      intervalMs: 250,
      failureThreshold: 2
    });

    assert(
      Number.isInteger(watchdog.pid) &&
      watchdog.pid > 0
    );

    console.log('LIVE_WATCHDOG_ARMED: PASS');

    const caseId = expectedCaseId(
      roots, deadlines
    );

    assert.equal(caseId.length, 32);

    console.log(
      'PREVIEW_CASE_ID_SHA256:',
      caseId.toString('hex')
    );

    console.log(
      'PREVIEW_DEPENDENCY_SECONDS:',
      Number(deadlines[0] / SECOND - now)
    );

    console.log(
      'PREVIEW_BID_CLOSE_SECONDS:',
      Number(deadlines[1] / SECOND - now)
    );

    console.log(
      'PREVIEW_AWARD_CLOSE_SECONDS:',
      Number(deadlines[2] / SECOND - now)
    );

    console.log(
      'PREVIEW_RECOVERY_DEADLINE_SECONDS:',
      Number(deadlines[3] / SECOND - now)
    );

    console.log(
      'PREVIEW_WORKER_DEADLINE_SECONDS:',
      Number(finalDeadline / SECOND - now)
    );

    console.log('PREPARED_CASE_BROADCAST: NO');
    console.log('PUBLIC_TRANSACTIONS_SENT: 0');
    console.log('R7_13_LIVE_STAGING: PASS');

  } finally {
    if (watchdog) await watchdog.close();
    if (services) await services.close();
    if (backups) await backups.close();
  }
}

main().catch(error => {
  console.error('R7_13_LIVE_STAGING: FAIL');
  console.error(error.stack || error);
  process.exitCode = 1;
});
