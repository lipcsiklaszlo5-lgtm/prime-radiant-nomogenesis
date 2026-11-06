'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const {
  digest,
  verifyPacket,
  newLedger,
  sessionValid
} = require('./r7_06_protocol.cjs');

const ROOT = path.resolve(__dirname, '../..');

const POLICY_DIR = path.join(
  ROOT, 'demo/policies/r7-06b'
);

const DEFAULT = path.join(
  ROOT,
  'docs/evidence/R7-06B-synthetic-signed-decisions.json'
);

const ROSTER = [
  'buyer-1',
  'buyer-2',
  'buyer-3',
  'provider-alpha',
  'provider-beta',
  'provider-gamma',
  'provider-delta'
];

function pythonFormation(market) {
  const program =
    'import json,sys; ' +
    'from r7_06_formation import form; ' +
    'json.dump(form(json.load(sys.stdin)),' +
    'sys.stdout,sort_keys=True)';

  const run = spawnSync(
    'python3',
    ['-B', '-c', program],
    {
      cwd: ROOT,
      input: JSON.stringify(market),
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONPATH: path.join(
          ROOT, 'scripts/m3'
        )
      }
    }
  );

  if (run.error) throw run.error;

  assert.equal(
    run.status,
    0,
    `formation error: ${run.stderr}`
  );

  return JSON.parse(run.stdout);
}

function project(packets, session, now) {
  const used = newLedger();

  const policies = packets.map(x =>
    verifyPacket(x, session, now, used)
  );

  assert.deepEqual(
    policies.map(x => x.actor_id).sort(),
    [...ROSTER].sort(),
    'roster mismatch'
  );

  const buyers = policies
    .filter(x => x.role === 'buyer')
    .map(({actor_id, role, ...v}) => v);

  const offers = policies
    .filter(x => x.role === 'provider')
    .map(({actor_id, role, ...v}) => v);

  buyers.sort(
    (a, b) => a.job_id - b.job_id
  );

  offers.sort(
    (a, b) => a.offer_id - b.offer_id
  );

  return {
    deadline: session.market_deadline,
    buyers,
    offers
  };
}

function verifyReport(report) {
  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'version', 'session', 'verified_at',
      'packets', 'market', 'formation',
      'report_hash', 'limitations'
    ].sort()
  );

  assert.equal(
    report.version,
    'r7-06b-local-synthetic-v1'
  );

  assert.equal(
    report.packets.length,
    ROSTER.length
  );

  sessionValid(report.session);

  assert(
    report.verified_at >= report.session.created_at &&
    report.verified_at < report.session.expires_at,
    'audit clock invalid'
  );

  const market = project(
    report.packets,
    report.session,
    report.verified_at
  );

  assert.deepEqual(
    report.market,
    market,
    'market differs from signed decisions'
  );

  const formation = pythonFormation(market);

  assert.deepEqual(
    report.formation,
    formation,
    'formation not independently reproducible'
  );

  const {report_hash, ...body} = report;

  assert.equal(
    report_hash,
    digest(body),
    'transcript hash mismatch'
  );

  assert.equal(
    formation.onchain_execution_ready,
    false
  );

  return formation;
}

function createReport() {
  const now = Date.now();

  const session = {
    id: 'r7-06b-' +
      crypto.randomBytes(16).toString('hex'),
    created_at: now,
    expires_at: now + 120000,
    market_deadline: 2
  };

  const packets = [];

  for (const name of ROSTER) {
    const file = path.join(
      POLICY_DIR,
      name + '.json'
    );

    assert(
      fs.statSync(file).isFile(),
      'missing policy ' + name
    );

    const child = spawnSync(
      process.execPath,
      [
        path.join(
          __dirname, 'r7_06_actor.cjs'
        ),
        file,
        JSON.stringify(session)
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 12000,
        maxBuffer: 65536
      }
    );

    if (child.error) throw child.error;

    assert.equal(
      child.status,
      0,
      `agent ${name} failed: ${child.stderr}`
    );

    const packet = JSON.parse(
      child.stdout
    );

    assert.equal(
      packet.event.actor_id,
      name,
      'unexpected signer identity'
    );

    packets.push(packet);
  }

  const verified_at = Date.now();

  const market = project(
    packets,
    session,
    verified_at
  );

  const formation = pythonFormation(market);

  const body = {
    version: 'r7-06b-local-synthetic-v1',
    session,
    verified_at,
    packets,
    market,
    formation,
    limitations: [
      'All child processes run under one operator',
      'Ephemeral public keys are not bound to independent legal owners or NEAR accounts',
      'Session-scoped nonce replay detection, not a durable global authorization log',
      'Archive expiry is evaluated at the operator-recorded verification time',
      'Synthetic public declared preferences, not private real-world valuations',
      'Genesis formation is off-chain and not selected by deployed M3 contract'
    ]
  };

  return {
    ...body,
    report_hash: digest(body)
  };
}

function main() {
  if (process.argv[2] === '--verify') {
    assert.equal(process.argv.length, 4);

    const report = JSON.parse(
      fs.readFileSync(
        path.resolve(process.argv[3]),
        'utf8'
      )
    );

    const outcome = verifyReport(report);

    console.log(
      'SIGNED ACTOR DECISIONS:',
      report.packets.length,
      'PASS'
    );

    console.log(
      'VERIFIED FORMATION:',
      outcome.selected?.job_ids ?? null
    );

    console.log(
      'AUDITABLE REPORT SHA256:',
      report.report_hash
    );

    console.log(
      'R7-06B OFFLINE HISTORICAL SIGNATURE VERIFY: PASS'
    );

    return;
  }

  assert.equal(
    process.argv.length,
    2,
    'no arguments required for creation'
  );

  assert(
    !fs.existsSync(DEFAULT),
    'refusing to overwrite existing signed report'
  );

  const report = createReport();
  const outcome = verifyReport(report);

  assert.deepEqual(
    outcome.selected?.job_ids,
    [1, 2]
  );

  assert.deepEqual(
    outcome.selected?.payments,
    [6, 5]
  );

  assert.deepEqual(
    outcome.selected?.pair,
    [3, 2]
  );

  assert.equal(
    outcome.newly_fundable_under_declared_limits,
    true
  );

  assert.equal(
    outcome.buyer_decisions
      .find(x => x.job_id === 3).willing,
    false
  );

  assert.equal(
    outcome.supplier_decisions
      .find(x => x.offer_id === 4).willing,
    false
  );

  fs.writeFileSync(
    DEFAULT,
    JSON.stringify(report, null, 2) + '\n',
    {flag: 'wx', mode: 0o644}
  );

  console.log(
    'SEPARATE ACTOR PROCESSES:',
    report.packets.length
  );

  console.log(
    'SIGNED AND VERIFIED DECISIONS: PASS'
  );

  console.log(
    'VOLUNTARY BUYER REFUSALS: PASS'
  );

  console.log(
    'PROVIDER COST-FLOOR REFUSALS: PASS'
  );

  console.log(
    'SELECTED BUYERS:',
    outcome.selected.job_ids
  );

  console.log(
    'SELECTED PROVIDERS:',
    outcome.selected.pair
  );

  console.log(
    'BUYER PAYMENTS:',
    outcome.selected.payments
  );

  console.log(
    'AUDITABLE REPORT SHA256:',
    report.report_hash
  );

  console.log(
    'R7-06B LOCAL PROCESS FORMATION: PASS'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      'R7-06B FAIL:',
      error.stack
    );

    process.exitCode = 1;
  }
}

module.exports = {
  createReport,
  verifyReport,
  project,
  pythonFormation,
  ROSTER
};
