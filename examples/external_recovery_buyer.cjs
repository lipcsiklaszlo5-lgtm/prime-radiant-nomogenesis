'use strict';

const assert = require('node:assert/strict');
const near = require('near-api-js');
const {
  RecoveryIntent
} = require('../sdk/recovery_intent.cjs');

assert(process.send, 'external agent requires IPC');

const accountId = process.argv[2];
assert.match(accountId, /^sdkbuyer\.test\.near$/);

// Private signing key is created and kept only here.
const keyPair = near.KeyPair.fromRandom('ed25519');
const publicKey = keyPair.getPublicKey().toString();

const UNIT = 10n ** 21n;
let account = null;
let signedCalls = 0;

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

      const store =
        new near.keyStores.InMemoryKeyStore();

      await store.setKey(
        'sandbox',
        accountId,
        keyPair
      );

      const connection = await near.connect({
        networkId: 'sandbox',
        nodeUrl: message.rpcUrl,
        keyStore: store,
        deps: {keyStore: store}
      });

      account = await connection.account(accountId);
      process.send({requestId, ok: true});
      return;
    }

    assert.equal(message.kind, 'fund');
    assert(account, 'agent not connected');

    assert.equal(
      message.intent.worker,
      'worker0.test.near'
    );

    // Agent-local economic policy, not an SDK default.
    const cap = BigInt(
      message.intent.rescueCapYocto
    );

    assert(
      cap > 0n && cap <= 7n * UNIT,
      'external buyer refuses rescue cap'
    );

    const intent = new RecoveryIntent(
      message.intent
    );

    const contract = {
      accountId: message.contractId,

      view(method, args = {}) {
        return account.viewFunction({
          contractId: message.contractId,
          methodName: method,
          args
        });
      }
    };

    const buyer = {
      async call(target, method, args, options) {
        assert.equal(
          method,
          'create_funded_rescue_job'
        );
        assert.equal(
          target.accountId,
          message.contractId
        );

        signedCalls++;

        const outcome = await account.functionCall({
          contractId: target.accountId,
          methodName: method,
          args,
          gas: BigInt(options.gas),
          attachedDeposit:
            BigInt(options.attachedDeposit)
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
          Object.hasOwn(
            outcome.status,
            'SuccessValue'
          ),
          'funding did not return success value'
        );

        const raw = Buffer.from(
          outcome.status.SuccessValue,
          'base64'
        ).toString('utf8');

        return {
          jobId: JSON.parse(raw),
          txHash: outcome.transaction.hash,
          signer: accountId,
          attachedDeposit:
            options.attachedDeposit
        };
      }
    };

    const result = await intent.fund({
      buyer,
      contract
    });

    process.send({
      requestId,
      ok: true,
      ...result,
      signedCalls
    });

  } catch (error) {
    process.send({
      requestId,
      ok: false,
      reason: error.message || String(error),
      signedCalls
    });
  }
});
