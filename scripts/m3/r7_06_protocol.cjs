'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const DOMAIN = 'NOMOGENESIS/R7-06B/DECISION/V1';
const MAX = 1000000000;

const BUYER = [
  'actor_id', 'role', 'job_id',
  'cap', 'value', 'outside_option', 'active'
];

const SELLER = [
  'actor_id', 'role', 'offer_id',
  'component', 'provider', 'slot',
  'fee', 'bond', 'ready_at',
  'available', 'cost_floor'
];

function exact(x, keys) {
  assert(
    x && typeof x === 'object' && !Array.isArray(x),
    'not an object'
  );

  assert.deepEqual(
    Object.keys(x).sort(),
    [...keys].sort(),
    'unexpected fields'
  );
}

function integer(n, max = MAX) {
  assert(
    Number.isSafeInteger(n) &&
    n >= 0 && n <= max,
    'unsafe integer'
  );

  return n;
}

function identifier(s) {
  assert(
    typeof s === 'string' &&
    /^[a-z][a-z0-9-]{1,47}$/.test(s),
    'invalid identifier'
  );

  return s;
}

function validatePolicy(p) {
  assert(
    p && (p.role === 'buyer' || p.role === 'provider'),
    'bad role'
  );

  exact(
    p,
    p.role === 'buyer' ? BUYER : SELLER
  );

  identifier(p.actor_id);

  if (p.role === 'buyer') {
    integer(p.job_id);
    assert(p.job_id > 0);

    for (const k of [
      'cap', 'value', 'outside_option'
    ]) {
      integer(p[k]);
    }

    assert.equal(typeof p.active, 'boolean');
  } else {
    integer(p.offer_id);
    assert(p.offer_id > 0);
    integer(p.component, 1);

    identifier(p.provider);
    identifier(p.slot);

    assert.equal(
      p.provider, p.actor_id,
      'supplier identity must match actor'
    );

    for (const k of [
      'fee', 'bond', 'ready_at', 'cost_floor'
    ]) {
      integer(p[k]);
    }

    assert(p.fee > 0);
    assert.equal(typeof p.available, 'boolean');
  }

  return p;
}

function decision(p) {
  validatePolicy(p);

  const willing = p.role === 'buyer'
    ? p.active &&
      p.cap > 0 &&
      p.value > p.outside_option
    : p.available &&
      p.fee >= p.cost_floor;

  return {
    willing,
    reason: willing ? 'accept' : 'reject_policy'
  };
}

function canonical(x) {
  if (x === null || typeof x !== 'object') {
    return JSON.stringify(x);
  }

  if (Array.isArray(x)) {
    return '[' + x.map(canonical).join(',') + ']';
  }

  return '{' +
    Object.keys(x).sort().map(k =>
      JSON.stringify(k) + ':' + canonical(x[k])
    ).join(',') + '}';
}

function bytes(event) {
  return Buffer.from(
    DOMAIN + '\0' + canonical(event),
    'utf8'
  );
}

function digest(x) {
  return crypto.createHash('sha256')
    .update(canonical(x))
    .digest('hex');
}

function decoded(str, maxBytes) {
  assert(
    typeof str === 'string' &&
    str.length <= maxBytes * 2,
    'invalid base64'
  );

  const raw = Buffer.from(str, 'base64');

  assert(
    raw.length > 0 &&
    raw.length <= maxBytes &&
    raw.toString('base64') === str,
    'noncanonical base64'
  );

  return raw;
}

function sessionValid(s) {
  exact(
    s,
    ['id', 'created_at', 'expires_at', 'market_deadline']
  );

  assert(
    /^r7-06b-[0-9a-f]{32}$/.test(s.id),
    'session identifier'
  );

  integer(s.created_at, Number.MAX_SAFE_INTEGER);
  integer(s.expires_at, Number.MAX_SAFE_INTEGER);
  integer(s.market_deadline);

  assert(
    s.expires_at > s.created_at &&
    s.expires_at - s.created_at <= 120000,
    'invalid session lifetime'
  );
}

function newLedger() {
  return {
    nonces: new Set(),
    actors: new Set(),
    keys: new Set()
  };
}

function verifyPacket(packet, session, now, used) {
  exact(
    packet,
    ['event', 'public_key', 'signature']
  );

  sessionValid(session);

  const e = packet.event;

  exact(e, [
    'domain', 'session_id', 'actor_id',
    'role', 'nonce', 'issued_at',
    'expires_at', 'declaration', 'verdict'
  ]);

  assert.equal(e.domain, DOMAIN);
  assert.equal(e.session_id, session.id);

  assert(
    /^[0-9a-f]{32}$/.test(e.nonce),
    'invalid nonce'
  );

  assert.equal(e.expires_at, session.expires_at);

  integer(e.issued_at, Number.MAX_SAFE_INTEGER);
  integer(now, Number.MAX_SAFE_INTEGER);

  assert(
    e.issued_at >= session.created_at &&
    e.issued_at <= now &&
    now < e.expires_at,
    'expired or future decision'
  );

  assert(
    e.declaration &&
    typeof e.declaration === 'object' &&
    !Array.isArray(e.declaration),
    'invalid declaration'
  );

  assert(
    !Object.hasOwn(e.declaration, 'actor_id') &&
    !Object.hasOwn(e.declaration, 'role'),
    'identity shadowing'
  );

  const p = {
    actor_id: e.actor_id,
    role: e.role,
    ...e.declaration
  };

  validatePolicy(p);

  assert.deepEqual(
    e.verdict, decision(p),
    'forged economic decision'
  );

  const publicKey = crypto.createPublicKey({
    key: decoded(packet.public_key, 128),
    format: 'der',
    type: 'spki'
  });

  assert.equal(
    publicKey.asymmetricKeyType,
    'ed25519'
  );

  assert(
    crypto.verify(
      null,
      bytes(e),
      publicKey,
      decoded(packet.signature, 128)
    ),
    'invalid signature'
  );

  const nonceKey =
    e.session_id + ':' + e.actor_id + ':' + e.nonce;

  assert(
    !used.nonces.has(nonceKey),
    'nonce replay'
  );

  assert(
    !used.actors.has(e.actor_id),
    'duplicate actor'
  );

  const fingerprint = digest(packet.public_key);

  assert(
    !used.keys.has(fingerprint),
    'shared signing key'
  );

  used.nonces.add(nonceKey);
  used.actors.add(e.actor_id);
  used.keys.add(fingerprint);

  return p;
}

module.exports = {
  DOMAIN,
  canonical,
  digest,
  bytes,
  validatePolicy,
  decision,
  verifyPacket,
  newLedger,
  sessionValid
};
