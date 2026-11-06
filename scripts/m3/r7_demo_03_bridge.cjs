'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {fork} = require('node:child_process');

function launch(role) {
  return fork(
    path.join(__dirname, `r7_demo_03_${role}.cjs`),
    [],
    {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}
  );
}

function waitMessage(child, predicate, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(Error('IPC message timeout')),
      timeoutMs
    );

    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', finish);
    }

    function finish(error, value) {
      cleanup();
      if (error) reject(error);
      else resolve(value);
    }

    function onMessage(message) {
      if (predicate(message)) finish(null, message);
    }

    function onExit(code, signal) {
      finish(Error(`child exit: ${code}/${signal}`));
    }

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', finish);
  });
}

function waitExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null ||
      child.signalCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      signal: child.signalCode
    });
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(Error('child exit timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function onExit(code, signal) {
      cleanup();
      resolve({code, signal});
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function stop(child) {
  if (child.exitCode !== null ||
      child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode
    };
  }

  const result = waitExit(child);
  assert(child.kill('SIGTERM'));
  return result;
}

async function startServices() {
  const source = launch('source');
  const observer = launch('observer');

  try {
    const [origin, watcher] = await Promise.all([
      waitMessage(source, m => m.kind === 'source-ready'),
      waitMessage(observer, m => m.kind === 'observer-ready')
    ]);

    assert.equal(origin.pid, source.pid);
    assert.equal(watcher.pid, observer.pid);
    assert.notEqual(source.pid, observer.pid);

    let sequence = 0;

    return {
      endpoint: origin.endpoint,
      sourcePid: source.pid,
      observerPid: observer.pid,

      async probe(resource) {
        const id = ++sequence;
        const result = waitMessage(
          observer,
          m => m.kind === 'probe-result' && m.id === id
        );

        observer.send({
          kind: 'probe',
          id,
          endpoint: origin.endpoint,
          resource
        });

        return result;
      },

      async stopSource() {
        const result = await stop(source);
        assert.equal(result.signal, 'SIGTERM');
        return result;
      },

      async close() {
        await Promise.all([
          stop(source),
          stop(observer)
        ]);
      }
    };
  } catch (error) {
    for (const child of [source, observer]) {
      if (child.exitCode === null &&
          child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
    throw error;
  }
}

module.exports = {startServices};
