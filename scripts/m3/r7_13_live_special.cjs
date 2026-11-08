'use strict';

const {
  workerComplete,
  keeperSettle
} = require('./r7_13_live_completion.cjs');

const assert = require('node:assert/strict');
const near = require('near-api-js');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {callOnce} = require('./r7_13_tx_guard.cjs');

const name = process.argv[2];
const eventUrl = process.argv[3];
const rpcUrl = process.argv[4];

assert(
  ['worker0', 'worker1', 'keeper'].includes(name)
);

assert(process.send);


function readPersistentSigner(role) {
  const filename = path.join(
    os.homedir(),
    '.nomogenesis-r7-13',
    'actors',
    role + '.json'
  );

  const stat = fs.lstatSync(filename);

  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o077, 0);

  const item = JSON.parse(
    fs.readFileSync(filename, 'utf8')
  );

  assert.equal(item.network, 'testnet');
  assert.equal(item.role, role);
  assert.equal(
    item.account_id,
    `${role}.nmg-r713-8d99c17cced1.testnet`
  );

  return item;
}

assert(
  typeof process.env.NMG_R7_13_RUN_DIR === 'string'
);
assert.equal(
  rpcUrl, 'https://rpc.testnet.fastnear.com'
);
assert.match(
  eventUrl, /^http:\/\/127\.0\.0\.1:\d+$/
);

const credential = readPersistentSigner(name);
const accountId = credential.account_id;

const keyPair = near.KeyPair.fromString(
  credential.private_key
);

const publicKey = keyPair.getPublicKey().toString();
assert.equal(publicKey, credential.public_key);

const GAS = 200000000000000n;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function view(account, contractId, method, args = {}) {
  return account.viewFunction({
    contractId,
    methodName: method,
    args
  });
}

async function call(
  account, contractId, method, args
) {
  const result = await callOnce({
    dir: process.env.NMG_R7_13_RUN_DIR,
    role: name,
    step: method,
    account,
    contractId,
    method,
    args,
    deposit: 0n
  });

  return {
    id: result.value,
    txHash: result.tx
  };
}

async function timestamp() {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'block',
      params: {finality: 'optimistic'}
    })
  });

  assert(response.ok);

  const data = await response.json();
  assert(!data.error);

  return BigInt(
    data.result.header.timestamp_nanosec ??
    data.result.header.timestamp
  );
}

async function main() {
  process.send({
    kind: 'ready',
    actor: name,
    accountId,
    publicKey,
    pid: process.pid
  });

  const message = await new Promise(resolve =>
    process.once('message', resolve)
  );

  assert.equal(message.kind, 'connect');

  const store = new near.keyStores.InMemoryKeyStore();

  await store.setKey('testnet', accountId, keyPair);

  const connection = await near.connect({
    networkId: 'testnet',
    nodeUrl: rpcUrl,
    keyStore: store,
    deps: {keyStore: store}
  });

  const account = await connection.account(accountId);

  process.send({
    kind: 'connected',
    actor: name
  });

  for (let attempt = 0; attempt < 1400; attempt++) {
    const response = await fetch(
      eventUrl + '/state',
      {signal: AbortSignal.timeout(5000)}
    );

    assert(response.ok);

    const event = await response.json();

    if (!event.outage) {
      await sleep(900);
      continue;
    }

    const {contractId, caseId} = event;

    const rescueCase = await view(
      account,
      contractId,
      'get_rescue_case',
      {case_id: caseId}
    );

    if (!rescueCase) {
      await sleep(900);
      continue;
    }

    if (name !== 'keeper') {
      for (const jobId of rescueCase.job_ids) {
        const job = await view(
          account,
          contractId,
          'get_rescue_job',
          {job_id: jobId}
        );

        if (
          job.worker === accountId &&
          job.phase === 'Funded'
        ) {
          const signed = await call(
            account,
            contractId,
            'accept_rescue_job',
            {job_id: jobId}
          );

          console.log(
            'AUTONOMOUS_WORKER_ACCEPTED:',
            name,
            'JOB=' + jobId,
            'TX=' + signed.txHash
          );

          await workerComplete({
            account,
            contractId,
            caseId,
            jobId,
            accountId,
            view,
            call
          });

          return;
        }
      }

      await sleep(900);
      continue;
    }

    // Permissionless keeper: only on-chain state
    // determines whether award can proceed.
    if (rescueCase.phase !== 'Open') {
      throw Error('case closed before keeper award');
    }

    const now = await timestamp();

    if (
      now < BigInt(rescueCase.bid_close) ||
      rescueCase.job_ids.length < 2 ||
      rescueCase.offer_ids.length < 2
    ) {
      await sleep(900);
      continue;
    }

    assert(
      now < BigInt(rescueCase.award_close),
      'award window expired'
    );

    const jobs = await Promise.all(
      rescueCase.job_ids.map(jobId =>
        view(
          account,
          contractId,
          'get_rescue_job',
          {job_id: jobId}
        )
      )
    );

    const selected = jobs
      .filter(job => job.phase === 'Accepted')
      .map(job => Number(job.id))
      .sort((a, b) => a - b);

    if (selected.length < 2) {
      await sleep(900);
      continue;
    }

    const plan = await view(
      account,
      contractId,
      'preview_r7_v2_coalition',
      {
        case_id: caseId,
        selected_job_ids: selected
      }
    );

    const consents = await Promise.all(
      selected.map(jobId =>
        view(
          account,
          contractId,
          'get_r7_v2_consent',
          {job_id: jobId}
        )
      )
    );

    if (consents.some(consent => consent === null)) {
      await sleep(900);
      continue;
    }

    // Validate the exact canonical plan and
    // consent state before committing capital.
    await view(
      account,
      contractId,
      'preflight_r7_v2_award',
      {
        case_id: caseId,
        selected_job_ids: selected,
        expected_plan_hash: plan.plan_hash
      }
    );

    const signed = await call(
      account,
      contractId,
      'award_r7_v2_bundle',
      {
        case_id: caseId,
        selected_job_ids: selected,
        expected_plan_hash: plan.plan_hash
      }
    );

    console.log(
      'AUTONOMOUS_KEEPER_ATOMIC_AWARD:',
      'BUNDLE=' + signed.id,
      'PRICE=' + plan.total_price,
      'TX=' + signed.txHash
    );

    await keeperSettle({
      account,
      contractId,
      caseId,
      plan,
      bundleId: signed.id,
      view,
      call
    });

    return;
  }

  throw Error(name + ' agent timed out');
}

main().catch(error => {
  console.error(
    'SPECIAL_AGENT_FAILED:',
    name,
    error.stack || error
  );

  process.exitCode = 1;
});
