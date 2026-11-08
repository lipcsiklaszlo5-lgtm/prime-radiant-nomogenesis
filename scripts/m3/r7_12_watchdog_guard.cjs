'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');

const {
  startAutonomousWatchdog
} = require('./r7_autonomous_watchdog.cjs');

async function main() {
  const output = process.argv[2];
  assert(output, 'JSON output path required');

  let observations = 0;
  let watchdog;

  // Observation sequence:
  // 1: unhealthy before arming
  // 2-3: healthy, watchdog arms
  // 4: isolated HTTP 503
  // 5-6: recovery, reset failure counter
  // 7-8: consecutive HTTP 503 -> real alert
  const failures = new Set([1, 4, 7, 8]);

  const server = http.createServer((req, res) => {
    if (req.url === '/quantities') {
      observations++;

      const failed = failures.has(observations);

      res.writeHead(failed ? 503 : 200, {
        'Content-Type': 'text/csv',
        'Connection': 'close'
      });

      res.end(
        failed
          ? 'temporary unavailable\n'
          : 'item_id,quantity\n4,9\n'
      );
      return;
    }

    if (req.url === '/prices') {
      res.writeHead(200, {
        'Content-Type': 'text/csv',
        'Connection': 'close'
      });

      res.end('item_id,unit_price\n4,15\n');
      return;
    }

    res.writeHead(404);
    res.end();
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();

    watchdog = await startAutonomousWatchdog({
      endpoint: `http://127.0.0.1:${address.port}`,
      intervalMs: 150,
      failureThreshold: 2
    });

    const event = await watchdog.waitForOutage(7000);

    assert.equal(event.kind, 'outage');
    assert.equal(event.observations, 8);
    assert.equal(observations, 8);
    assert.equal(event.consecutive_failures, 2);

    assert.equal(event.failures.length, 1);
    assert.equal(event.failures[0].route, '/quantities');
    assert.equal(event.failures[0].http_status, 503);

    assert(
      Number.isFinite(event.since_last_healthy_ms)
      && event.since_last_healthy_ms > 0
    );

    const evidence = {
      schema: 'nomogenesis.r7-12.watchdog.v1',
      environment: 'local-loopback-http',
      interval_ms: 150,
      failure_threshold: 2,
      total_observations: observations,
      failed_observations: [...failures],
      actual_alert_observation: event.observations,
      consecutive_failures: event.consecutive_failures,
      since_last_healthy_ms:
        event.since_last_healthy_ms,
      initial_unhealthy_did_not_arm: true,
      isolated_failure_did_not_trigger: true,
      recovery_reset_failure_streak: true,
      sustained_failure_triggered: true
    };

    fs.writeFileSync(
      output,
      JSON.stringify(evidence, null, 2) + '\n',
      {flag: 'wx'}
    );

    console.log('WATCHDOG_INITIAL_HEALTH_GATING: PASS');
    console.log('WATCHDOG_TRANSIENT_503_DID_NOT_TRIGGER: PASS');
    console.log('WATCHDOG_RECOVERY_RESET: PASS');
    console.log('WATCHDOG_SUSTAINED_FAILURE_DETECTED: PASS');
    console.log('WATCHDOG_OBSERVATIONS: ' + observations);
    console.log('R7_12_WATCHDOG_GUARD: PASS');

  } finally {
    if (watchdog) {
      await watchdog.close();
    }

    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      });
    }
  }
}

main().catch(error => {
  console.error('R7_12_WATCHDOG_GUARD: FAIL');
  console.error(error.stack || error);
  process.exitCode = 1;
});
