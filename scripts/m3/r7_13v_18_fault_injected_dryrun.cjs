'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const {spawn} = require('node:child_process');

const {createRpcBroker} =
  require('./r7_13h_rpc_broker.cjs');

const READ = new Set([
  'status',
  'block',
  'query',
  'gas_price',
  'validators',
  'tx',
  'EXPERIMENTAL_tx_status',
  'EXPERIMENTAL_protocol_config'
]);

const SEND = new Set([
  'send_tx',
  'broadcast_tx',
  'broadcast_tx_async',
  'broadcast_tx_commit'
]);

const targets = new Set(['status', 'query']);

const injected = new Map();
let blocked = 0;
let forwarded = 0;

async function run() {
  const broker = createRpcBroker({
    upstreams: [
      'https://rpc.testnet.fastnear.com',
      'https://archival-rpc.testnet.fastnear.com'
    ],
    minGapMs: 180,
    maxQueued: 140,
    maxReadQueueWaitMs: 5000,
    maxSendQueueWaitMs: 7000,
    maxReadTotalMs: 12000,
    timeoutMs: 18000,
    retryPauseMs: 750,

    fetchImpl: async (url, options) => {
      const request = JSON.parse(options.body);

      if (SEND.has(request.method)) {
        blocked++;
        throw Error('LIVE_BROADCAST_FORBIDDEN');
      }

      assert(READ.has(request.method));

      return fetch(url, options);
    }
  });

  const brokerUrl = await broker.listen();

  const proxy = http.createServer((request, response) => {
    void (async () => {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/');

      let raw = '';

      for await (const part of request) {
        raw += part.toString('utf8');

        assert(
          raw.length <= 1024 * 1024,
          'Oversized RPC request'
        );
      }

      const message = JSON.parse(raw);

      assert.equal(message.jsonrpc, '2.0');
      assert.equal(typeof message.method, 'string');

      if (SEND.has(message.method)) {
        blocked++;

        response.writeHead(403, {
          'content-type': 'application/json'
        });

        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32091,
            message: 'Read-only test: broadcast forbidden'
          }
        }));

        return;
      }

      assert(
        READ.has(message.method),
        'Unexpected RPC method'
      );

      if (
        targets.has(message.method) &&
        !injected.has(message.method)
      ) {
        injected.set(message.method, 1);

        response.writeHead(503, {
          'content-type': 'application/json'
        });

        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32093,
            message:
              'Injected temporary RPC HTTP 503'
          }
        }));

        console.log(
          'FAULT_INJECTED_503:',
          message.method
        );

        return;
      }

      forwarded++;

      const upstream = await fetch(brokerUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: raw,
        signal: AbortSignal.timeout(25000)
      });

      const body = await upstream.text();

      response.writeHead(upstream.status, {
        'content-type': 'application/json'
      });

      response.end(body);

    })().catch(error => {
      if (!response.headersSent) {
        response.writeHead(500, {
          'content-type': 'application/json'
        });
      }

      response.end(JSON.stringify({
        error: 'Local fault proxy: ' +
          String(error.message).slice(0, 160)
      }));
    });
  });

  let child;

  try {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);

      proxy.listen(
        0, '127.0.0.1', resolve
      );
    });

    const faultUrl =
      `http://127.0.0.1:${proxy.address().port}/`;

    console.log('LOCAL_FAULT_PROXY:', faultUrl);

    const env = {
      ...process.env,
      NMG_R7_13H_RPC_URL: faultUrl,
      NMG_R7_13H_RUN_ID: 'live-v2-once-05'
    };

    for (const name of [
      'NMG_R7_13_ENABLE_LIVE',
      'NMG_R7_13H_LIVE_APPROVAL',
      'NMG_R7_13V_05_LIVE_APPROVAL',
      'NMG_R7_13V_14_LIVE_APPROVAL'
    ]) {
      delete env[name];
    }

    child = spawn(
      process.execPath,
      [
        path.join(
          __dirname,
          'r7_13_public_coordinator.cjs'
        ),
        '--dry-run'
      ],
      {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      const value = chunk.toString();
      stdout = (stdout + value).slice(-100000);
      process.stdout.write(value);
    });

    child.stderr.on('data', chunk => {
      const value = chunk.toString();
      stderr = (stderr + value).slice(-100000);
      process.stderr.write(value);
    });

    const result = await new Promise((resolve, reject) => {
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;

        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}

        reject(Error('Dry-run timeout'));
      }, 240000);

      child.once('error', error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      });

      child.once('close', (code, signal) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({code, signal});
      });
    });

    assert.equal(
      result.code, 0,
      'Fault-injected coordinator failed'
    );

    assert.match(stdout, /TEN_AGENT_CONNECTIONS: PASS/);
    assert.match(stdout, /TEN_AGENT_DRY_RUN: PASS/);
    assert.match(stdout, /PUBLIC_WRITES: 0/);

    assert.match(
      stderr,
      /TRANSIENT_READ_RETRY:\s+coordinator-status/
    );

    assert.match(
      stderr,
      /TRANSIENT_READ_RETRY:\s+coordinator-query/
    );

    assert.equal(injected.get('status'), 1);
    assert.equal(injected.get('query'), 1);
    assert.equal(blocked, 0);
    assert(forwarded >= 5);

    const healthResponse = await fetch(
      brokerUrl + 'health'
    );

    assert.equal(healthResponse.status, 200);

    const health = await healthResponse.json();

    assert.equal(health.distinct_signed_payloads, 0);
    assert.equal(health.queued, 0);
    assert.equal(health.pending, 0);

    console.log('================================');
    console.log('FAULT_INJECTED_503_COUNT: 2');
    console.log('COORDINATOR_RECOVERED: PASS');
    console.log('TEN_AGENT_DRY_RUN: PASS');
    console.log('SIGNED_BROADCAST_ATTEMPTS: 0');
    console.log('NEW_PUBLIC_TRANSACTIONS: 0');
    console.log(
      'R7_13V_18_RPC_FAULT_INJECTION: PASS'
    );
    console.log('================================');

  } finally {
    if (
      child &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }

    if (proxy.listening) {
      await new Promise(resolve =>
        proxy.close(resolve)
      );
    }

    await broker.close();
  }
}

run().catch(error => {
  console.error(
    'R7_13V_18_FAULT_GATE_STOP:',
    error.stack || String(error)
  );
  process.exitCode = 1;
});
