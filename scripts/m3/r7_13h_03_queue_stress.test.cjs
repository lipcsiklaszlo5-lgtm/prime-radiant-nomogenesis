'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createRpcBroker} =
  require('./r7_13h_rpc_broker.cjs');

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const endpointA = 'https://mock-primary.testnet.invalid';
const endpointB = 'https://mock-secondary.testnet.invalid';

function request(id, key) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'query',
    params: {
      request_type: 'view_account',
      account_id: key
    }
  };
}

function response(message, result) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result
    }),
    {
      status: 200,
      headers: {'content-type': 'application/json'}
    }
  );
}

async function post(url, message) {
  const reply = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(8000)
  });

  return {
    status: reply.status,
    body: await reply.json()
  };
}

async function health(url) {
  const reply = await fetch(url + 'health');
  assert.equal(reply.status, 200);
  return reply.json();
}

async function exercise(options, work) {
  const broker = createRpcBroker(options);
  const url = await broker.listen();

  try {
    await work(url);
  } finally {
    await broker.close();
  }
}

test(
  '10-agent waves coalesce reads without mixing response IDs',
  async () => {
    let calls = 0;
    let active = 0;
    let maxActive = 0;

    await exercise({
      upstreams: [endpointA],
      minGapMs: 2,
      maxReadQueueWaitMs: 3000,

      fetchImpl: async (_url, opts) => {
        calls++;
        active++;
        maxActive = Math.max(active, maxActive);

        await sleep(60);

        active--;
        const m = JSON.parse(opts.body);

        return response(m, {
          key: m.params.account_id
        });
      }
    }, async url => {
      for (let wave = 0; wave < 12; wave++) {
        const key = `case-${wave}.testnet`;

        const result = await Promise.all(
          Array.from({length: 10}, (_, i) =>
            post(
              url,
              request(1000 + 10 * wave + i, key)
            )
          )
        );

        result.forEach((r, i) => {
          assert.equal(r.status, 200);
          assert.equal(
            r.body.id,
            1000 + 10 * wave + i
          );
          assert.equal(r.body.result.key, key);
        });
      }

      const h = await health(url);

      assert(
        h.coalesced_requests >= 80,
        'insufficient coalescing'
      );
      assert.equal(h.queued, 0);
      assert.equal(h.pending, 0);
    });

    assert.equal(maxActive, 1);
    assert(
      calls <= 40,
      'excess upstream calls: ' + calls
    );
  }
);

test(
  'signed send takes priority over waiting read requests',
  async () => {
    let entered;
    let unblock;

    const started = new Promise(resolve => {
      entered = resolve;
    });

    const gate = new Promise(resolve => {
      unblock = resolve;
    });

    const order = [];

    try {
      await exercise({
        upstreams: [endpointA],
        minGapMs: 0,

        fetchImpl: async (_url, opts) => {
          const m = JSON.parse(opts.body);

          order.push(m.method + ':' + m.id);

          if (m.id === 1) {
            entered();
            await gate;
          }

          return response(m, {ok: true});
        }
      }, async url => {
        const first = post(
          url,
          request(1, 'first.testnet')
        );

        await started;

        const reads = Array.from(
          {length: 8},
          (_, i) => post(
            url,
            request(i + 2, `next-${i}.testnet`)
          )
        );

        await sleep(35);

        const send = post(url, {
          jsonrpc: '2.0',
          id: 99,
          method: 'broadcast_tx_commit',
          params: ['signed-test-bytes']
        });

        await sleep(35);

        const h = await health(url);

        assert(h.queued_reads >= 1);
        assert.equal(h.queued_writes, 1);

        unblock();

        const completed = await Promise.all([
          first,
          ...reads,
          send
        ]);

        assert(
          completed.every(r => r.status === 200)
        );
        assert.equal(
          order[1],
          'broadcast_tx_commit:99'
        );
        assert.equal(
          (await health(url)).queued,
          0
        );
      });
    } finally {
      if (unblock) unblock();
    }
  }
);

test(
  'stale queued read expires before any upstream dispatch',
  async () => {
    let calls = 0;
    let entered;

    const started = new Promise(resolve => {
      entered = resolve;
    });

    await exercise({
      upstreams: [endpointA],
      minGapMs: 0,
      maxReadQueueWaitMs: 30,

      fetchImpl: async (_url, opts) => {
        calls++;
        const m = JSON.parse(opts.body);

        if (m.id === 1) {
          entered();
          await sleep(100);
        }

        return response(m, {ok: true});
      }
    }, async url => {
      const first = post(
        url,
        request(1, 'first.testnet')
      );

      await started;

      const second = post(
        url,
        request(2, 'stale.testnet')
      );

      const [a, b] = await Promise.all([
        first,
        second
      ]);

      assert.equal(a.status, 200);
      assert.equal(b.status, 503);
      assert.match(
        b.body.error.message,
        /deadline expired/
      );
    });

    assert.equal(calls, 1);
  }
);

