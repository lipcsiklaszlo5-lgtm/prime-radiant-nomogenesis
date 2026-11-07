'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {fork} = require('node:child_process');

const {
  DOMAIN,
  bytes,
  digest,
  validatePolicy,
  decision,
  verifyPacket,
  sessionValid,
  newLedger
} = require('./r7_06_protocol.cjs');

const {
  ROSTER,
  project,
  pythonFormation,
  verifyReport
} = require('./r7_06_swarm.cjs');

const ROOT = path.resolve(__dirname, '../..');

const OUTPUT = path.join(
  ROOT,
  'docs/evidence/R7-AUTO-05A-event-driven.json'
);

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function stateFrom(url) {
  const response = await fetch(url + '/state', {
    signal: AbortSignal.timeout(5000)
  });

  assert.equal(response.status, 200);
  return response.json();
}

async function post(url, packet) {
  return fetch(url + '/decision', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(packet),
    signal: AbortSignal.timeout(5000)
  });
}

async function agentMain(policyFile, url) {
  const policy = validatePolicy(
    JSON.parse(fs.readFileSync(policyFile, 'utf8'))
  );

  const initial = await stateFrom(url);
  sessionValid(initial.session);

  assert.equal(initial.outage, false);

  // Agent indicates readiness, not permission to act.
  process.send({
    kind: 'ready',
    actor: policy.actor_id,
    pid: process.pid
  });

  for (let tick = 0; tick < 400; tick++) {
    const state = await stateFrom(url);

    assert.equal(
      state.session.id,
      initial.session.id
    );

    if (state.outage) {
      const now = Date.now();

      const {
        actor_id,
        role,
        ...declaration
      } = policy;

      const event = {
        domain: DOMAIN,
        session_id: state.session.id,
        actor_id,
        role,
        nonce: crypto.randomBytes(16).toString('hex'),
        issued_at: now,
        expires_at: state.session.expires_at,
        declaration,
        verdict: decision(policy)
      };

      // Only this agent process owns the private key.
      const {publicKey, privateKey} =
        crypto.generateKeyPairSync('ed25519');

      const packet = {
        event,
        public_key: publicKey.export({
          type: 'spki',
          format: 'der'
        }).toString('base64'),
        signature: crypto.sign(
          null,
          bytes(event),
          privateKey
        ).toString('base64')
      };

      const response = await post(url, packet);

      assert.equal(
        response.status,
        201,
        'signed decision not accepted'
      );

      console.log(
        'AGENT_EVENT_COMMITTED:',
        actor_id,
        role,
        event.verdict.willing ? 'ACCEPT' : 'REJECT'
      );

      return;
    }

    await sleep(75);
  }

  throw Error('agent discovery timed out');
}

function send(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json'
  });
  res.end(JSON.stringify(value));
}

