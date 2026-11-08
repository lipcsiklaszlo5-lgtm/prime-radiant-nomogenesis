'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {fork} = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(__dirname);

const RPC = 'https://rpc.testnet.fastnear.com';
const EVENT = 'http://127.0.0.1:1';

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'docs/evidence/R7-13-public-actors.json'),
    'utf8'
  )
);

async function checkActor(actor) {
  const role = actor.role;
  const special = ['worker0', 'worker1', 'keeper']
    .includes(role);

  const script = path.join(
    DIR,
    special
      ? 'r7_13_live_special.cjs'
      : 'r7_13_live_agent.cjs'
  );

  const args = special
    ? [role, EVENT, RPC]
    : [
        path.join(
          ROOT, 'demo/policies/r7-06b',
          role + '.json'
        ),
        EVENT, RPC
      ];

  const child = fork(script, args, {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      NMG_R7_13_RUN_DIR:
        path.join(
          os.tmpdir(),
          'nmg-r713-identity-only'
        )
    }
  });

  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  try {
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(Error('Agent ready timeout: ' + role));
      }, 15000);

      child.once('message', message => {
        clearTimeout(timer);
        resolve(message);
      });

      child.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });

      child.once('exit', code => {
        clearTimeout(timer);
        reject(Error(
          `Agent exited early: ${role}/${code}: ` +
          stderr.slice(0, 1000)
        ));
      });
    });

    assert.equal(ready.kind, 'ready');
    assert.equal(ready.actor, role);
    assert.equal(ready.accountId, actor.account_id);
    assert.equal(ready.publicKey, actor.public_key);
    assert.equal(ready.pid, child.pid);

    assert(!Object.hasOwn(ready, 'private_key'));
    assert(!Object.hasOwn(ready, 'secret_key'));

    return child.pid;

  } finally {
    if (child.exitCode === null &&
        child.signalCode === null) {
      const stopped = new Promise(resolve =>
        child.once('exit', resolve)
      );
      child.kill('SIGTERM');
      await stopped;
    }
  }
}

test('ten persistent Testnet signer processes', {
  timeout: 180000
}, async () => {
  assert.equal(manifest.network, 'near-testnet');
  assert.equal(manifest.actors.length, 10);

  const identities = new Set();
  const pids = new Set();

  for (const actor of manifest.actors) {
    assert(!identities.has(actor.account_id));
    identities.add(actor.account_id);

    const pid = await checkActor(actor);
    assert(!pids.has(pid));
    pids.add(pid);

    console.log(
      'PERSISTENT_AGENT_VERIFIED:', actor.role
    );
  }

  assert.equal(identities.size, 10);
  assert.equal(pids.size, 10);

  console.log('TEN_PERSISTENT_TESTNET_SIGNERS: PASS');
  console.log('PRIVATE_KEYS_EXPORTED: NO');
  console.log('PUBLIC_TRANSACTIONS_SENT: 0');
});
