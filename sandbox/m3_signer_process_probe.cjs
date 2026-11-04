'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {fork} = require('node:child_process');
const {Worker} = require('near-workspaces');
const near = require('near-api-js');
const {PublicKey} = require('@near-js/crypto');

const {
  componentFromCsv
} = require('../scripts/m3/r5_data_envelope.cjs');

const WASM = process.env.NOMOGENESIS_WASM;
const SECOND = 1000000000n;
const GAS = '200000000000000';

const children = [];
let sequence = 0;

function request(child, input) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('signer IPC timeout'));
    }, 90000);

    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
    }

    function onMessage(message) {
      if (message.requestId !== id) return;
      cleanup();

      if (message.ok) resolve(message);
      else reject(new Error(message.error));
    }

    function onExit(code) {
      cleanup();
      reject(new Error(`signer exited: ${code}`));
    }

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.send({...input, requestId: id});
  });
}

function spawn(accountId) {
  return new Promise((resolve, reject) => {
    const child = fork(
      path.join(__dirname, '../scripts/m3/r5_isolated_signer.cjs'),
      [accountId],
      {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}
    );

    children.push(child);

    child.once('message', message => {
      try {
        assert.equal(message.kind, 'ready');
        assert.match(
          message.publicKey,
          /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/
        );

        assert.equal(message.pid, child.pid);

        resolve({
          child,
          accountId,
          publicKey: message.publicKey,
          pid: message.pid
        });
      } catch (error) {
        reject(error);
      }
    });

    child.once('error', reject);
  });
}

async function chainTimestamp(worker) {
  const url = worker.config.rpcAddr;

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'block',
      params: {finality: 'optimistic'}
    })
  });

  assert(response.ok);
  const json = await response.json();

  if (json.error) throw new Error(JSON.stringify(json.error));

  return BigInt(
    json.result.header.timestamp_nanosec ??
    json.result.header.timestamp
  );
}

async function main() {
  assert(WASM, 'WASM required');

  let sandbox;

  try {
    sandbox = await Worker.init();

    const root = sandbox.rootAccount;
    const contract = await root.devDeploy(WASM);

    // The coordinator holds only the Sandbox root key
    // to create accounts, NEVER actor private keys.
    const rootKey = await root.getKey();
    assert(rootKey, 'missing sandbox root key');

    const adminKeys = new near.keyStores.InMemoryKeyStore();

    await adminKeys.setKey(
      'sandbox',
      root.accountId,
      rootKey
    );

    const adminConnection = await near.connect({
      networkId: 'sandbox',
      nodeUrl: sandbox.config.rpcAddr,
      keyStore: adminKeys,
      deps: {keyStore: adminKeys}
    });

    const admin = await adminConnection.account(
      root.accountId
    );

    const quantities = componentFromCsv(
      path.join(__dirname, '../demo/data/quantities.csv'),
      0
    );

    const prices = componentFromCsv(
      path.join(__dirname, '../demo/data/prices.csv'),
      1
    );

    const roots = [quantities, prices].map(
      row => Array.from(row.root)
    );

    const quote = await contract.view(
      'm3_storage_quote', {}
    );

    const caseStorage = BigInt(
      quote.case_storage_cost
    );

    const now = await chainTimestamp(sandbox);

    const signers = [];

    for (let i = 0; i < 2; i++) {
      const actorId = `isolated${i}.test.near`;

      const actor = await spawn(actorId);

      console.log(
        'ISOLATED PROCESS:',
        actorId,
        'PID=' + actor.pid
      );

      // The admin receives ONLY the child's public key.
      await admin.createAccount(
        actorId,
        PublicKey.fromString(actor.publicKey),
        10n ** 25n
      );

      assert.equal(
        await adminKeys.getKey('sandbox', actorId),
        null,
        'admin obtained an actor private key'
      );

      assert.equal(
        await root.manager.getKey(actorId),
        null,
        'workspaces obtained an actor private key'
      );

      await request(actor.child, {
        kind: 'connect',
        rpcUrl: sandbox.config.rpcAddr
      });

      signers.push(actor);
    }

    assert.notEqual(
      signers[0].pid,
      signers[1].pid
    );

    assert.notEqual(
      signers[0].publicKey,
      signers[1].publicKey
    );

    console.log('KEY ISOLATION: PASS');

    for (let i = 0; i < 2; i++) {
      const actor = signers[i];

      const response = await request(actor.child, {
        kind: 'call',
        contractId: contract.accountId,
        method: 'create_rescue_case',
        args: {
          descriptor: {
            descriptor_version: 1,
            original_provider: 'source.test.near',
            component_commitments: roots,
            dependency_deadline:
              Number(now + 1200n * SECOND),
            bid_close:
              Number(now + 1500n * SECOND),
            award_close:
              Number(now + 3600n * SECOND),
            recovery_deadline:
              Number(now + (4800n + BigInt(i) * 100n) * SECOND)
          }
        },
        gas: GAS,
        deposit: caseStorage.toString()
      });

      assert.equal(response.signer, actor.accountId);
      assert.equal(response.publicKey, actor.publicKey);

      assert(
        Array.isArray(response.value) &&
        response.value.length === 32,
        'incorrect rescue case return value'
      );

      const caseView = await contract.view(
        'get_rescue_case',
        {case_id: response.value}
      );

      assert.equal(caseView.phase, 'Open');

      console.log(
        'SIGNED TRANSACTION:',
        actor.accountId,
        response.txHash
      );
    }

    console.log('TWO DISTINCT OS SIGNERS: PASS');
    console.log('PRIVATE KEYS NEVER EXPORTED: PASS');
    console.log('TWO ON-CHAIN CASE CREATIONS: PASS');
    console.log('=== M3-R5-03/01 RESULT: PASS ===');

  } finally {
    for (const child of children) {
      if (!child.killed) child.kill();
    }

    if (sandbox) await sandbox.tearDown();
  }
}

main().catch(error => {
  console.error('=== M3-R5-03/01 RESULT: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
