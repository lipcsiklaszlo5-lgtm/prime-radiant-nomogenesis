"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const L = require('./r7_13v_run08_launcher.cjs');

const check = (method, route) =>
  assert.equal(L.routeFor(method).channel, route);

test('baseline is exactly 270 UNIT', () => {
  assert.equal(L.BASELINE_UNITS, 270n);
  assert.equal(L.buildPlan().baseline.units, '270');
});

test('FastNear serves ordinary reads', () => {
  for (const m of [
    'status', 'query', 'block', 'gas_price', 'validators'
  ]) check(m, 'read');
});

test('transaction status uses finality lane', () => {
  check('tx', 'finality');
  check('EXPERIMENTAL_tx_status', 'finality');
});

test('finality lane limits are preserved in config', () => {
  const r = L.ROUTES.finality;
  assert.equal(r.primary, 'NEAR RPC');
  assert.equal(r.fallback, 'dRPC');
  assert.equal(r.maxConcurrency, 2);
  assert.equal(r.queueLimit, 24);
  assert.equal(r.minSpacingMs, 300);
  assert.equal(r.deadlineMs, 30000);
});

test('dRPC send route remains disabled', () => {
  assert.equal(L.ROUTES.send.primary, 'dRPC');
  assert.equal(L.ROUTES.send.enabled, false);
  assert.equal(L.buildPlan().broadcastEnabled, false);
});

test('all write methods fail before adapter calls', async () => {
  let calls = 0;
  const adapters = {
    fastNearRead: () => { calls++; },
    finalityLaneRead: () => { calls++; }
  };

  for (const m of [
    'broadcast_tx_async',
    'broadcast_tx_commit',
    'send_tx',
    'sign_and_send_tx',
    'sendTransaction',
    'broadcast_tx'
  ]) {
    await assert.rejects(
      L.dispatchReadOnly(m, [], adapters),
      /RUN08_LIVE_SEND_DISABLED/
    );
  }

  assert.equal(calls, 0);
});

test('unknown methods fail closed', async () => {
  await assert.rejects(
    L.dispatchReadOnly('unsafe_custom_method', [], {}),
    /RUN08_UNKNOWN_RPC_METHOD/
  );
});

test('read and finality use different adapters', async () => {
  const calls = [];
  const adapters = {
    fastNearRead: async (m, p) => {
      calls.push(['fast', m, p]);
      return 'fast';
    },
    finalityLaneRead: async (m, p) => {
      calls.push(['finality', m, p]);
      return 'finality';
    }
  };

  assert.equal(
    await L.dispatchReadOnly('query', [], adapters),
    'fast'
  );
  assert.equal(
    await L.dispatchReadOnly('tx', ['hash', 'testnet'], adapters),
    'finality'
  );
  assert.deepEqual(
    calls.map(x => x[0]),
    ['fast', 'finality']
  );
});

test('missing broker adapter is rejected', async () => {
  await assert.rejects(
    L.dispatchReadOnly('tx', [], {}),
    /RUN08_MISSING_READ_ADAPTER/
  );
});

test('coordinator exposes only offline plan', () => {
  const coordinator = path.join(
    __dirname,
    'r7_13_public_coordinator.cjs'
  );

  const proc = spawnSync(
    process.execPath,
    [coordinator, '--run08-finality-plan', '--json'],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        NOMOGENESIS_LIVE_APPROVED: '0'
      }
    }
  );

  assert.equal(proc.status, 0, proc.stderr);

  const plan = JSON.parse(proc.stdout);

  assert.equal(plan.run08Started, false);
  assert.equal(plan.run07Rerun, false);
  assert.equal(plan.newTestnetTransactions, 0);
  assert.equal(plan.signedTransactionRetries, 0);
  assert.equal(plan.routes.finality.primary, 'NEAR RPC');
});
