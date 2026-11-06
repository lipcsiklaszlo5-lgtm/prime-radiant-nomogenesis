'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const near = require('near-api-js');

const accountId = process.argv[2];
const match = /^buyer([0-2])\.test\.near$/.exec(accountId);
assert(match, 'unexpected buyer account');

const index = Number(match[1]);
const UNIT = 10n ** 21n;

const policy = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '../../demo/policies/r7-06b',
      `buyer-${index + 1}.json`
    ),
    'utf8'
  )
);

assert.equal(policy.role, 'buyer');
assert.equal(policy.job_id, index + 1);
assert.equal(policy.cap, 7);

const keyPair = near.KeyPair.fromRandom('ed25519');
const publicKey = keyPair.getPublicKey().toString();

let account = null;

function decide(payment) {
  const capacity = BigInt(policy.cap) * UNIT;

  const incrementalValue =
    BigInt(policy.value - policy.outside_option) * UNIT;

  return {
    approved:
      policy.active &&
      payment > 0n &&
      payment <= capacity &&
      payment <= incrementalValue,
    capacity,
    incrementalValue
  };
}

function signedDecision(jobId, payment) {
  const verdict = decide(payment);

  const decision = {
    domain: 'NOMOGENESIS/R7-08B/BUYER-AGENT/V1',
    account_id: accountId,
    job_id: jobId,
    exact_payment: payment.toString(),
    capacity: verdict.capacity.toString(),
    incremental_value: verdict.incrementalValue.toString(),
    approved: verdict.approved
  };

  const signature = Buffer.from(
    keyPair.sign(
      Buffer.from(JSON.stringify(decision), 'utf8')
    ).signature
  ).toString('base64');

  return {
    decision,
    publicKey,
    signature,
    pid: process.pid
  };
}

process.send({
  kind: 'ready',
  accountId,
  publicKey,
  pid: process.pid
});

process.on('message', async message => {
  const requestId = message.requestId;

  try {
    if (message.kind === 'connect') {
      assert.equal(account, null);
      assert.match(
        message.rpcUrl,
        /^http:\/\/127\.0\.0\.1:\d+$/
      );

      const keyStore =
        new near.keyStores.InMemoryKeyStore();

      await keyStore.setKey(
        'sandbox',
        accountId,
        keyPair
      );

      const connection = await near.connect({
        networkId: 'sandbox',
        nodeUrl: message.rpcUrl,
        keyStore,
        deps: {keyStore}
      });

      account = await connection.account(accountId);

      process.send({requestId, ok: true});
      return;
    }

    if (message.kind === 'assess') {
      assert.equal(message.jobId, index);

      const proof = signedDecision(
        index,
        BigInt(message.exactPayment)
      );

      console.log(
        'BUYER_AGENT_DECISION:',
        accountId,
        proof.decision.approved ? 'ACCEPT' : 'REJECT'
      );

      process.send({
        requestId,
        ok: true,
        ...proof
      });
      return;
    }

    assert.equal(message.kind, 'call');
    assert(account, 'agent not connected');

    const method = message.method;
    const deposit = BigInt(message.deposit);

    let consentProof = null;

    if (method === 'create_funded_rescue_job') {
      const input = message.args?.input;
      assert(input, 'missing funded job input');
      assert.equal(input.worker, `worker${index}.test.near`);
      assert.equal(BigInt(input.rescue_cap), BigInt(policy.cap) * UNIT);
      assert.equal(BigInt(input.worker_reward), UNIT);

      const quote = await account.viewFunction({
        contractId: message.contractId,
        methodName: 'm3_storage_quote',
        args: {}
      });

      assert.equal(
        deposit,
        BigInt(input.rescue_cap) +
          BigInt(input.worker_reward) +
          BigInt(quote.job_storage_cost),
        'funding outside buyer policy or storage quote'
      );

      console.log(
        'BUYER_AGENT_FUNDING_AUTHORIZED:',
        accountId
      );
    } else if (method === 'register_r7_v2_consent') {
      const input = message.args?.input;

      assert(input, 'missing consent input');
      assert.equal(input.buyer, accountId);
      assert.equal(Number(input.job_id), index);
      assert.equal(input.contract, message.contractId);
      assert.equal(
        input.domain,
        'NOMOGENESIS/R7-06E/SUBSET/V1'
      );

      assert(
        Array.isArray(input.plan_hash) &&
        input.plan_hash.length === 32,
        'invalid plan commitment'
      );

      const payment = BigInt(input.exact_payment);
      const maximum = BigInt(input.max_payment);

      const verdict = decide(payment);

      assert(
        verdict.approved,
        'buyer refuses uneconomic rescue payment'
      );

      assert(
        payment <= maximum &&
        maximum <= verdict.capacity,
        'funded authority exceeds local policy'
      );

      const job = await account.viewFunction({
        contractId: message.contractId,
        methodName: 'get_rescue_job',
        args: {job_id: index}
      });

      assert.equal(job.buyer, accountId);
      assert.equal(job.phase, 'Accepted');
      assert.deepEqual(input.case_id, job.case_id);

      const mandate = await account.viewFunction({
        contractId: message.contractId,
        methodName: 'get_rescue_mandate',
        args: {job_id: index}
      });

      assert.equal(mandate.phase, 'Open');
      assert(
        BigInt(mandate.held_principal) >= maximum,
        'insufficient funded principal'
      );

      const quote = await account.viewFunction({
        contractId: message.contractId,
        methodName: 'quote_r7_v2_consent_storage',
        args: {}
      });

      assert.equal(
        deposit,
        BigInt(quote),
        'incorrect consent storage deposit'
      );

      consentProof = signedDecision(index, payment);

      console.log(
        'BUYER_AGENT_ONCHAIN_CONSENT_APPROVED:',
        accountId,
        'PAYMENT=' + payment
      );
    } else {
      throw Error('method forbidden to buyer agent');
    }

    const outcome = await account.functionCall({
      contractId: message.contractId,
      methodName: method,
      args: message.args,
      gas: BigInt(message.gas),
      attachedDeposit: deposit
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
      outcome.status &&
      (
        Object.hasOwn(outcome.status, 'SuccessValue') ||
        Object.hasOwn(outcome.status, 'SuccessReceiptId')
      ),
      'on-chain transaction failed'
    );

    let value = null;

    if (Object.hasOwn(outcome.status, 'SuccessValue')) {
      const decoded = Buffer.from(
        outcome.status.SuccessValue,
        'base64'
      ).toString('utf8');

      if (decoded.length) value = JSON.parse(decoded);
    }

    if (consentProof) {
      console.log(
        'BUYER_AGENT_SIGNED_V2_CONSENT:',
        accountId,
        outcome.transaction.hash
      );
    }

    process.send({
      requestId,
      ok: true,
      signer: accountId,
      publicKey,
      txHash: outcome.transaction.hash,
      value,
      consentProof
    });
  } catch (error) {
    process.send({
      requestId,
      ok: false,
      error: String(error.message || error)
    });
  }
});
