'use strict';

const assert = require('node:assert/strict');
const {fork} = require('node:child_process');

const ROUTES = ['/quantities', '/prices'];

async function probe(endpoint, route) {
  const expected = route === '/quantities'
    ? 'item_id,quantity\n'
    : 'item_id,unit_price\n';

  try {
    const res = await fetch(endpoint + route, {
      signal: AbortSignal.timeout(1000),
      headers: {'cache-control': 'no-store'}
    });
    const body = await res.text();

    return {
      route,
      healthy: res.status === 200 &&
        body.startsWith(expected),
      http_status: res.status
    };
  } catch (error) {
    return {
      route,
      healthy: false,
      network_error:
        error.cause?.code || error.code || error.name
    };
  }
}

if (process.argv[2] === '--watchdog-child') {
  let active = false;
  let timer;
  let config;
  let startedAt;
  let armed = false;
  let healthyStreak = 0;
  let failedStreak = 0;
  let lastHealthyNs;
  let observations = 0;

  const send = event => process.send?.({
    ...event,
    pid: process.pid,
    monotonic_ns:
      process.hrtime.bigint().toString()
  });

  async function tick() {
    if (!active) return;

    const result = await Promise.all(
      ROUTES.map(route =>
        probe(config.endpoint, route)
      )
    );

    if (!active) return;

    observations++;
    const healthy = result.every(
      item => item.healthy
    );

    if (!armed) {
      healthyStreak = healthy
        ? healthyStreak + 1
        : 0;

      if (healthyStreak >= 2) {
        armed = true;
        lastHealthyNs = process.hrtime.bigint();

        send({
          kind: 'armed',
          observations
        });

      } else if (Date.now() - startedAt > 10000) {
        active = false;
        send({
          kind: 'error',
          reason: 'source did not become healthy'
        });
        return;
      }

    } else if (healthy) {
      failedStreak = 0;
      lastHealthyNs = process.hrtime.bigint();

    } else {
      failedStreak++;

      if (failedStreak >= config.failureThreshold) {
        active = false;

        send({
          kind: 'outage',
          consecutive_failures: failedStreak,
          observations,
          failures: result.filter(
            item => !item.healthy
          ),
          since_last_healthy_ms: Number(
            (process.hrtime.bigint() -
              lastHealthyNs) / 1000000n
          )
        });
        return;
      }
    }

    timer = setTimeout(() => {
      void tick().catch(error => {
        active = false;
        send({
          kind: 'error',
          reason: error.message
        });
      });
    }, config.intervalMs);
  }

  process.on('message', message => {
    if (message?.kind === 'stop') {
      active = false;
      clearTimeout(timer);
      process.exit(0);
    }

    if (message?.kind !== 'start') return;

    assert(!config, 'watchdog starts once');

    config = message.config;
    active = true;
    startedAt = Date.now();

    void tick().catch(error => {
      active = false;
      send({
        kind: 'error',
        reason: error.message
      });
    });
  });

} else {
  async function startAutonomousWatchdog({
    endpoint,
    intervalMs = 250,
    failureThreshold = 2
  }) {
    assert.match(
      endpoint,
      /^http:\/\/127\.0\.0\.1:\d{1,5}$/
    );

    assert(
      Number.isInteger(intervalMs) &&
      intervalMs >= 150 &&
      intervalMs <= 2000
    );

    assert(
      Number.isInteger(failureThreshold) &&
      failureThreshold >= 2 &&
      failureThreshold <= 5
    );

    const child = fork(
      __filename,
      ['--watchdog-child'],
      {
        stdio: [
          'ignore',
          'ignore',
          'inherit',
          'ipc'
        ]
      }
    );

    let closing = false;
    let ready = false;
    let observed = null;
    let fault = null;

    const waiters = new Set();

    let readyResolve;
    let readyReject;

    const readyPromise = new Promise(
      (resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      }
    );

    const readyTimer = setTimeout(
      () => fail(Error(
        'watchdog failed to arm within 15 seconds'
      )),
      15000
    );

    function fail(error) {
      if (closing || fault) return;

      fault = error;
      clearTimeout(readyTimer);

      if (!ready) readyReject(error);

      for (const waiter of waiters) {
        waiter.reject(error);
      }
      waiters.clear();
    }

    child.on('message', msg => {
      if (msg.kind === 'armed') {
        ready = true;
        clearTimeout(readyTimer);
        readyResolve(msg);

      } else if (msg.kind === 'outage') {
        observed = msg;

        for (const waiter of waiters) {
          waiter.resolve(msg);
        }
        waiters.clear();

      } else if (msg.kind === 'error') {
        fail(Error('watchdog: ' + msg.reason));
      }
    });

    child.on('error', fail);

    child.on('exit', (code, signal) => {
      if (!closing) {
        fail(Error(
          `watchdog exited ${code}/${signal}`
        ));
      }
    });

    child.send({
      kind: 'start',
      config: {
        endpoint,
        intervalMs,
        failureThreshold
      }
    });

    try {
      await readyPromise;
    } catch (error) {
      closing = true;
      child.kill('SIGKILL');
      throw error;
    }

    return {
      pid: child.pid,

      async waitForOutage(timeoutMs = 10000) {
        if (observed) return observed;
        if (fault) throw fault;

        assert(
          Number.isInteger(timeoutMs) &&
          timeoutMs > 0
        );

        return new Promise((resolve, reject) => {
          const waiter = {
            resolve(value) {
              clearTimeout(timer);
              waiters.delete(waiter);
              resolve(value);
            },

            reject(error) {
              clearTimeout(timer);
              waiters.delete(waiter);
              reject(error);
            }
          };

          const timer = setTimeout(
            () => waiter.reject(
              Error('outage wait timeout')
            ),
            timeoutMs
          );

          waiters.add(waiter);
        });
      },

      async close() {
        if (closing) return;

        closing = true;

        for (const waiter of waiters) {
          waiter.reject(
            Error('watchdog closed')
          );
        }
        waiters.clear();

        if (
          child.exitCode !== null ||
          child.signalCode !== null
        ) return;

        await new Promise(resolve => {
          const killTimer = setTimeout(
            () => child.kill('SIGKILL'),
            3000
          );

          child.once('exit', () => {
            clearTimeout(killTimer);
            resolve();
          });

          if (child.connected) {
            child.send({kind: 'stop'});
          } else {
            child.kill('SIGTERM');
          }
        });
      }
    };
  }

  module.exports = {
    startAutonomousWatchdog
  };
}
