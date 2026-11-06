'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const {
  DOMAIN,
  bytes,
  validatePolicy,
  decision,
  sessionValid
} = require('./r7_06_protocol.cjs');

function main() {
  assert.equal(
    process.argv.length, 4,
    'one agent policy and one session required'
  );

  const p = validatePolicy(
    JSON.parse(
      fs.readFileSync(process.argv[2], 'utf8')
    )
  );

  const session = JSON.parse(process.argv[3]);
  sessionValid(session);

  const now = Date.now();

  assert(
    now >= session.created_at &&
    now < session.expires_at,
    'session no longer live'
  );

  const {actor_id, role, ...declaration} = p;

  const event = {
    domain: DOMAIN,
    session_id: session.id,
    actor_id,
    role,
    nonce: crypto.randomBytes(16).toString('hex'),
    issued_at: now,
    expires_at: session.expires_at,
    declaration,
    verdict: decision(p)
  };

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

  process.stdout.write(
    JSON.stringify(packet) + '\n'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      'AGENT_REJECTED:', error.message
    );

    process.exitCode = 1;
  }
}
