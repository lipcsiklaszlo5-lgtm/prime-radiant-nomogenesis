"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const {
  localEndpoint,
  createReadOnlyBridge
} = require('./r7_13v_35_run08_loopback_bridge.cjs');

async function withBroker(handler, fn) {
  const server = http.createServer(handler);

  await new Promise(ok =>
    server.listen(0, '127.0.0.1', ok)
  );

  const endpoint =
    `http://127.0.0.1:${server.address().port}/`;

  try {
    return await fn(endpoint);
  } finally {
    server.closeAllConnections();
    await new Promise(ok => server.close(ok));
  }
}

function reply(req, res, calls) {
  let raw = '';

  req.on('data', x => raw += x);

  req.on('end', () => {
    const rpc = JSON.parse(raw);
    calls.push(rpc);

    res.setHeader(
      'content-type', 'application/json'
    );

    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: rpc.id,
      result: {method: rpc.method}
    }));
  });
}

test('reject non-loopback endpoints', () => {
  for (const url of [
    '',
    'https://127.0.0.1:3030/',
    'http://localhost:3030/',
    'http://example.com:3030/',
    'http://127.0.0.2:3030/',
    'http://127.0.0.1:3030/?x=1',
    'http://u@127.0.0.1:3030/',
    'http://127.0.0.1/',
    'http://127.0.0.1:3030/admin',
    'file:///etc/passwd'
  ]) {
    assert.throws(() => localEndpoint(url));
  }

  assert.equal(
    localEndpoint('http://127.0.0.1:3030/').port,
    '3030'
  );
});

test('read and finality use local broker', async () => {
  const calls = [];

  await withBroker(
    (req, res) => reply(req, res, calls),
    async endpoint => {
      const b = createReadOnlyBridge(endpoint);

      assert.deepEqual(
        await b.read('query', []),
        {method: 'query'}
      );

      assert.deepEqual(
        await b.read('tx', ['hash', 'signer']),
        {method: 'tx'}
      );
    }
  );

  assert.deepEqual(
    calls.map(x => x.method),
    ['query', 'tx']
  );
});

test('writes rejected before HTTP', async () => {
  const calls = [];

  await withBroker(
    (req, res) => reply(req, res, calls),
    async endpoint => {
      const b = createReadOnlyBridge(endpoint);

      for (const method of [
        'broadcast_tx_async',
        'broadcast_tx_commit',
        'send_tx'
      ]) {
        await assert.rejects(
          b.read(method, []),
          /RUN08_LIVE_SEND_DISABLED/
        );
      }

      assert.throws(
        () => b.adapters.fastNearRead('tx', []),
        /RUN08_METHOD_OR_PARAMS_REJECTED/
      );

      assert.throws(
        () => b.adapters.finalityLaneRead('query', []),
        /RUN08_METHOD_OR_PARAMS_REJECTED/
      );

      await assert.rejects(
        b.read('unknown', []),
        /RUN08_UNKNOWN_RPC_METHOD/
      );
    }
  );

  assert.equal(calls.length, 0);
});

test('RPC error never retries', async () => {
  let requests = 0;

  await withBroker((req, res) => {
    requests++;

    let s = '';

    req.on('data', x => s += x);

    req.on('end', () => {
      const {id} = JSON.parse(s);

      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'test'
        }
      }));
    });

  }, async endpoint => {
    await assert.rejects(
      createReadOnlyBridge(endpoint).read('tx', []),
      /RUN08_BROKER_RPC_ERROR/
    );
  });

  assert.equal(requests, 1);
});

test('invalid JSON-RPC fails closed', async () => {
  await withBroker(
    (req, res) =>
      res.end('{"id":777,"result":true}'),

    async endpoint => {
      await assert.rejects(
        createReadOnlyBridge(endpoint)
          .read('status', []),
        /RUN08_BROKER_INVALID_RESPONSE/
      );
    }
  );
});

test('oversize response fails closed', async () => {
  await withBroker(
    (req, res) => res.end('x'.repeat(1000)),

    async endpoint => {
      await assert.rejects(
        createReadOnlyBridge(
          endpoint,
          {maxBytes: 128}
        ).read('status', []),
        /RUN08_BROKER_RESPONSE_TOO_LARGE/
      );
    }
  );
});

test('invalid budgets rejected', () => {
  for (const v of [0, 10, 30001, NaN]) {
    assert.throws(
      () => createReadOnlyBridge(
        'http://127.0.0.1:3030/',
        {timeoutMs: v}
      )
    );
  }
});

test('CLI requires explicit opt-in', () => {
  const script = path.join(
    __dirname,
    'r7_13v_35_run08_loopback_bridge.cjs'
  );

  const p = spawnSync(
    process.execPath,
    [script],
    {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        NOMOGENESIS_LOOPBACK_RPC_URL:
          'http://127.0.0.1:3030/'
      }
    }
  );

  assert.equal(p.status, 2);

  assert.match(
    p.stderr,
    /RUN08_NO_AUTOMATIC_NETWORK_OR_SEND/
  );
});
