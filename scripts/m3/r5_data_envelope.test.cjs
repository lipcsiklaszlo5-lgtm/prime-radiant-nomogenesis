'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  load,
  makeWorkerResult
} = require('./r5_data_envelope.cjs');

const dataRoot = path.join(
  __dirname, '..', '..', 'demo', 'data'
);

const quantities = path.join(dataRoot, 'quantities.csv');
const prices = path.join(dataRoot, 'prices.csv');

test('CSV inputs produce bounded payloads and result', () => {
  const data = load(quantities, prices);

  assert.equal(data.total, 632n);
  assert.deepEqual(
    data.payloads.map(bytes => bytes.length),
    [33, 33]
  );

  assert(data.roots.every(bytes => bytes.length === 32));
  assert.notDeepEqual(data.roots[0], data.roots[1]);

  const caseId = Buffer.alloc(32, 7);
  const exact = makeWorkerResult(data, caseId, 2);
  const minimum = makeWorkerResult(data, caseId, 2, 600);

  assert.equal(exact.payload.length, 26);
  assert.equal(exact.payload.readBigUInt64BE(2), 2n);
  assert.equal(
    exact.payload.subarray(10).readBigUInt64BE(8),
    632n
  );

  assert.equal(exact.payload[1], 0x21);
  assert.equal(minimum.payload[1], 0x22);
  assert.notDeepEqual(exact.commitment, minimum.commitment);

  assert.notDeepEqual(
    exact.commitment,
    makeWorkerResult(
      data, Buffer.alloc(32, 8), 2
    ).commitment
  );
});

test('identical CSV files produce identical bytes', () => {
  const first = load(quantities, prices);
  const second = load(quantities, prices);

  assert.deepEqual(first.payloads, second.payloads);
  assert.deepEqual(first.roots, second.roots);
});

test('malformed, duplicated and mismatched data fails', () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'r5-data-')
  );

  try {
    const bad = path.join(temp, 'invalid.csv');

    for (const csv of [
      'item_id,unit_price\n8,5\n4,7\n',
      'item_id,unit_price\n4,5\n4,7\n',
      'item_id,unit_price\n4,5\n9,7\n15,3\n',
      'item_id,unit_price\n4,5\n8,-7\n15,3\n',
      'item_id,unit_price\n4,5\n8,18446744073709551616\n15,3\n'
    ]) {
      fs.writeFileSync(bad, csv);
      assert.throws(() => load(quantities, bad));
    }
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('bad job IDs and case IDs are rejected', () => {
  const data = load(quantities, prices);

  assert.throws(() =>
    makeWorkerResult(data, Buffer.alloc(31), 0)
  );

  assert.throws(() =>
    makeWorkerResult(data, Buffer.alloc(32), -1)
  );

  assert.throws(() =>
    makeWorkerResult(data, Buffer.alloc(32), 1, 0)
  );
});

test('funding and worker commitments match', () => {
  const {
    minimumCommitment
  } = require('./r5_data_envelope.cjs');

  const data = load(quantities, prices);
  const caseId = Buffer.alloc(32, 19);

  for (const threshold of [500n, 600n, 632n]) {
    const funded = minimumCommitment(
      caseId, threshold
    );

    const worker = makeWorkerResult(
      data, caseId, 7, threshold
    );

    assert.deepEqual(funded, worker.commitment);
  }
});
