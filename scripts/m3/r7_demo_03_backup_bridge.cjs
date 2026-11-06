'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {fork} = require('node:child_process');

function receive(child, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => done(Error('provider IPC timeout')),
      10000
    );

    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function done(error, message) {
      cleanup();
      if (error) reject(error);
      else resolve(message);
    }

    function onMessage(message) {
      if (predicate(message)) done(null, message);
    }

    function onExit(code, signal) {
      done(Error(`provider exited: ${code}/${signal}`));
    }

    function onError(error) {
      done(error);
    }

    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function terminate(child) {
  if (child.exitCode !== null ||
      child.signalCode !== null) return;

  const finished = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Error('provider termination timeout'));
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  assert(child.kill('SIGTERM'));
  await finished;
}

async function startBackupProviders() {
  const children = [0, 1].map(index =>
    fork(
      path.join(__dirname, 'r7_demo_03_provider.cjs'),
      [String(index)],
      {stdio: ['ignore', 'inherit', 'inherit', 'ipc']}
    )
  );

  try {
    const ready = await Promise.all(
      children.map((child, index) =>
        receive(
          child,
          message =>
            message.kind === 'provider-ready' &&
            message.index === index
        )
      )
    );

    for (let i = 0; i < 2; i++) {
      assert.equal(ready[i].pid, children[i].pid);
      assert.equal(ready[i].root.length, 32);
    }

    assert.notEqual(children[0].pid, children[1].pid);

    let sequence = 0;

    return {
      pids: children.map(child => child.pid),
      commitments: ready.map(item => item.root),

      async deliver(index) {
        assert(index === 0 || index === 1);

        const child = children[index];
        const id = ++sequence;

        const response = receive(
          child,
          message =>
            message.kind === 'provider-delivery' &&
            message.id === id
        );

        child.send({kind: 'deliver', index, id});

        const item = await response;

        if (item.error) throw Error(item.error);

        assert.equal(item.pid, child.pid);
        assert.equal(item.index, index);
        assert.deepEqual(item.root, ready[index].root);
        assert.equal(item.sibling.length, 32);
        assert(item.payload.length > 3);

        return item;
      },

      async close() {
        await Promise.all(children.map(terminate));
      }
    };
  } catch (error) {
    for (const child of children) {
      if (child.exitCode === null &&
          child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
    throw error;
  }
}

module.exports = {startBackupProviders};
