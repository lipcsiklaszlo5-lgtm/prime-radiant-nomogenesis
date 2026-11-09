'use strict';

const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const path = require('node:path');

const {
  createRpcBroker
} = require('./r7_13h_rpc_broker.cjs');

const BANNED_SEND = new Set([
  'broadcast_tx_commit',
  'broadcast_tx_async',
  'broadcast_tx',
  'send_tx'
]);

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Dry-run launcher takes no arguments'
  );

  assert.equal(
    process.env.NMG_R7_13_ENABLE_LIVE,
    undefined,
    'Live execution flag must not be set'
  );

  let interceptedBroadcasts = 0;

  const broker = createRpcBroker({
    upstreams: [
      'https://near-testnet.drpc.org',
      'https://rpc.testnet.fastnear.com'
    ],

    minGapMs: 180,
    maxQueued: 140,
    retryPauseMs: 750,
    timeoutMs: 18000,

    fetchImpl: async (url, opts) => {
      const request = JSON.parse(opts.body);

      if (BANNED_SEND.has(request.method)) {
        interceptedBroadcasts++;

        throw Error(
          'DRY_RUN_BROADCAST_BLOCKED'
        );
      }

      return fetch(url, opts);
    }
  });

  const url = await broker.listen();

  assert.match(
    url,
    /^http:\/\/127\.0\.0\.1:\d+\/$/
  );

  console.log(
    'LOCAL_RPC_BROKER:',
    url
  );

  const script = path.join(
    __dirname,
    'r7_13_public_coordinator.cjs'
  );

  try {
    await new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        NMG_R7_13H_RPC_URL: url
      };

      delete env.NMG_R7_13_ENABLE_LIVE;

      const child = spawn(
        process.execPath,
        [script, '--dry-run'],
        {
          env,
          stdio: 'inherit'
        }
      );

      const timer = setTimeout(() => {
        console.error(
          'DRY_RUN_TIMEOUT: terminating child'
        );

        child.kill('SIGTERM');
      }, 240000);

      child.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });

      child.once('close', (code, signal) => {
        clearTimeout(timer);

        if (code === 0) {
          resolve();
        } else {
          reject(Error(
            `Coordinator exit ${code} / ${signal}`
          ));
        }
      });
    });

    const response = await fetch(
      url + 'health'
    );

    assert.equal(response.status, 200);

    const health = await response.json();

    assert.equal(health.ok, true);
    assert(health.upstream_requests > 0);
    assert.equal(
      health.distinct_signed_payloads,
      0
    );
    assert.equal(interceptedBroadcasts, 0);
    assert.equal(health.queued, 0);

    console.log(
      'BROKER_UPSTREAM_REQUESTS:',
      health.upstream_requests
    );

    console.log(
      'BROKER_INFLIGHT_COALESCED:',
      health.coalesced_requests
    );

    console.log(
      'BROADCAST_ATTEMPTS:',
      interceptedBroadcasts
    );

    console.log(
      'R7_13H_02_DRY_RUN_INTEGRATED: PASS'
    );

  } finally {
    await broker.close();
  }
}

main().catch(error => {
  console.error(
    'R7_13H_02_DRY_RUN_STOP:',
    error.stack || error
  );

  process.exitCode = 1;
});
