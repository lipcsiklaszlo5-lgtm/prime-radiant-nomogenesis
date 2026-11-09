'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {createRpcBroker} =
  require('./r7_13h_rpc_broker.cjs');

test('finality bypasses four blocked bulk readers', async () => {
  let releaseReads;
  let readersStarted = 0;
  let notifyStarted;

  const blocked = new Promise(resolve => {
    releaseReads = resolve;
  });

  const ready = new Promise(resolve => {
    notifyStarted = resolve;
  });

  const broker = createRpcBroker({
    upstreams: ['https://bulk.testnet.invalid'],
    finalityUpstreams: ['https://finality.testnet.invalid'],
    sendUpstream: 'https://send.testnet.invalid',
    minGapMs: 0,
    maxConcurrentReads: 4,

    fetchImpl: async (url, options) => {
      const msg = JSON.parse(options.body);

      if (msg.method === 'query') {
        readersStarted++;

        if (readersStarted === 4) {
          notifyStarted();
        }

        await blocked;
      }

      if (msg.method === 'tx') {
        assert.equal(url, 'https://finality.testnet.invalid');
      }

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {ok: true}
      }), {
        status: 200,
        headers: {'content-type': 'application/json'}
      });
    }
  });

  const url = await broker.listen();

  const post = async (id, method) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: method === 'tx'
          ? {tx_hash: 'synthetic', sender_account_id: 'agent.testnet'}
          : {request_type: 'view_account',
             account_id: `agent${id}.testnet`}
      })
    });

    assert.equal(response.status, 200);
    return response.json();
  };

  try {
    const readers = Array.from(
      {length: 4},
      (_, i) => post(i + 1, 'query')
    );

    await ready;

    const tx = await post(99, 'tx');

    assert.deepEqual(tx.result, {ok: true});

    const health = await (
      await fetch(url + 'health')
    ).json();

    assert.equal(health.finality_lane_enabled, true);
    assert.equal(health.active_finality, 0);

    console.log('FINALITY_BYPASS: PASS');
    console.log('FOUR_BLOCKED_READERS: ISOLATED');

    releaseReads();
    await Promise.all(readers);

  } finally {
    releaseReads();
    await broker.close();
  }
});

test('finality 429 falls back without sending a transaction', async () => {
  const primary = 'https://finality-a.testnet.invalid';
  const backup = 'https://finality-b.testnet.invalid';
  const calls = [];

  const broker = createRpcBroker({
    upstreams: ['https://bulk.testnet.invalid'],
    finalityUpstreams: [primary, backup],
    minGapMs: 0,
    fetchImpl: async (url, options) => {
      const msg = JSON.parse(options.body);

      assert.equal(msg.method, 'tx');
      calls.push(url);

      if (url === primary) {
        return new Response('rate limited', {status: 429});
      }

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {final_execution_status: 'FINAL'}
      }), {status: 200});
    }
  });

  const url = await broker.listen();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 55,
        method: 'tx',
        params: {
          tx_hash: 'SYNTHETIC_HASH',
          sender_account_id: 'buyer.testnet',
          wait_until: 'FINAL'
        }
      })
    });

    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.result.final_execution_status, 'FINAL');
    assert.deepEqual(calls, [primary, backup]);

    const health = await (
      await fetch(url + 'health')
    ).json();

    assert.equal(health.distinct_signed_payloads, 0);

    console.log('FINALITY_429_FAILOVER: PASS');
    console.log('PUBLIC_BROADCASTS: 0');
  } finally {
    await broker.close();
  }
});

test('finality concurrency never exceeds two', async () => {
  let active = 0;
  let maximum = 0;
  let started = 0;
  let release;
  let notify;

  const gate = new Promise(resolve => {
    release = resolve;
  });

  const ready = new Promise(resolve => {
    notify = resolve;
  });

  const broker = createRpcBroker({
    upstreams: ['https://bulk.testnet.invalid'],
    finalityUpstreams: ['https://finality.testnet.invalid'],
    minGapMs: 0,
    fetchImpl: async (_url, options) => {
      const msg = JSON.parse(options.body);

      assert.equal(msg.method, 'tx');

      active++;
      started++;
      maximum = Math.max(maximum, active);

      if (started === 2) notify();

      try {
        await gate;
      } finally {
        active--;
      }

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {ok: true}
      }), {status: 200});
    }
  });

  const url = await broker.listen();

  async function post(id) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tx',
        params: {
          tx_hash: 'SYNTHETIC_' + id,
          sender_account_id: 'buyer.testnet',
          wait_until: 'FINAL'
        }
      })
    });

    assert.equal(response.status, 200);
    return response.json();
  }

  try {
    const operations = Array.from(
      {length: 5},
      (_, i) => post(i + 1)
    );

    await ready;

    const health = await (
      await fetch(url + 'health')
    ).json();

    assert.equal(health.active_finality, 2);
    assert.equal(health.queued_finality, 3);

    release();
    await Promise.all(operations);

    assert.equal(maximum, 2);
    console.log('MAX_PARALLEL_FINALITY: 2');
    console.log('FINALITY_CONCURRENCY_BOUND: PASS');

  } finally {
    release();
    await broker.close();
  }
});