async function main() {
  const now = Date.now();

  const session = {
    id: 'r7-06b-' +
      crypto.randomBytes(16).toString('hex'),
    created_at: now,
    expires_at: now + 120000,
    market_deadline: 2
  };

  sessionValid(session);

  const ledger = newLedger();
  const packets = [];
  let outage = false;

  const server = http.createServer((req, res) => {
    (async () => {
      if (req.method === 'GET' &&
          req.url === '/state') {
        send(res, 200, {session, outage});
        return;
      }

      if (req.method === 'POST' &&
          req.url === '/decision') {
        assert(outage, 'market event not triggered');

        let raw = '';

        for await (const part of req) {
          raw += part.toString('utf8');
          assert(raw.length < 8192, 'oversized packet');
        }

        const packet = JSON.parse(raw);

        assert(
          ROSTER.includes(packet.event?.actor_id),
          'unknown participant'
        );

        verifyPacket(
          packet,
          session,
          Date.now(),
          ledger
        );

        packets.push(packet);

        send(res, 201, {accepted: true});
        return;
      }

      send(res, 404, {error: 'not found'});
    })().catch(error => {
      send(res, 400, {error: error.message});
    });
  });

  const children = [];

  try {
    await new Promise(resolve =>
      server.listen(0, '127.0.0.1', resolve)
    );

    const url =
      `http://127.0.0.1:${server.address().port}`;

    const ready = ROSTER.map(name => {
      const file = path.join(
        ROOT,
        'demo/policies/r7-06b',
        name + '.json'
      );

      const child = fork(
        __filename,
        ['--agent', file, url],
        {
          stdio: [
            'ignore',
            'inherit',
            'inherit',
            'ipc'
          ]
        }
      );

      children.push(child);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('agent startup timeout')),
          20000
        );

        child.once('message', message => {
          clearTimeout(timer);

          try {
            assert.equal(message.kind, 'ready');
            assert.equal(message.actor, name);
            assert.equal(message.pid, child.pid);
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        child.once('error', reject);
        child.once('exit', code =>
          reject(Error(`agent exited early: ${code}`))
        );
      });
    });

    await Promise.all(ready);

    assert.equal(packets.length, 0);

    console.log(
      'SEVEN_INDEPENDENT_AGENT_PROCESSES_READY: PASS'
    );
    console.log('NO_PRE_OUTAGE_DECISIONS: PASS');

    // This controller publishes only an environment event.
    // It does not send economic actions to the agents.
    const exits = children.map(child =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('agent completion timeout')),
          30000
        );

        child.once('exit', (code, signal) => {
          clearTimeout(timer);

          if (code === 0) resolve();
          else reject(Error(
            `agent failed: ${code}/${signal}`
          ));
        });
      })
    );

    outage = true;
    console.log('OUTAGE_EVENT_PUBLISHED: PASS');

    await Promise.all(exits);

    assert.equal(packets.length, ROSTER.length);

    packets.sort((a, b) =>
      ROSTER.indexOf(a.event.actor_id) -
      ROSTER.indexOf(b.event.actor_id)
    );

    const verifiedAt = Date.now();

    const market = project(
      packets,
      session,
      verifiedAt
    );

    const formation = pythonFormation(market);

    assert.deepEqual(
      formation.selected?.job_ids,
      [1, 2]
    );

    assert.deepEqual(
      formation.selected?.payments,
      [6, 5]
    );

    assert.deepEqual(
      formation.selected?.pair,
      [3, 2]
    );

    assert.equal(
      formation.newly_fundable_under_declared_limits,
      true
    );

    assert.equal(
      formation.buyer_decisions
        .find(x => x.job_id === 3).willing,
      false
    );

    assert.equal(
      formation.supplier_decisions
        .find(x => x.offer_id === 4).willing,
      false
    );

    console.log('SIGNED_SEVEN_AGENT_MARKET: PASS');
    console.log('VOLUNTARY_BUYER_REFUSAL: PASS');
    console.log('SUPPLIER_COST_FLOOR_REFUSAL: PASS');
    console.log('COMPETITIVE_COALITION_FORMATION: PASS');

    // Negative control: the same signed packet
    // cannot be committed twice.
    const replay = await post(url, packets[0]);

    assert.equal(replay.status, 400);
    assert.equal(packets.length, ROSTER.length);

    console.log('SIGNED_EVENT_REPLAY_REJECTED: PASS');

    // Negative control: altered policy data
    // invalidates the original signature.
    const altered = structuredClone(packets[0]);
    altered.event.declaration.cap += 1;

    const forged = await post(url, altered);

    assert.equal(forged.status, 400);
    assert.equal(packets.length, ROSTER.length);

    console.log('TAMPERED_DECISION_REJECTED: PASS');

    const body = {
      version: 'r7-06b-local-synthetic-v1',
      session,
      verified_at: verifiedAt,
      packets,
      market,
      formation,
      limitations: [
        'Event-triggered agents run under one operator',
        'Outage is injected by the test controller',
        'Private keys are process-local and ephemeral',
        'Keys are not bound to public NEAR accounts',
        'Event transport is a local centralized relay',
        'All policy files contain synthetic preferences',
        'This ticket does not submit NEAR transactions',
        'No benefit-exclusion mechanism is implemented'
      ]
    };

    const report = {
      ...body,
      report_hash: digest(body)
    };

    verifyReport(report);

    fs.writeFileSync(
      OUTPUT,
      JSON.stringify(report, null, 2) + '\n',
      {flag: 'wx'}
    );

    console.log(
      'SIGNED_REPORT_HASH:',
      report.report_hash
    );

    console.log(
      'R7-AUTO-05A EVENT-DRIVEN FORMATION: PASS'
    );

  } finally {
    for (const child of children) {
      if (
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill('SIGTERM');
      }
    }

    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[2] === '--agent') {
  agentMain(process.argv[3], process.argv[4])
    .catch(error => {
      console.error('AGENT_FAILURE:', error.stack);
      process.exitCode = 1;
    });
} else {
  assert.equal(process.argv.length, 2);

  main().catch(error => {
    console.error(
      'R7-AUTO-05A EVENT-DRIVEN FORMATION: FAIL'
    );
    console.error(error.stack);
    process.exitCode = 1;
  });
}
