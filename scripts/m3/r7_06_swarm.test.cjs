'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  DOMAIN,
  bytes,
  verifyPacket,
  newLedger,
  validatePolicy
} = require('./r7_06_protocol.cjs');

const {
  createReport,
  verifyReport
} = require('./r7_06_swarm.cjs');

const ROOT = path.resolve(__dirname, '../..');

function readPolicy(name) {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        'demo/policies/r7-06b',
        name + '.json'
      ),
      'utf8'
    )
  );
}

const buyer = readPolicy('buyer-1');
const provider = readPolicy('provider-delta');

const session = {
  id: 'r7-06b-' + 'a'.repeat(32),
  created_at: 1700000000000,
  expires_at: 1700000060000,
  market_deadline: 2
};

const now = session.created_at + 2000;

function packet(policy = buyer, changes = {}) {
  const {
    actor_id,
    role,
    ...declaration
  } = policy;

  const keys = crypto.generateKeyPairSync('ed25519');

  const willing = role === 'buyer'
    ? policy.active &&
      policy.cap > 0 &&
      policy.value > policy.outside_option
    : policy.available &&
      policy.fee >= policy.cost_floor;

  const event = {
    domain: DOMAIN,
    session_id: session.id,
    actor_id,
    role,
    nonce: 'b'.repeat(32),
    issued_at: session.created_at + 1000,
    expires_at: session.expires_at,
    declaration,
    verdict: {
      willing,
      reason: willing ? 'accept' : 'reject_policy'
    }
  };

  Object.assign(event, changes);

  return {
    event,
    public_key: keys.publicKey.export({
      format: 'der',
      type: 'spki'
    }).toString('base64'),

    signature: crypto.sign(
      null,
      bytes(event),
      keys.privateKey
    ).toString('base64')
  };
}

function modify(value, fn) {
  const cloned = structuredClone(value);
  fn(cloned);
  return cloned;
}

test('buyer signature verifies', () => {
  const result = verifyPacket(
    packet(), session, now, newLedger()
  );

  assert.equal(result.job_id, 1);
});

test('supplier independently refuses below floor', () => {
  const x = packet(provider);

  verifyPacket(
    x, session, now, newLedger()
  );

  assert.equal(
    x.event.verdict.willing,
    false
  );
});

test('tampered buyer cap rejected', () => {
  const x = modify(
    packet(),
    p => p.event.declaration.cap++
  );

  assert.throws(
    () => verifyPacket(x, session, now, newLedger())
  );
});

test('tampered decision verdict rejected', () => {
  const x = modify(
    packet(),
    p => p.event.verdict.willing = false
  );

  assert.throws(
    () => verifyPacket(x, session, now, newLedger())
  );
});

test('wrong session rejected', () => {
  const wrong = {
    ...session,
    id: 'r7-06b-' + 'c'.repeat(32)
  };

  assert.throws(
    () => verifyPacket(
      packet(), wrong, now, newLedger()
    )
  );
});

test('wrong domain rejected', () => {
  assert.throws(
    () => verifyPacket(
      packet(buyer, {domain: 'OTHER'}),
      session, now, newLedger()
    )
  );
});

test('expired session rejected', () => {
  assert.throws(
    () => verifyPacket(
      packet(),
      session,
      session.expires_at,
      newLedger()
    )
  );
});

test('future issued decision rejected', () => {
  assert.throws(
    () => verifyPacket(
      packet(buyer, {issued_at: now + 1}),
      session, now, newLedger()
    )
  );
});

test('replayed signed nonce rejected', () => {
  const used = newLedger();
  const x = packet();

  verifyPacket(x, session, now, used);

  assert.throws(
    () => verifyPacket(x, session, now, used)
  );
});

test('second actor decision rejected', () => {
  const used = newLedger();

  verifyPacket(
    packet(), session, now, used
  );

  assert.throws(
    () => verifyPacket(
      packet(buyer, {nonce: 'c'.repeat(32)}),
      session, now, used
    )
  );
});

test('cross-actor key substitution rejected', () => {
  const used = newLedger();
  const x = packet();

  verifyPacket(x, session, now, used);

  const y = modify(
    x,
    p => p.event.actor_id = 'buyer-2'
  );

  assert.throws(
    () => verifyPacket(
      y, session, now, used
    )
  );
});

test('identity shadowing rejected', () => {
  const x = packet(buyer, {
    declaration: {
      ...buyer,
      role: 'provider'
    }
  });

  assert.throws(
    () => verifyPacket(x, session, now, newLedger())
  );
});

test('unsafe money and supplier identity rejected', () => {
  assert.throws(
    () => validatePolicy({
      ...provider,
      provider: 'buyer-1'
    })
  );

  assert.throws(
    () => validatePolicy({
      ...buyer,
      cap: 2 ** 54
    })
  );

  assert.throws(
    () => validatePolicy({
      ...buyer,
      cap: 0.2
    })
  );
});

test('agent never exports its private key', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'r7_06_actor.cjs'),
    'utf8'
  );

  assert.match(
    source,
    /generateKeyPairSync\('ed25519'\)/
  );

  assert.doesNotMatch(
    source,
    /privateKey\.export\(/
  );
});

test('seven local signed agents form a viable market', () => {
  const report = createReport();
  const result = verifyReport(report);

  assert.deepEqual(
    result.selected.job_ids,
    [1, 2]
  );

  assert.deepEqual(
    result.selected.pair,
    [3, 2]
  );

  assert.deepEqual(
    result.selected.payments,
    [6, 5]
  );

  assert.equal(
    result.newly_fundable_under_declared_limits,
    true
  );

  assert.equal(
    new Set(
      report.packets.map(x => x.public_key)
    ).size,
    7
  );
});

test('forged market and economic results rejected', () => {
  const report = createReport();

  const x = modify(
    report,
    r => r.market.buyers[0].cap = 900
  );

  assert.throws(
    () => verifyReport(x)
  );

  const y = modify(
    report,
    r => r.formation.selected.price = 999
  );

  assert.throws(
    () => verifyReport(y)
  );

  const z = modify(
    report,
    r => r.report_hash = '0'.repeat(64)
  );

  assert.throws(
    () => verifyReport(z)
  );
});