test(
  'bounded queue rejects overload without extra upstream dispatch',
  async () => {
    let entered;
    let unblock;

    const started = new Promise(resolve => {
      entered = resolve;
    });

    const gate = new Promise(resolve => {
      unblock = resolve;
    });

    let calls = 0;

    try {
      await exercise({
        upstreams: [endpointA],
        minGapMs: 0,
        maxQueued: 2,

        fetchImpl: async (_url, opts) => {
          calls++;
          const m = JSON.parse(opts.body);

          if (m.id === 1) {
            entered();
            await gate;
          }

          return response(m, {ok: true});
        }
      }, async url => {
        const first = post(
          url,
          request(1, 'a.testnet')
        );

        await started;

        const second = post(
          url,
          request(2, 'b.testnet')
        );

        for (let i = 0; i < 20; i++) {
          if ((await health(url)).queued === 2) {
            break;
          }
          await sleep(5);
        }

        assert.equal(
          (await health(url)).queued,
          2
        );

        const rejected = await post(
          url,
          request(3, 'c.testnet')
        );

        assert.equal(rejected.status, 503);
        assert.match(
          rejected.body.error.message,
          /queue full/
        );

        unblock();

        const results = await Promise.all([
          first,
          second
        ]);

        assert(
          results.every(r => r.status === 200)
        );
      });
    } finally {
      if (unblock) unblock();
    }

    assert.equal(calls, 2);
  }
);

test(
  '429 burst on read has bounded retry and healthy fallback',
  async () => {
    let primary = 0;
    let secondary = 0;

    await exercise({
      upstreams: [endpointA, endpointB],
      minGapMs: 0,
      retryPauseMs: 1,

      fetchImpl: async (url, opts) => {
        const m = JSON.parse(opts.body);

        if (url === endpointA) {
          primary++;
          await sleep(4);

          return new Response(
            'limited',
            {status: 429}
          );
        }

        secondary++;
        await sleep(75);

        return response(m, {
          chain_id: 'testnet'
        });
      }
    }, async url => {
      const all = await Promise.all(
        Array.from({length: 10}, (_, i) =>
          post(url, {
            jsonrpc: '2.0',
            id: i + 1,
            method: 'status',
            params: []
          })
        )
      );

      assert(all.every((r, i) =>
        r.status === 200 &&
        r.body.id === i + 1 &&
        r.body.result.chain_id === 'testnet'
      ));

      assert(
        (await health(url)).coalesced_requests > 0
      );
    });

    assert.equal(primary, 2);
    assert.equal(secondary, 1);
  }
);

test(
  'simultaneous duplicate signed submissions are never retried',
  async () => {
    let primary = 0;
    let secondary = 0;

    await exercise({
      upstreams: [endpointA, endpointB],
      minGapMs: 0,
      retryPauseMs: 0,

      fetchImpl: async url => {
        if (url === endpointA) {
          primary++;
          await sleep(30);
        } else {
          secondary++;
        }

        return new Response(
          'limited',
          {status: 429}
        );
      }
    }, async url => {
      const all = await Promise.all(
        Array.from({length: 10}, (_, i) =>
          post(url, {
            jsonrpc: '2.0',
            id: i + 1,
            method: 'broadcast_tx_commit',
            params: ['same-signed-payload']
          })
        )
      );

      assert.equal(
        all.filter(x => x.status === 503).length,
        1
      );

      assert.equal(
        all.filter(x => x.status === 409).length,
        9
      );

      assert.equal(
        (await health(url)).distinct_signed_payloads,
        1
      );
    });

    assert.equal(primary, 1);
    assert.equal(secondary, 0);
  }
);

test(
  'transport failure retries read a bounded number of times',
  async () => {
    let calls = 0;

    await exercise({
      upstreams: [endpointA],
      minGapMs: 0,
      retryPauseMs: 0,

      fetchImpl: async () => {
        calls++;

        const error = new Error(
          'mock connection terminated'
        );
        error.name = 'AbortError';

        throw error;
      }
    }, async url => {
      const r = await post(
        url,
        request(13, 'failed.testnet')
      );

      assert.equal(r.status, 503);
      assert.match(
        r.body.error.message,
        /unavailable/
      );
    });

    assert.equal(calls, 2);
  }
);
