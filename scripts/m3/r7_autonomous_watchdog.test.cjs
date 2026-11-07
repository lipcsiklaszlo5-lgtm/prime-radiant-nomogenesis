'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const http = require('node:http');

const {
  startAutonomousWatchdog
} = require('./r7_autonomous_watchdog.cjs');

async function service() {
  let errorOnce = false;

  const server = http.createServer(
    (request, response) => {
      if (
        errorOnce &&
        request.url === '/prices'
      ) {
        errorOnce = false;
        response.writeHead(503).end(
          'temporary outage'
        );
        return;
      }

      response.writeHead(200, {
        'content-type': 'text/csv'
      });

      response.end(
        request.url === '/quantities'
          ? 'item_id,quantity\n1,2\n'
          : 'item_id,unit_price\n1,10\n'
      );
    }
  );

  await new Promise(resolve =>
    server.listen(
      0, '127.0.0.1', resolve
    )
  );

  return {
    server,

    endpoint:
      `http://127.0.0.1:${server.address().port}`,

    blip() {
      errorOnce = true;
    },

    async stop() {
      if (server.listening) {
        await new Promise(resolve =>
          server.close(resolve)
        );
      }
    }
  };
}

test(
  'watchdog detects source shutdown automatically',
  async () => {
    const source = await service();
    let watchdog;

    try {
      watchdog = await startAutonomousWatchdog({
        endpoint: source.endpoint,
        intervalMs: 150
      });

      await source.stop();

      const event =
        await watchdog.waitForOutage(7000);

      assert.equal(event.kind, 'outage');
      assert.equal(
        event.consecutive_failures, 2
      );

      assert(
        event.failures.every(
          x => x.network_error === 'ECONNREFUSED'
        )
      );

      assert(
        event.since_last_healthy_ms >= 0
      );

      assert.notEqual(
        event.pid, process.pid
      );

    } finally {
      if (watchdog) await watchdog.close();
      await source.stop();
    }
  }
);

test(
  'transient 503 does not trigger recovery',
  async () => {
    const source = await service();
    let watchdog;

    try {
      watchdog = await startAutonomousWatchdog({
        endpoint: source.endpoint,
        intervalMs: 150
      });

      source.blip();

      await assert.rejects(
        watchdog.waitForOutage(950),
        /outage wait timeout/
      );

      await source.stop();

      assert.equal(
        (
          await watchdog.waitForOutage(7000)
        ).kind,
        'outage'
      );

    } finally {
      if (watchdog) await watchdog.close();
      await source.stop();
    }
  }
);

test(
  'rejects non-loopback endpoint',
  async () => {
    await assert.rejects(
      startAutonomousWatchdog({
        endpoint: 'https://example.com'
      }),
      /input did not match|regular expression/i
    );
  }
);
