'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const near = require('near-api-js');

const {
  componentFromCsv,
  load,
  makeWorkerResult
} = require('./r5_data_envelope.cjs');

const accountId = process.argv[2];
assert.match(accountId, /^[a-z0-9-]+\.test\.near$/);

const role = accountId.split('.')[0];

const policies = {
  creator: ['create_rescue_case'],
  source: [],
  keeper: ['award_rescue_bundle', 'settle_rescue_bundle'],
  outsider: ['submit_rescue_component'],
  quantities: ['post_rescue_offer', 'submit_rescue_component'],
  prices: ['post_rescue_offer', 'submit_rescue_component']
};

for (let i = 0; i < 3; i++) {
  policies[`buyer${i}`] = ['create_funded_rescue_job'];
  policies[`worker${i}`] = [
    'accept_rescue_job',
    'complete_rescue_job',
    'withdraw'
  ];
}

assert(policies[role], 'unknown signer role');

const keyPair = near.KeyPair.fromRandom('ed25519');
const publicKey = keyPair.getPublicKey().toString();

const dataDir = path.join(__dirname, '../../demo/data');
const quantitiesFile = path.join(dataDir, 'quantities.csv');
const pricesFile = path.join(dataDir, 'prices.csv');

let account = null;

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
      assert.equal(account, null, 'already connected');
      assert.match(
        message.rpcUrl,
        /^http:\/\/127\.0\.0\.1:\d+$/
      );

      const keyStore = new near.keyStores.InMemoryKeyStore();

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

    assert.equal(message.kind, 'call');
    assert(account, 'signer not connected');

    assert(
      policies[role].includes(message.method),
      'method forbidden for role'
    );

    let verifiedData = false;
    let verifiedWork = false;

    if (
      message.method === 'submit_rescue_component' &&
      (role === 'quantities' || role === 'prices')
    ) {
      const index = role === 'quantities' ? 0 : 1;
      const filename = index === 0
        ? quantitiesFile
        : pricesFile;

      const component = componentFromCsv(filename, index);

      assert.equal(message.args.component_index, index);

      assert.deepEqual(
        message.args.payload,
        Array.from(component.payload),
        'provider CSV payload mismatch'
      );

      assert.deepEqual(
        message.args.sibling,
        Array.from(component.sibling),
        'provider Merkle sibling mismatch'
      );

      verifiedData = true;
    }

    if (message.method === 'complete_rescue_job') {
      const jobId = message.args.job_id;

      // Worker independently reads authenticated job terms.
      const job = await account.viewFunction({
        contractId: message.contractId,
        methodName: 'get_rescue_job',
        args: {job_id: jobId}
      });

      const data = load(quantitiesFile, pricesFile);

      const result = makeWorkerResult(
        data,
        job.case_id,
        jobId,
        job.threshold
      );

      verifiedWork = Buffer.from(
        message.args.result_payload
      ).equals(result.payload);

      // Intentionally malformed transactions are still
      // sent for the existing negative contract tests.
    }

    const result = await account.functionCall({
      contractId: message.contractId,
      methodName: message.method,
      args: message.args,
      gas: BigInt(message.gas),
      attachedDeposit: BigInt(message.deposit)
    });

    assert.equal(
      result.transaction.signer_id,
      accountId
    );

    assert.equal(
      result.transaction.public_key,
      publicKey
    );

    const status = result.status;

    assert(
      status && (
        Object.hasOwn(status, 'SuccessValue') ||
        Object.hasOwn(status, 'SuccessReceiptId')
      ),
      'transaction did not succeed'
    );

    let value = null;

    if (Object.hasOwn(status, 'SuccessValue')) {
      const decoded = Buffer.from(
        status.SuccessValue,
        'base64'
      ).toString('utf8');

      if (decoded.length) value = JSON.parse(decoded);
    }

    process.send({
      requestId,
      ok: true,
      signer: accountId,
      publicKey,
      txHash: result.transaction.hash,
      value,
      verifiedData,
      verifiedWork
    });
  } catch (error) {
    process.send({
      requestId,
      ok: false,
      error: String(error.message || error)
    });
  }
});
