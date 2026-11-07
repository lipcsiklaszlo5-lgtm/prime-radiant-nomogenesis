'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fork} = require('node:child_process');

const near = require('near-api-js');
const {PublicKey} = require('@near-js/crypto');
const {Worker} = require('near-workspaces');

const {
  componentFromCsv,
  minimumCommitment
} = require('../scripts/m3/r5_data_envelope.cjs');

const WASM = process.env.NOMOGENESIS_V2_WASM;
const UNIT = 10n ** 21n;
const SECOND = 1000000000n;

const AGENT = path.join(
  __dirname,
  '../examples/external_recovery_buyer.cjs'
);

let sequence = 0;

function request(child, input, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const requestId = ++sequence;

    const timer = setTimeout(
      () => finish(Error('external agent IPC timeout')),
      timeoutMs
    );

    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function finish(error, reply) {
      cleanup();
      if (error) reject(error);
      else resolve(reply);
    }

    function onMessage(reply) {
      if (reply.requestId === requestId) {
        finish(null, reply);
      }
    }

    function onExit(code, signal) {
      finish(Error(
        `external agent exited ${code}/${signal}`
      ));
    }

    function onError(error) {
      finish(error);
    }

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onError);
    child.send({...input, requestId});
  });
}

async function startedTimestamp(worker) {
  const response = await fetch(
    worker.config.rpcAddr,
    {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'block',
        params: {finality: 'optimistic'}
      })
    }
  );

  assert(response.ok, 'Sandbox RPC inaccessible');

  const result = await response.json();
  assert(!result.error, 'Sandbox block request failed');

  return BigInt(
    result.result.header.timestamp_nanosec ??
    result.result.header.timestamp
  );
}

