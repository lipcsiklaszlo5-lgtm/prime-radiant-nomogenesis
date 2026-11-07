'use strict';

const {
  workerComplete,
  keeperSettle
} = require('./r7_adv01a_completion.cjs');

const assert = require('node:assert/strict');
const near = require('near-api-js');

const name = process.argv[2];
const eventUrl = process.argv[3];
const rpcUrl = process.argv[4];

assert(
  ['worker0', 'worker1', 'keeper'].includes(name)
);

assert(process.send);

const accountId = `${name}.test.near`;
const keyPair = near.KeyPair.fromRandom('ed25519');
const publicKey = keyPair.getPublicKey().toString();
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

async function call(account, contractId, method, args) {
  const outcome = await account.functionCall({
    contractId,
    methodName: method,
    args,
    gas: GAS,
    attachedDeposit: 0n
  });

  assert.equal(
    outcome.transaction.signer_id,
    accountId
  );

  assert.equal(
    outcome.transaction.public_key,
    publicKey
  );

  assert(
    Object.hasOwn(outcome.status, 'SuccessValue'),
    'transaction failed'
  );

  const raw = Buffer.from(
    outcome.status.SuccessValue,
    'base64'
  ).toString('utf8');

  return {
    id: raw ? JSON.parse(raw) : null,
    txHash: outcome.transaction.hash
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

  await store.setKey('sandbox', accountId, keyPair);

  const connection = await near.connect({
    networkId: 'sandbox',
    nodeUrl: rpcUrl,
    keyStore: store,
    deps: {keyStore: store}
  });

  const account = await connection.account(accountId);

  process.send({
    kind: 'connected',
    actor: name
  });

  for (let attempt = 0; attempt < 600; attempt++) {
    const response = await fetch(
      eventUrl + '/state',
      {signal: AbortSignal.timeout(5000)}
    );

    assert(response.ok);

    const event = await response.json();

    if (!event.outage) {
      await sleep(100);
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
      await sleep(100);
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
            timestamp,
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

      await sleep(100);
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
      await sleep(100);
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
      await sleep(100);
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
      await sleep(100);
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
      timestamp,
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
