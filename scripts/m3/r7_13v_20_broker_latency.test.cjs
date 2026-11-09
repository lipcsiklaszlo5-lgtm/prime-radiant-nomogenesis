'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {createRpcBroker} =
  require('./r7_13h_rpc_broker.cjs');

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function jsonRpc(id, method, params) {
  return {jsonrpc: '2.0', id, method, params};
}

async function post(url, msg) {
  const begin = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(msg),
    signal: AbortSignal.timeout(12000)
  });

  return {
    status: response.status,
    body: await response.json(),
    latency: Date.now() - begin
  };
}

function result(message) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        ok: true,
        account: message.params?.account_id ?? null
      }
    }),
    {
      status: 200,
      headers: {'content-type': 'application/json'}
    }
  );
}

test(
  'ten slow agent readers and one prioritized send',
  {timeout: 90000},
  async () => {
    let active = 0;
    let maximum = 0;
    let sends = 0;
    let injected503 = 0;
    const latencies = [];

    const broker = createRpcBroker({
      upstreams: [
        'https://mock-primary.testnet.invalid',
        'https://mock-backup.testnet.invalid'
      ],
      maxConcurrentReads: 4,
      minGapMs: 100,
      maxReadQueueWaitMs: 5000,
      maxReadTotalMs: 12000,
      maxQueued: 140,
      timeoutMs: 3000,
      retryPauseMs: 40,

      fetchImpl: async (_url, options) => {
        const message = JSON.parse(options.body);

        active++;
        maximum = Math.max(maximum, active);

        try {
          await sleep(380);

          if (
            message.method === 'query' &&
            injected503 === 0
          ) {
            injected503++;
            return new Response(
              'temporary upstream outage',
              {status: 503}
            );
          }

          if (message.method === 'send_tx') {
            sends++;
          }

          return result(message);
        } finally {
          active--;
        }
      }
    });

    const url = await broker.listen();

    try {
      const agents = Array.from(
        {length: 10},
        (_, index) => (async () => {
          for (let round = 0; round < 5; round++) {
            const reply = await post(
              url,
              jsonRpc(
                `agent-${index}-${round}`,
                'query',
                {
                  request_type: 'view_account',
                  account_id:
                    `agent-${index}-round-${round}.testnet`
                }
              )
            );

            assert.equal(reply.status, 200);
            assert.equal(
              reply.body.result.account,
              `agent-${index}-round-${round}.testnet`
            );

            latencies.push(reply.latency);

            await sleep(1800);
          }
        })()
      );

      const send = (async () => {
        await sleep(300);

        const first = await post(
          url,
          jsonRpc(
            'signed-once',
            'send_tx',
            {
              signed_tx_base64:
                'LOCAL_SYNTHETIC_NOT_A_REAL_SIGNATURE',
              wait_until: 'NONE'
            }
          )
        );

        assert.equal(first.status, 200);
        assert(
          first.latency < 3000,
          'Signed send starved by queued reads'
        );

        const repeat = await post(
          url,
          jsonRpc(
            'signed-again',
            'send_tx',
            {
              signed_tx_base64:
                'LOCAL_SYNTHETIC_NOT_A_REAL_SIGNATURE',
              wait_until: 'NONE'
            }
          )
        );

        assert.equal(repeat.status, 409);
      })();

      await Promise.all([...agents, send]);

      const health = await (
        await fetch(url + 'health')
      ).json();

      assert.equal(latencies.length, 50);
      assert.equal(health.queued, 0);
      assert.equal(health.pending, 0);
      assert.equal(health.active_reads, 0);
      assert.equal(health.active_send, false);
      assert.equal(health.distinct_signed_payloads, 1);
      assert.equal(sends, 1);
      assert.equal(injected503, 1);

      assert(
        maximum >= 2 && maximum <= 5,
        'Bounded read concurrency not observed'
      );

      const sorted = [...latencies].sort((a,b) => a-b);
      const p95 = sorted[
        Math.floor((sorted.length - 1) * 0.95)
      ];

      assert(
        p95 < 5000,
        'Slow upstream caused read queue collapse'
      );

      console.log('SLOW_UPSTREAM_LATENCY_MS: 380');
      console.log('SIMULATED_AGENT_READS: 50');
      console.log('INJECTED_UPSTREAM_503: 1');
      console.log('MAX_PARALLEL_UPSTREAM:', maximum);
      console.log('P95_AGENT_READ_MS:', p95);
      console.log('SIGNED_SEND_EXECUTIONS: 1');
      console.log('REPEATED_SIGNED_SEND: BLOCKED');
      console.log(
        'R7_13V_20_SLOW_RPC_STRESS: PASS'
      );

    } finally {
      await broker.close();
    }
  }
);
