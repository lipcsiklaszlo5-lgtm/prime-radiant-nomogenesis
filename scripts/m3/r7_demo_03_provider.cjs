'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {componentFromCsv} = require('./r5_data_envelope.cjs');

assert(process.send, 'provider requires isolated IPC');
assert.match(process.argv[2] || '', /^(0|1)$/);

const index = Number(process.argv[2]);
const filename = [
  'quantities.csv',
  'prices.csv'
][index];

const backup = path.resolve(
  __dirname,
  '../../demo/backups/r7-demo-03',
  `provider-${index}`,
  filename
);

// Only the commitment leaves this process at startup.
const committed = componentFromCsv(backup, index).root;

process.send({
  kind: 'provider-ready',
  index,
  pid: process.pid,
  root: Array.from(committed)
});

process.on('message', request => {
  if (request.kind !== 'deliver') return;

  try {
    assert.equal(request.index, index);
    assert(Number.isSafeInteger(request.id));

    // Read our own backup from disk at delivery time.
    const item = componentFromCsv(backup, index);

    assert.deepEqual(
      item.root,
      committed,
      'backup no longer matches initial commitment'
    );

    process.send({
      kind: 'provider-delivery',
      id: request.id,
      index,
      pid: process.pid,
      root: Array.from(item.root),
      payload: Array.from(item.payload),
      sibling: Array.from(item.sibling)
    });
  } catch (error) {
    process.send({
      kind: 'provider-delivery',
      id: request.id,
      index,
      pid: process.pid,
      error: error.message
    });
  }
});
