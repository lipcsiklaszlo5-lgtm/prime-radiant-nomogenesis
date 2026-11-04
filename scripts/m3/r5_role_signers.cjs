'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {fork} = require('node:child_process');
const near = require('near-api-js');
const {PublicKey} = require('@near-js/crypto');

const GAS = '200000000000000';
const BALANCE = 10n ** 25n;

async function createIsolatedSigners(root, sandbox) {
  const rootKey = await root.getKey();
  assert(rootKey, 'missing Sandbox administrator key');

  const adminKeys = new near.keyStores.InMemoryKeyStore();

  await adminKeys.setKey(
    'sandbox',
    root.accountId,
    rootKey
  );

  const connection = await near.connect({
    networkId: 'sandbox',
    nodeUrl: sandbox.config.rpcAddr,
    keyStore: adminKeys,
    deps: {keyStore: adminKeys}
  });

  const admin = await connection.account(root.accountId);

  const actors = new Map();
  const events = [];
  let sequence = 0;

  function request(child, message) {
    return new Promise((resolve, reject) => {
      const requestId = ++sequence;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('signer IPC timeout'));
      }, 120000);

      function cleanup() {
        clearTimeout(timeout);
        child.off('message', onMessage);
        child.off('exit', onExit);
      }

      function onMessage(reply) {
        if (reply.requestId !== requestId) return;

        cleanup();

        if (reply.ok) resolve(reply);
        else reject(new Error(reply.error));
      }

      function onExit(code) {
        cleanup();
        reject(new Error(`signer exited: ${code}`));
      }

      child.on('message', onMessage);
      child.once('exit', onExit);

      child.send({...message, requestId});
    });
  }

  async function create(name) {
    assert.match(name, /^[a-z0-9-]+$/);

    const accountId = `${name}.${root.accountId}`;
    assert(!actors.has(accountId));

    const child = fork(
      path.join(__dirname, 'r5_role_signer.cjs'),
      [accountId],
      {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}
    );

    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('signer startup timeout'));
      }, 30000);

      child.once('message', message => {
        clearTimeout(timer);
        resolve(message);
      });

      child.once('error', reject);
      child.once('exit', code => {
        reject(new Error(`signer startup exit: ${code}`));
      });
    });

    assert.equal(ready.kind, 'ready');
    assert.equal(ready.accountId, accountId);
    assert.equal(ready.pid, child.pid);
    assert.match(
      ready.publicKey,
      /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/
    );

    const actor = {
      accountId,
      pid: child.pid,
      publicKey: ready.publicKey,
      child
    };

    actors.set(accountId, actor);

    await admin.createAccount(
      accountId,
      PublicKey.fromString(actor.publicKey),
      BALANCE
    );

    assert.equal(
      await adminKeys.getKey('sandbox', accountId),
      null
    );

    assert.equal(
      await root.manager.getKey(accountId),
      null
    );

    await request(child, {
      kind: 'connect',
      rpcUrl: sandbox.config.rpcAddr
    });

    async function transact(
      contract,
      method,
      args = {},
      options = {},
      raw = false
    ) {
      const contractId = typeof contract === 'string'
        ? contract
        : contract.accountId;

      try {
        const reply = await request(child, {
          kind: 'call',
          contractId,
          method,
          args,
          gas: String(options.gas ?? GAS),
          deposit: String(options.attachedDeposit ?? '0')
        });

        assert.equal(reply.signer, accountId);
        assert.equal(reply.publicKey, actor.publicKey);

        assert.match(
          reply.txHash,
          /^[1-9A-HJ-NP-Za-km-z]{43,44}$/
        );

        if (
          method === 'submit_rescue_component' &&
          (name === 'quantities' || name === 'prices')
        ) {
          assert.equal(reply.verifiedData, true);
        }

        if (method === 'complete_rescue_job') {
          assert.equal(reply.verifiedWork, true);
        }

        events.push({
          accountId,
          method,
          txHash: reply.txHash,
          verifiedData: reply.verifiedData,
          verifiedWork: reply.verifiedWork
        });

        if (raw) {
          return {
            succeeded: true,
            result: {
              transaction: {hash: reply.txHash}
            }
          };
        }

        return reply.value;
      } catch (error) {
        // Negative contract tests must propagate failures.
        throw new Error(
          `${accountId}.${method}: ${error.message}`
        );
      }
    }

    actor.call = (contract, method, args, options) =>
      transact(contract, method, args, options, false);

    actor.callRaw = (contract, method, args, options) =>
      transact(contract, method, args, options, true);

    console.log(
      'ISOLATED ACTOR:',
      accountId,
      'PID=' + actor.pid
    );

    return actor;
  }

  function audit() {
    const required = new Map([
      ['creator', 'create_rescue_case'],
      ['keeper', 'settle_rescue_bundle'],
      ['quantities', 'submit_rescue_component'],
      ['prices', 'submit_rescue_component']
    ]);

    for (let i = 0; i < 3; i++) {
      required.set(`buyer${i}`, 'create_funded_rescue_job');
      required.set(`worker${i}`, 'complete_rescue_job');
    }

    for (const [name, method] of required) {
      const accountId = `${name}.${root.accountId}`;

      assert(
        events.some(event =>
          event.accountId === accountId &&
          event.method === method
        ),
        `missing signed role transaction: ${name}`
      );
    }

    const pids = [...actors.values()].map(a => a.pid);

    assert.equal(
      new Set(pids).size,
      actors.size,
      'signer processes are not distinct'
    );

    assert.equal(actors.size, 12);

    assert.equal(
      events.filter(e => e.verifiedData).length,
      2,
      'both providers must independently validate CSV'
    );

    assert.equal(
      events.filter(e => e.verifiedWork).length,
      3,
      'three workers must independently recompute'
    );

    assert(
      events.some(e => e.method === 'withdraw'),
      'missing signed native withdrawal'
    );

    console.log('DISTINCT SIGNER PROCESSES:', actors.size);
    console.log('SUCCESSFUL SIGNED ROLE CALLS:', events.length);
    console.log('PROVIDER LOCAL DATA CHECKS: 2/2 PASS');
    console.log('WORKER LOCAL RECOMPUTATIONS: 3/3 PASS');
    console.log('ROLE-LEVEL SIGNER AUDIT: PASS');
  }

  async function close() {
    for (const actor of actors.values()) {
      if (actor.child.exitCode === null) {
        actor.child.kill();
      }
    }
  }

  return {create, audit, close};
}

module.exports = {createIsolatedSigners};
