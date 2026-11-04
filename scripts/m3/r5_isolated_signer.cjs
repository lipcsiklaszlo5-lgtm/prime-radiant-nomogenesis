'use strict';

const assert = require('node:assert/strict');
const near = require('near-api-js');

const accountId = process.argv[2];
assert.match(accountId, /^[a-z0-9-]+\.test\.near$/);

const keyPair = near.KeyPair.fromRandom('ed25519');
const publicKey = keyPair.getPublicKey().toString();

let account = null;

process.send({
  kind: 'ready',
  pid: process.pid,
  publicKey
});

process.on('message', async message => {
  const requestId = message.requestId;

  try {
    if (message.kind === 'connect') {
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

    if (message.kind !== 'call') {
      throw new Error('unsupported IPC command');
    }

    assert(account, 'signer not connected');

    // This proof-stage signer has only one permitted action.
    assert.equal(
      message.method,
      'create_rescue_case',
      'method forbidden by signer policy'
    );

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

    assert(
      result.status &&
      Object.hasOwn(result.status, 'SuccessValue'),
      'transaction not successful'
    );

    const value = JSON.parse(
      Buffer.from(
        result.status.SuccessValue,
        'base64'
      ).toString('utf8')
    );

    process.send({
      requestId,
      ok: true,
      txHash: result.transaction.hash,
      signer: result.transaction.signer_id,
      publicKey: result.transaction.public_key,
      value
    });
  } catch (error) {
    process.send({
      requestId,
      ok: false,
      error: String(error.message || error)
    });
  }
});
