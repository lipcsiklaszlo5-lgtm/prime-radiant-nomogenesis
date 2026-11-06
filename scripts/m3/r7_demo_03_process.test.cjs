'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fork} = require('node:child_process');
const path = require('node:path');

function spawn(role) {
  return fork(
    path.join(__dirname, `r7_demo_03_${role}.cjs`),
    [],
    {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}
  );
}

function waitMessage(child, match, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(Error('IPC response timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
    }

    function onMessage(message) {
      if (!match(message)) return;
      cleanup();
      resolve(message);
    }

    function onExit(code, signal) {
      cleanup();
      reject(Error(`child exited: ${code}/${signal}`));
    }

    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

let sequence = 0;

async function probe(observer, endpoint, resource) {
  const id = ++sequence;
  const response = waitMessage(
    observer,
    message => message.kind === 'probe-result' &&
      message.id === id
  );

  observer.send({kind: 'probe', id, endpoint, resource});
  return response;
}

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) =>
      resolve({code, signal})
    );
  });

  assert(child.kill('SIGTERM'));

  return Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('termination timeout')), 5000)
    )
  ]);
}

function event(kind, details) {
  console.log('R7_EVENT ' + JSON.stringify({
    kind,
    ...details
  }));
}

test('real source process termination is externally observed',
  {timeout: 20000},
  async () => {
    const source = spawn('source');
    const observer = spawn('observer');

    try {
      const [origin, watcher] = await Promise.all([
        waitMessage(source, m => m.kind === 'source-ready'),
        waitMessage(observer, m => m.kind === 'observer-ready')
      ]);

      assert.equal(origin.pid, source.pid);
      assert.equal(watcher.pid, observer.pid);
      assert.notEqual(origin.pid, observer.pid);
      assert.notEqual(origin.pid, process.pid);
      assert.notEqual(watcher.pid, process.pid);

      event('SOURCE_STARTED', {
        sourcePid: origin.pid,
        observerPid: watcher.pid
      });

      for (const resource of ['/quantities', '/prices']) {
        const result = await probe(
          observer, origin.endpoint, resource
        );

        assert.equal(result.httpStatus, 200);
        assert.equal(result.csvValid, true);
        assert.equal(result.observerPid, watcher.pid);
      }

      event('SOURCE_HEALTHY', {
        result: 'HTTP_200',
        observerPid: watcher.pid
      });

      const stoppedAt = process.hrtime.bigint();
      const exit = await terminate(source);

      assert.equal(exit.signal, 'SIGTERM');

      event('SOURCE_PROCESS_EXITED', {
        sourcePid: origin.pid,
        signal: exit.signal
      });

      for (const resource of ['/quantities', '/prices']) {
        const result = await probe(
          observer, origin.endpoint, resource
        );

        assert.equal(result.httpStatus, undefined);
        assert.equal(result.networkError, 'ECONNREFUSED');
        assert.equal(result.observerPid, watcher.pid);
      }

      const observedMs = Number(
        (process.hrtime.bigint() - stoppedAt) / 1000000n
      );

      event('SOURCE_FAILURE_OBSERVED', {
        observerPid: watcher.pid,
        error: 'ECONNREFUSED',
        elapsedWallMs: observedMs
      });

      console.log(
        'R7-DEMO-03/01 REAL PROCESS FAILURE: PASS'
      );
    } finally {
      for (const child of [source, observer]) {
        if (child.exitCode === null &&
            child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }
    }
  }
);
