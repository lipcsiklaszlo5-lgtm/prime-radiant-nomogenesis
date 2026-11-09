'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {createRpcBroker} =
  require('./r7_13h_rpc_broker.cjs');

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const primary = 'https://primary.testnet.invalid';
const backup = 'https://backup.testnet.invalid';

function rpc(id, method, params) {
  return {jsonrpc: '2.0', id, method, params};
}

async function post(url, payload) {
  const started = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });

  return {
    status: response.status,
    body: await response.json(),
    durationMs: Date.now() - started
  };
}

function result(message, body) {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id: message.id,
    result: body
  }), {
    status: 200,
    headers: {'content-type': 'application/json'}
  });
}

async function exercise(config, check) {
  const broker = createRpcBroker(config);
  const url = await broker.listen();

  assert.equal(
    broker.server.address().address,
    '127.0.0.1'
  );

  try {
    return await check(url);
  } finally {
    await broker.close();
  }
}

async function health(url) {
  const response = await fetch(url + 'health');
  assert.equal(response.status, 200);
  return response.json();
}

test(
  'signed write preempts reads even during spacing delay',
  async () => {
    const order = [];
    let started;

    const firstStarted = new Promise(resolve => {
      started = resolve;
    });

    await exercise({
      upstreams: [primary],
      minGapMs: 280,

      fetchImpl: async (_url, options) => {
        const message = JSON.parse(options.body);
        order.push(message.method + ':' + message.id);

        if (message.id === 1) {
          started();
          await sleep(20);
        }

        return result(message, {ok: true});
      }

    }, async url => {
      const first = post(
        url,
        rpc(1, 'query', {
          request_type: 'view_account',
          account_id: 'first.testnet'
        })
      );

      await firstStarted;

      const read = post(
        url,
        rpc(2, 'query', {
          request_type: 'view_account',
          account_id: 'second.testnet'
        })
      );

      await sleep(55);

      const queued = await health(url);
      assert(queued.queued_reads >= 1);

      const write = post(
        url,
        rpc(99, 'broadcast_tx_commit', [
          'signed-local-only'
        ])
      );

      const outputs = await Promise.all([
        first, read, write
      ]);

      assert(outputs.every(x => x.status === 200));

      assert.deepEqual(order, [
        'query:1',
        'broadcast_tx_commit:99',
        'query:2'
      ]);
    });
  }
);

test(
  '429 retry chain stops when global read budget expires',
  async () => {
    let attempts = 0;

    await exercise({
      upstreams: [primary, backup],
      minGapMs: 0,
      retryPauseMs: 65,
      maxReadTotalMs: 30,

      fetchImpl: async () => {
        attempts++;
        return new Response('rate limited', {
          status: 429
        });
      }

    }, async url => {
      const response = await post(
        url,
        rpc(1, 'block', {
          finality: 'final'
        })
      );

      assert.equal(response.status, 503);

      assert.match(
        response.body.error.message,
        /read total deadline expired/
      );
    });

    assert.equal(attempts, 1);
  }
);

