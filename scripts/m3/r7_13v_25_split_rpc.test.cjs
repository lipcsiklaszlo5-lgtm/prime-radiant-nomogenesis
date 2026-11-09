'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {createRpcBroker} =
  require('./r7_13h_rpc_broker.cjs');

const READ = 'https://read.testnet.invalid';
const BACKUP = 'https://backup.testnet.invalid';
const SEND = 'https://send.testnet.invalid';

async function post(url, id, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0', id, method, params
    })
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

function reply(message) {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id: message.id,
    result: {ok: true}
  }), {
    status: 200,
    headers: {'content-type': 'application/json'}
  });
}

test('reads and signed sends use separate routes', async () => {
  const calls = [];

  const broker = createRpcBroker({
    upstreams: [READ, BACKUP],
    sendUpstream: SEND,
    minGapMs: 0,
    fetchImpl: async (url, options) => {
      const message = JSON.parse(options.body);
      calls.push({url, method: message.method});
      return reply(message);
    }
  });

  const url = await broker.listen();

  try {
    const read = await post(url, 1, 'query', {
      request_type: 'view_account',
      account_id: 'agent.testnet'
    });

    assert.equal(read.status, 200);

    const payload = {
      signed_tx_base64: 'SYNTHETIC_OFFLINE_PAYLOAD',
      wait_until: 'NONE'
    };

    const send = await post(url, 2, 'send_tx', payload);
    assert.equal(send.status, 200);

    const duplicate = await post(url, 3, 'send_tx', payload);
    assert.equal(duplicate.status, 409);

    assert.deepEqual(calls, [
      {url: READ, method: 'query'},
      {url: SEND, method: 'send_tx'}
    ]);

    const health = await (
      await fetch(url + 'health')
    ).json();

    assert.equal(health.send_channel_isolated, true);
    assert.equal(health.distinct_signed_payloads, 1);

    console.log('READ_SEND_ISOLATION: PASS');
    console.log('DUPLICATE_SEND_BLOCKED: PASS');

  } finally {
    await broker.close();
  }
});

test('429 on send never retries or fails over', async () => {
  const calls = [];

  const broker = createRpcBroker({
    upstreams: [READ, BACKUP],
    sendUpstream: SEND,
    minGapMs: 0,
    fetchImpl: async (url, options) => {
      calls.push(url);
      const message = JSON.parse(options.body);

      if (message.method === 'send_tx') {
        return new Response('Rate limited', {status: 429});
      }

      return reply(message);
    }
  });

  const url = await broker.listen();

  try {
    const payload = {
      signed_tx_base64: 'ONE_SHOT_OFFLINE_SIGNATURE',
      wait_until: 'NONE'
    };

    const first = await post(url, 1, 'send_tx', payload);
    const second = await post(url, 2, 'send_tx', payload);

    assert.equal(first.status, 503);
    assert.equal(second.status, 409);

    assert.deepEqual(calls, [SEND]);

    console.log('429_SIGNED_RETRY: FORBIDDEN');
    console.log('429_SIGNED_FAILOVER: FORBIDDEN');

  } finally {
    await broker.close();
  }
});
