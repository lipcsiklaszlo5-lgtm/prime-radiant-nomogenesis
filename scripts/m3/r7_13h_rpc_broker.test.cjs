'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  createRpcBroker
} = require('./r7_13h_rpc_broker.cjs');

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function mock(reply) {
  let calls = 0;

  const server = http.createServer((req, res) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', async () => {
      calls++;

      const request = JSON.parse(data);
      const answer = await reply(request, calls);

      res.writeHead(
        answer.status ?? 200,
        {'content-type': 'application/json'}
      );

      res.end(JSON.stringify(
        answer.body ?? {
          jsonrpc: '2.0',
          id: request.id,
          result: {ok: true}
        }
      ));
    });
  });

  await new Promise(resolve =>
    server.listen(
      0, '127.0.0.1', resolve
    )
  );

  return {
    url:
      'http://127.0.0.1:' +
      server.address().port,

    calls: () => calls,

    close: () =>
      new Promise(resolve =>
        server.close(resolve)
      )
  };
}

function rpc(id, method, params = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
}

async function post(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

test(
  'concurrent read requests are coalesced',
  async () => {
    const upstream = await mock(async msg => {
      await delay(35);

      return {
        body: {
          jsonrpc: '2.0',
          id: msg.id,
          result: {chain_id: 'testnet'}
        }
      };
    });

    const broker = createRpcBroker({
      upstreams: [upstream.url],
      minGapMs: 0
    });

    const url = await broker.listen();

    try {
      assert.equal(
        broker.server.address().address,
        '127.0.0.1'
      );

      const results = await Promise.all(
        Array.from({length: 20}, (_, i) =>
          post(url, rpc(i + 1, 'status', []))
        )
      );

      assert.equal(upstream.calls(), 1);

      assert(results.every((r, i) =>
        r.status === 200 &&
        r.body.id === i + 1 &&
        r.body.result.chain_id === 'testnet'
      ));

      const health = await (
        await fetch(url + 'health')
      ).json();

      assert.equal(
        health.coalesced_requests,
        19
      );

    } finally {
      await broker.close();
      await upstream.close();
    }
  }
);

test(
  '429 on read retries and falls back',
  async () => {
    const blocked = await mock(msg => ({
      status: 429,
      body: {jsonrpc: '2.0', id: msg.id}
    }));

    const healthy = await mock(msg => ({
      body: {
        jsonrpc: '2.0',
        id: msg.id,
        result: {header: {hash: 'mock'}}
      }
    }));

    const broker = createRpcBroker({
      upstreams: [blocked.url, healthy.url],
      minGapMs: 5,
      retryPauseMs: 2
    });

    const url = await broker.listen();

    try {
      const result = await post(
        url,
        rpc(
          'one',
          'block',
          {finality: 'final'}
        )
      );

      assert.equal(result.status, 200);
      assert.equal(
        result.body.result.header.hash,
        'mock'
      );

      assert.equal(blocked.calls(), 2);
      assert.equal(healthy.calls(), 1);

    } finally {
      await broker.close();
      await blocked.close();
      await healthy.close();
    }
  }
);

test(
  'uncertain broadcasts never retry or fail over',
  async () => {
    const failing = await mock(msg => ({
      status: 429,
      body: {jsonrpc: '2.0', id: msg.id}
    }));

    const unused = await mock(msg => ({
      body: {
        jsonrpc: '2.0',
        id: msg.id,
        result: 'unexpected'
      }
    }));

    const broker = createRpcBroker({
      upstreams: [failing.url, unused.url],
      minGapMs: 0,
      retryPauseMs: 0
    });

    const url = await broker.listen();

    try {
      const first = await post(
        url,
        rpc(
          1,
          'broadcast_tx_commit',
          ['signed-mock-transaction']
        )
      );

      assert.equal(first.status, 503);

      const repeated = await post(
        url,
        rpc(
          2,
          'broadcast_tx_commit',
          ['signed-mock-transaction']
        )
      );

      assert.equal(repeated.status, 409);
      assert.equal(failing.calls(), 1);
      assert.equal(unused.calls(), 0);

    } finally {
      await broker.close();
      await failing.close();
      await unused.close();
    }
  }
);

test(
  'distinct signed transactions dispatch once',
  async () => {
    const upstream = await mock(msg => ({
      body: {
        jsonrpc: '2.0',
        id: msg.id,
        result: 'accepted'
      }
    }));

    const broker = createRpcBroker({
      upstreams: [upstream.url],
      minGapMs: 0
    });

    const url = await broker.listen();

    try {
      const first = await post(
        url,
        rpc(
          1,
          'broadcast_tx_commit',
          ['tx-1']
        )
      );

      const second = await post(
        url,
        rpc(
          2,
          'broadcast_tx_commit',
          ['tx-2']
        )
      );

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(upstream.calls(), 2);

    } finally {
      await broker.close();
      await upstream.close();
    }
  }
);

test(
  'same signed payload blocked with new request ID',
  async () => {
    const upstream = await mock(msg => ({
      body: {
        jsonrpc: '2.0',
        id: msg.id,
        result: 'ok'
      }
    }));

    const broker = createRpcBroker({
      upstreams: [upstream.url],
      minGapMs: 0
    });

    const url = await broker.listen();

    try {
      const message = rpc(
        'A',
        'send_tx',
        {signed_tx_base64: 'AABB'}
      );

      assert.equal(
        (await post(url, message)).status,
        200
      );

      assert.equal(
        (await post(url, {
          ...message,
          id: 'B'
        })).status,
        409
      );

      assert.equal(upstream.calls(), 1);

    } finally {
      await broker.close();
      await upstream.close();
    }
  }
);

test(
  'unsupported RPC methods blocked',
  async () => {
    const upstream = await mock(() => {
      throw Error('unexpected upstream call');
    });

    const broker = createRpcBroker({
      upstreams: [upstream.url],
      minGapMs: 0
    });

    const url = await broker.listen();

    try {
      const result = await post(
        url,
        rpc(
          1,
          'unsafe_signing_method',
          []
        )
      );

      assert.equal(result.status, 403);
      assert.equal(upstream.calls(), 0);

    } finally {
      await broker.close();
      await upstream.close();
    }
  }
);

test(
  'wrong chain ID refused',
  async () => {
    const upstream = await mock(msg => ({
      body: {
        jsonrpc: '2.0',
        id: msg.id,
        result: {chain_id: 'mainnet'}
      }
    }));

    const broker = createRpcBroker({
      upstreams: [upstream.url],
      minGapMs: 0
    });

    const url = await broker.listen();

    try {
      const result = await post(
        url,
        rpc(1, 'status', [])
      );

      assert.equal(result.status, 503);
      assert.equal(upstream.calls(), 1);

    } finally {
      await broker.close();
      await upstream.close();
    }
  }
);