test(
  'ten independent agents sustain mixed 900ms polling',
  {timeout: 120000},
  async () => {
    let active = 0;
    let maxActive = 0;
    let primaryRequests = 0;
    let backupRequests = 0;
    let signedSends = 0;

    const latencies = [];
    const failures = [];
    let acceptedReads = 0;

    const caseId = Array(32).fill(7);
    const contract =
      'nmg-r7v2-0b9a0eff20.testnet';

    const caseArgs = Buffer.from(
      JSON.stringify({case_id: caseId})
    ).toString('base64');

    const roleLookups = [
      ['get_rescue_job', {job_id: 2}],
      ['get_rescue_job', {job_id: 3}],
      ['get_rescue_offer', {offer_id: 3}],
      ['get_rescue_offer', {offer_id: 4}],
      ['get_rescue_offer', {offer_id: 5}],
      ['get_rescue_job', {job_id: 2}],
      ['get_rescue_job', {job_id: 3}]
    ];

    function lookup(id, method, args) {
      return rpc(id, 'query', {
        request_type: 'call_function',
        account_id: contract,
        method_name: method,
        args_base64: Buffer.from(
          JSON.stringify(args)
        ).toString('base64'),
        finality: 'final'
      });
    }

    await exercise({
      upstreams: [primary, backup],
      minGapMs: 180,
      maxQueued: 140,
      maxReadQueueWaitMs: 5000,
      maxReadTotalMs: 12000,
      retryPauseMs: 50,
      timeoutMs: 1000,

      fetchImpl: async (url, options) => {
        const message = JSON.parse(options.body);

        active++;
        maxActive = Math.max(maxActive, active);

        try {
          if (url === primary) {
            primaryRequests++;
          } else {
            backupRequests++;
          }

          await sleep(
            url === primary ? 24 : 40
          );

          // Two artificial primary 429 bursts.
          if (
            url === primary &&
            message.method !== 'broadcast_tx_commit' &&
            [4, 5, 23, 24].includes(primaryRequests)
          ) {
            return new Response('rate limited', {
              status: 429
            });
          }

          if (
            message.method === 'broadcast_tx_commit'
          ) {
            signedSends++;

            return result(message, {
              simulated: true,
              sent: true
            });
          }

          return result(message, {
            simulated: true,
            method: message.method,
            chain_id: 'testnet'
          });

        } finally {
          active--;
        }
      }

    }, async url => {
      const agents = Array.from(
        {length: 10},
        (_, index) => (async () => {
          for (let round = 0; round < 8; round++) {
            const caseRead = await post(
              url,
              rpc(
                `agent-${index}-case-${round}`,
                'query',
                {
                  request_type: 'call_function',
                  account_id: contract,
                  method_name: 'get_rescue_case',
                  args_base64: caseArgs,
                  finality: 'final'
                }
              )
            );

            latencies.push(caseRead.durationMs);

            if (caseRead.status !== 200) {
              failures.push({
                role: index,
                round,
                status: caseRead.status
              });
            } else {
              acceptedReads++;
            }

            // Buyers, providers and workers
            // make their own job/offer queries.
            if (
              round % 2 === 0 &&
              index < roleLookups.length
            ) {
              const [method, args] =
                roleLookups[index];

              const individual = await post(
                url,
                lookup(
                  `agent-${index}-extra-${round}`,
                  method,
                  args
                )
              );

              latencies.push(
                individual.durationMs
              );

              if (individual.status !== 200) {
                failures.push({
                  role: index,
                  round,
                  method,
                  status: individual.status
                });
              } else {
                acceptedReads++;
              }
            }

            // Match the real agent polling cadence:
            // await read(s), then sleep 900ms.
            await sleep(900);
          }
        })()
      );

      const simulatedSignedSend = (async () => {
        await sleep(1850);

        const send = await post(
          url,
          rpc(
            'synthetic-signed-once',
            'broadcast_tx_commit',
            ['LOCAL_SIMULATED_SIGNED_TX']
          )
        );

        assert.equal(send.status, 200);
        assert(send.durationMs < 3000);

        console.log(
          'SIMULATED_SIGNED_SEND_LATENCY_MS:',
          send.durationMs
        );
      })();

      await Promise.all([
        ...agents,
        simulatedSignedSend
      ]);

      const state = await health(url);

      assert.equal(failures.length, 0);
      assert.equal(maxActive, 1);
      assert.equal(signedSends, 1);
      assert(backupRequests >= 1);
      assert(acceptedReads >= 108);
      assert(state.coalesced_requests >= 8);
      assert.equal(state.queued, 0);
      assert.equal(state.pending, 0);
      assert.equal(state.distinct_signed_payloads, 1);

      const sorted = [...latencies].sort(
        (a,b) => a-b
      );

      const p95 = sorted[
        Math.floor((sorted.length - 1) * 0.95)
      ];

      assert(p95 < 9000);

      console.log(
        'SIMULATED_AGENT_PROCESSES: 10'
      );
      console.log(
        'POLLING_ROUNDS_PER_AGENT: 8'
      );
      console.log(
        'SUCCESSFUL_READS:', acceptedReads
      );
      console.log(
        'SIMULATED_PRIMARY_CALLS:',
        primaryRequests
      );
      console.log(
        'SIMULATED_FALLBACK_CALLS:',
        backupRequests
      );
      console.log(
        'READ_REQUESTS_COALESCED:',
        state.coalesced_requests
      );
      console.log(
        'P95_READ_LATENCY_MS:', p95
      );
      console.log(
        'MAX_CONCURRENT_UPSTREAM:', maxActive
      );
      console.log(
        'SIMULATED_SENDS:', signedSends
      );
      console.log(
        'READ_FAILURES:', failures.length
      );
    });
  }
);
