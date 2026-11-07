'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const near = require('near-api-js');

const {
  RecoveryIntent
} = require('../../sdk/recovery_intent.cjs');

const {
  validatePolicy,
  decision
} = require('./r7_06_protocol.cjs');

const UNIT = 10n ** 21n;
const GAS = 200000000000000n;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const policy = validatePolicy(
  JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
);

const url = process.argv[3];
const rpcUrl = process.argv[4];

assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(rpcUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
assert(process.send);

const accountId =
  `${policy.actor_id}.test.near`;

const keyPair =
  near.KeyPair.fromRandom('ed25519');

const publicKey =
  keyPair.getPublicKey().toString();

async function view(account, contractId, method, args = {}) {
  return account.viewFunction({
    contractId,
    methodName: method,
    args
  });
}

async function signedCall(
  account, contractId, method, args, attachedDeposit
) {
  const result = await account.functionCall({
    contractId,
    methodName: method,
    args,
    gas: GAS,
    attachedDeposit
  });

  assert.equal(
    result.transaction.signer_id,
    accountId
  );

  assert.equal(
    result.transaction.public_key,
    publicKey
  );

  assert(
    Object.hasOwn(result.status, 'SuccessValue'),
    'transaction did not succeed'
  );

  const raw = Buffer.from(
    result.status.SuccessValue,
    'base64'
  ).toString('utf8');

  return {
    id: raw ? JSON.parse(raw) : null,
    txHash: result.transaction.hash
  };
}

async function main() {
  process.send({
    kind: 'ready',
    actor: policy.actor_id,
    accountId,
    publicKey,
    pid: process.pid
  });

  const connected = await new Promise(resolve =>
    process.once('message', resolve)
  );

  assert.equal(connected.kind, 'connect');

  const store =
    new near.keyStores.InMemoryKeyStore();

  await store.setKey(
    'sandbox',
    accountId,
    keyPair
  );

  const connection = await near.connect({
    networkId: 'sandbox',
    nodeUrl: rpcUrl,
    keyStore: store,
    deps: {keyStore: store}
  });

  const account =
    await connection.account(accountId);

  process.send({
    kind: 'connected',
    actor: policy.actor_id
  });

  let event;

  for (let attempt = 0; attempt < 400; attempt++) {
    const response = await fetch(url + '/state', {
      signal: AbortSignal.timeout(5000)
    });

    assert.equal(response.status, 200);

    const state = await response.json();

    if (state.outage) {
      event = state;
      break;
    }

    await sleep(75);
  }

  assert(event, 'outage event not observed');

  const {
    caseId,
    contractId,
    finalDeadlineNs
  } = event;

  assert.equal(caseId.length, 32);

  const rescueCase = await view(
    account,
    contractId,
    'get_rescue_case',
    {case_id: caseId}
  );

  assert(rescueCase, 'unknown rescue case');
  assert.equal(rescueCase.phase, 'Open');

  const verdict = decision(policy);

  // The provider's declared readiness is part of
  // its local policy, not assigned by the controller.
  const willing = verdict.willing && (
    policy.role === 'buyer' ||
    policy.ready_at <= 2
  );

  if (!willing) {
    console.log(
      'AUTONOMOUS_POLICY_REFUSAL:',
      policy.actor_id
    );
    return;
  }

  if (policy.role === 'buyer') {
    const cap = Math.min(
      policy.cap,
      policy.value - policy.outside_option
    );

    assert(cap > 0 && cap <= 7);

    const worker =
      `worker${policy.job_id - 1}.test.near`;

    const threshold = (
      400 + 100 * policy.job_id
    ).toString();

    const intent = new RecoveryIntent({
      caseId,
      worker,
      workerRewardYocto: UNIT.toString(),
      rescueCapYocto: (
        BigInt(cap) * UNIT
      ).toString(),
      threshold,
      finalDeadlineNs
    });

    const adapter = {
      accountId: contractId,
      view: (method, args = {}) =>
        view(account, contractId, method, args)
    };

    const signer = {
      async call(target, method, args, options) {
        const outcome = await signedCall(
          account,
          target.accountId,
          method,
          args,
          BigInt(options.attachedDeposit)
        );

        return {
          jobId: outcome.id,
          txHash: outcome.txHash
        };
      }
    };

    const funded = await intent.fund({
      buyer: signer,
      contract: adapter
    });

    assert(Number.isInteger(funded.jobId));

    console.log(
      'AUTONOMOUS_BUYER_FUNDED:',
      policy.actor_id,
      'JOB=' + funded.jobId,
      'TX=' + funded.txHash
    );

    return;
  }

  assert.equal(policy.role, 'provider');

  const quote = await view(
    account,
    contractId,
    'm3_storage_quote'
  );

  const bond =
    BigInt(policy.bond) * UNIT;

  const fee =
    BigInt(policy.fee) * UNIT;

  assert(fee > 0n);
  assert(bond >= fee);
  assert(policy.fee >= policy.cost_floor);

  const result = await signedCall(
    account,
    contractId,
    'post_rescue_offer',
    {
      input: {
        case_id: caseId,
        component_index: policy.component,
        slot_id: policy.slot,
        fee: fee.toString(),
        bond_capacity: bond.toString()
      }
    },
    bond + BigInt(quote.offer_storage_cost)
  );

  assert(Number.isInteger(result.id));

  console.log(
    'AUTONOMOUS_PROVIDER_OFFER:',
    policy.actor_id,
    'OFFER=' + result.id,
    'TX=' + result.txHash
  );
}

main().catch(error => {
  console.error(
    'AUTONOMOUS_AGENT_FAILED:',
    policy.actor_id,
    error.stack || error
  );
  process.exitCode = 1;
});
