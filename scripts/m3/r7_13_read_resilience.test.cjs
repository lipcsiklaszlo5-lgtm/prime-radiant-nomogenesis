'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readWithRetry,
  transientReadError
} = require('./r7_13_read_resilience.cjs');

function httpError(status) {
  const error = Error('RPC HTTP ' + status);
  error.status = status;
  return error;
}

test('503, 429 then recovery: three read attempts', async () => {
  let calls = 0;

  const value = await readWithRetry(async () => {
    calls++;

    if (calls === 1) throw httpError(503);
    if (calls === 2) throw httpError(429);

    return {chain_id: 'testnet'};

  }, {
    label: 'fault-injected-query',
    maxAttempts: 4,
    baseDelayMs: 0
  });

  assert.deepEqual(value, {chain_id: 'testnet'});
  assert.equal(calls, 3);
});

test('contract rejection is never retried', async () => {
  let calls = 0;

  await assert.rejects(
    () => readWithRetry(async () => {
      calls++;
      throw Error('contract panic: invalid award');
    }, {baseDelayMs: 0}),
    /invalid award/
  );

  assert.equal(calls, 1);
});

test('persistent 503 terminates within attempt budget', async () => {
  let calls = 0;

  await assert.rejects(
    () => readWithRetry(async () => {
      calls++;
      throw httpError(503);
    }, {
      maxAttempts: 3,
      baseDelayMs: 0
    }),
    /503/
  );

  assert.equal(calls, 3);
});

test('nontransient HTTP 403 fails closed', async () => {
  let calls = 0;

  await assert.rejects(
    () => readWithRetry(async () => {
      calls++;
      throw httpError(403);
    }, {baseDelayMs: 0}),
    /403/
  );

  assert.equal(calls, 1);
});

test('timeout and broker errors are transient reads', () => {
  const timeout = Error('Timeout');
  timeout.name = 'TimeoutError';

  assert(transientReadError(timeout));
  assert(transientReadError(
    Error('RPC broker failure: upstream HTTP 503')
  ));
  assert(!transientReadError(
    Error('wrong contract state')
  ));
});