async function main() {
  assert(WASM && fs.statSync(WASM).size > 0);

  let worker;
  let agent;

  try {
    worker = await Worker.init();

    const root = worker.rootAccount;
    const contract = await root.devDeploy(WASM);

    const creator =
      await root.createSubAccount('creator');

    const source =
      await root.createSubAccount('source');

    const designatedWorker =
      await root.createSubAccount('worker0');

    const accountId = `sdkbuyer.${root.accountId}`;

    assert.equal(
      accountId,
      'sdkbuyer.test.near'
    );

    const timestamp = await startedTimestamp(worker);
    const started = timestamp / SECOND * SECOND;

    const dependency = started + 180n * SECOND;
    const bidClose = started + 240n * SECOND;
    const awardClose = started + 600n * SECOND;
    const recovery = started + 900n * SECOND;
    const finalDeadline = started + 1200n * SECOND;

    assert.equal(
      BigInt(Number(finalDeadline)),
      finalDeadline,
      'deadline loses numeric precision'
    );

    const data = [
      'quantities.csv',
      'prices.csv'
    ].map((file, index) =>
      componentFromCsv(
        path.join(
          __dirname,
          '../demo/data',
          file
        ),
        index
      )
    );

    const quote = await contract.view(
      'm3_storage_quote'
    );

    const caseBond = BigInt(
      quote.case_storage_cost
    );

    const jobBond = BigInt(
      quote.job_storage_cost
    );

    const caseId = await creator.call(
      contract,
      'create_rescue_case',
      {
        descriptor: {
          descriptor_version: 1,
          original_provider: source.accountId,
          component_commitments:
            data.map(item => Array.from(item.root)),
          dependency_deadline: Number(dependency),
          bid_close: Number(bidClose),
          award_close: Number(awardClose),
          recovery_deadline: Number(recovery)
        }
      },
      {
        attachedDeposit: caseBond.toString()
      }
    );

    assert.equal(caseId.length, 32);

    console.log('RESCUE_CASE_CREATED: PASS');

    agent = fork(
      AGENT,
      [accountId],
      {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
      }
    );

    const ready = await new Promise(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('agent ready timeout')),
          20000
        );

        agent.once('message', message => {
          clearTimeout(timer);
          resolve(message);
        });

        agent.once('error', reject);
      }
    );

    assert.equal(ready.kind, 'ready');
    assert.equal(ready.accountId, accountId);
    assert.equal(ready.pid, agent.pid);
    assert.notEqual(ready.pid, process.pid);

    // Fund the Sandbox test account with its public key.
    // The parent never receives the private key.
    const rootKey = await root.getKey();
    assert(rootKey);

    const keys =
      new near.keyStores.InMemoryKeyStore();

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

    const admin = await connection.account(
      root.accountId
    );

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

    const connected = await request(agent, {
      kind: 'connect',
      rpcUrl: worker.config.rpcAddr
    });

    assert.equal(connected.ok, true);

    console.log(
      'EXTERNAL_AGENT_SIGNER_ISOLATED: PASS'
    );

    const intent = {
      caseId,
      worker: designatedWorker.accountId,
      workerRewardYocto: UNIT.toString(),
      rescueCapYocto: (7n * UNIT).toString(),
      threshold: '500',
      finalDeadlineNs: finalDeadline.toString()
    };

    echoGuard: {
      const tooHigh = await request(agent, {
        kind: 'fund',
        contractId: contract.accountId,
        intent: {
          ...intent,
          rescueCapYocto: (8n * UNIT).toString()
        }
      });

      assert.equal(tooHigh.ok, false);
      assert.match(
        tooHigh.reason,
        /refuses rescue cap/
      );

      assert.equal(tooHigh.signedCalls, 0);

      const totals = await contract.view(
        'm3_totals'
      );

      assert.equal(
        totals.next_rescue_job_id,
        0
      );
    }

    console.log(
      'EXTERNAL_AGENT_CAP_REFUSAL: PASS'
    );

    const badInput = await request(agent, {
      kind: 'fund',
      contractId: contract.accountId,
      intent: {
        ...intent,
        threshold: '0500'
      }
    });

    assert.equal(badInput.ok, false);
    assert.match(
      badInput.reason,
      /noncanonical/
    );
    assert.equal(badInput.signedCalls, 0);

    console.log(
      'EXTERNAL_AGENT_BAD_INPUT_REFUSAL: PASS'
    );

    const funded = await request(
      agent,
      {
        kind: 'fund',
        contractId: contract.accountId,
        intent
      },
      120000
    );

    assert.equal(
      funded.ok,
      true,
      funded.reason
    );
    assert.equal(funded.jobId, 0);
    assert.equal(funded.signer, accountId);
    assert.equal(funded.signedCalls, 1);

    assert.match(
      funded.txHash,
      /^[1-9A-HJ-NP-Za-km-z]{32,64}$/
    );

    assert.equal(
      BigInt(funded.attachedDeposit),
      8n * UNIT + jobBond
    );

    const job = await contract.view(
      'get_rescue_job',
      {job_id: 0}
    );

    assert.equal(job.buyer, accountId);
    assert.equal(
      job.worker,
      designatedWorker.accountId
    );
    assert.equal(job.phase, 'Funded');

    assert.deepEqual(
      job.result_commitment,
      Array.from(
        minimumCommitment(caseId, 500n)
      )
    );

    const mandate = await contract.view(
      'get_rescue_mandate',
      {job_id: 0}
    );

    assert.equal(mandate.phase, 'Open');

    assert.equal(
      BigInt(mandate.held_principal),
      7n * UNIT
    );

    const totals = await contract.view(
      'm3_totals'
    );

    assert.equal(
      BigInt(totals.rescue_escrow),
      8n * UNIT
    );

    assert.equal(
      BigInt(totals.storage_reserves),
      caseBond + jobBond
    );

    console.log(
      'EXTERNAL_AGENT_ONCHAIN_FUNDING: PASS'
    );

    console.log(
      'EXTERNAL_AGENT_TX_HASH:',
      funded.txHash
    );

    await designatedWorker.call(
      contract,
      'accept_rescue_job',
      {job_id: 0}
    );

    const accepted = await contract.view(
      'get_rescue_job',
      {job_id: 0}
    );

    assert.equal(accepted.phase, 'Accepted');

    console.log(
      'EXTERNAL_AGENT_JOB_ACCEPTED: PASS'
    );

    console.log(
      'R7-SDK-02 INDEPENDENT SANDBOX CONSUMER: PASS'
    );

    console.log(
      'LIMIT: parent funds agent account; child holds private key'
    );
    console.log(
      'LIMIT: local Sandbox only; not public Testnet'
    );

  } finally {
    if (
      agent &&
      agent.exitCode === null &&
      agent.signalCode === null
    ) {
      agent.kill('SIGTERM');
    }

    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error(
    'R7-SDK-02 INDEPENDENT SANDBOX CONSUMER: FAIL'
  );
  console.error(error.stack || error);
  process.exitCode = 1;
});
