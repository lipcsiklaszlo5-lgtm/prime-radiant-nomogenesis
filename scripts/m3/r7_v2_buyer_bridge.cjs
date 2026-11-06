'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const {fork} = require('node:child_process');

const near = require('near-api-js');
const {PublicKey} = require('@near-js/crypto');

let sequence = 0;

function request(child, input) {
  return new Promise((resolve, reject) => {
    const requestId = ++sequence;

    const timeout = setTimeout(() => {
      cleanup();
      reject(Error('isolated agent IPC timeout'));
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
      else reject(Error(reply.error));
    }

    function onExit(code) {
      cleanup();
      reject(Error(`buyer agent exited: ${code}`));
    }

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.send({...input, requestId});
  });
}

function verifyDecision(reply, expectedKey) {
  assert.equal(reply.publicKey, expectedKey);

  const key = PublicKey.fromString(expectedKey);

  const raw = Buffer.from(key.data);
  assert.equal(raw.length, 32);

  const der = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    raw
  ]);

  const verifier = crypto.createPublicKey({
    key: der,
    format: 'der',
    type: 'spki'
  });

  const valid = crypto.verify(
    null,
    Buffer.from(JSON.stringify(reply.decision), 'utf8'),
    verifier,
    Buffer.from(reply.signature, 'base64')
  );

  assert(valid, 'buyer decision signature mismatch');

  return reply.decision;
}

async function createIsolatedBuyerAgent(
  root, worker, index, children
) {
  assert(Number.isInteger(index) && index >= 0 && index < 3);

  const accountId = `buyer${index}.${root.accountId}`;

  assert.match(
    accountId,
    /^buyer[0-2]\.test\.near$/
  );

  const child = fork(
    path.join(__dirname, 'r7_v2_buyer_agent.cjs'),
    [accountId],
    {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}
  );

  children.push(child);

  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error('buyer startup timeout')),
      30000
    );

    child.once('message', message => {
      clearTimeout(timeout);
      resolve(message);
    });

    child.once('error', reject);
  });

  assert.equal(ready.kind, 'ready');
  assert.equal(ready.accountId, accountId);
  assert.equal(ready.pid, child.pid);

  const rootKey = await root.getKey();
  assert(rootKey);

  const keys = new near.keyStores.InMemoryKeyStore();

  await keys.setKey(
    'sandbox',
    root.accountId,
    rootKey
  );

  const connection = await near.connect({
    networkId: 'sandbox',
    nodeUrl: worker.config.rpcAddr,
    keyStore: keys,
    deps: {keyStore: keys}
  });

  const admin = await connection.account(root.accountId);

  await admin.createAccount(
    accountId,
    PublicKey.fromString(ready.publicKey),
    10n ** 25n
  );

  assert.equal(
    await keys.getKey('sandbox', accountId),
    null
  );

  assert.equal(
    await root.manager.getKey(accountId),
    null
  );

  await request(child, {
    kind: 'connect',
    rpcUrl: worker.config.rpcAddr
  });

  const agent = {
    accountId,
    pid: child.pid,
    publicKey: ready.publicKey,

    async evaluatePayment(payment) {
      const reply = await request(child, {
        kind: 'assess',
        jobId: index,
        exactPayment: payment.toString()
      });

      const decision = verifyDecision(
        reply,
        ready.publicKey
      );

      assert.equal(
        decision.account_id,
        accountId
      );
      assert.equal(decision.job_id, index);
      assert.equal(
        decision.exact_payment,
        payment.toString()
      );

      return decision;
    },

    async call(contract, method, args = {}, options = {}) {
      const contractId = typeof contract === 'string'
        ? contract
        : contract.accountId;

      const reply = await request(child, {
        kind: 'call',
        contractId,
        method,
        args,
        gas: String(options.gas ?? '200000000000000'),
        deposit: String(options.attachedDeposit ?? '0')
      });

      assert.equal(reply.signer, accountId);
      assert.equal(reply.publicKey, ready.publicKey);

      if (method === 'register_r7_v2_consent') {
        assert(reply.consentProof);

        const decision = verifyDecision(
          reply.consentProof,
          ready.publicKey
        );

        assert.equal(decision.approved, true);
        assert.equal(decision.account_id, accountId);
      }

      return reply.value;
    }
  };

  console.log(
    'ISOLATED V2 BUYER AGENT:',
    accountId,
    'PID=' + agent.pid
  );

  return agent;
}

module.exports = {createIsolatedBuyerAgent};
