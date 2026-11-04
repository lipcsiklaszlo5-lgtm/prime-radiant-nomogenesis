'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

const sha = bytes =>
  crypto.createHash('sha256').update(bytes).digest();

function integer(raw, max) {
  assert.match(raw, /^(0|[1-9][0-9]*)$/, 'noncanonical integer');
  const value = BigInt(raw);
  assert(value <= max, 'integer overflow');
  return value;
}

function readCsv(filename, secondColumn) {
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.trimEnd().split(/\r?\n/);

  assert.equal(
    lines.shift(),
    `item_id,${secondColumn}`,
    'invalid CSV header'
  );

  assert(
    lines.length >= 1 && lines.length <= 16,
    'invalid record count'
  );

  let last = -1n;

  return lines.map(line => {
    const columns = line.split(',');
    assert.equal(columns.length, 2, 'invalid CSV columns');

    const id = integer(columns[0], 65535n);
    const value = integer(columns[1], U64_MAX);

    assert(id > last, 'IDs must be unique and ascending');

    last = id;
    return [id, value];
  });
}

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function u128(value) {
  assert(
    value >= 0n && value <= U128_MAX,
    'u128 out of range'
  );

  return Buffer.from(
    value.toString(16).padStart(32, '0'),
    'hex'
  );
}

function encode(kind, rows) {
  const payload = Buffer.alloc(3 + 10 * rows.length);

  payload[0] = 1;
  payload[1] = kind + 1;
  payload[2] = rows.length;

  rows.forEach(([id, value], i) => {
    payload.writeUInt16BE(Number(id), 3 + 10 * i);
    payload.writeBigUInt64BE(value, 5 + 10 * i);
  });

  return payload;
}

function merkle(kind, payload) {
  const metadata = Buffer.from([1, 0x7f, kind + 1]);

  const sibling = sha(Buffer.concat([
    Buffer.from([0]),
    u64(1n),
    Buffer.from([0, 0, 0, 3]),
    metadata
  ]));

  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);

  const leaf = sha(Buffer.concat([
    Buffer.from([0]),
    u64(0n),
    length,
    payload
  ]));

  const root = sha(Buffer.concat([
    Buffer.from([1]),
    leaf,
    sibling
  ]));

  return {sibling, root};
}

function componentFromCsv(filename, kind) {
  assert(kind === 0 || kind === 1, 'invalid component kind');

  const rows = readCsv(
    filename, kind === 0 ? 'quantity' : 'unit_price'
  );
  const payload = encode(kind, rows);
  const proof = merkle(kind, payload);

  return {rows, payload, sibling: proof.sibling, root: proof.root};
}

function minimumCommitment(caseId, threshold) {
  const id = Buffer.from(caseId);
  assert.equal(id.length, 32, 'case ID must be 32 bytes');

  const value = integer(String(threshold), U128_MAX);
  assert(value > 0n, 'zero threshold');

  return sha(Buffer.concat([
    Buffer.from('NOMOGENESIS/M3/MIN-SUM/V1\0'),
    id,
    u128(value)
  ]));
}

function load(quantitiesPath, pricesPath) {
  const quantityComponent = componentFromCsv(
    quantitiesPath, 0
  );
  const priceComponent = componentFromCsv(
    pricesPath, 1
  );

  const quantities = quantityComponent.rows;
  const prices = priceComponent.rows;

  assert.equal(
    quantities.length,
    prices.length,
    'component length mismatch'
  );

  let total = 0n;

  for (let i = 0; i < quantities.length; i++) {
    assert.equal(
      quantities[i][0],
      prices[i][0],
      'component item ID mismatch'
    );

    const product = quantities[i][1] * prices[i][1];

    assert(product <= U128_MAX, 'product overflow');

    total += product;

    assert(total <= U128_MAX, 'sum overflow');
  }

  const proofs = [quantityComponent, priceComponent];
  const payloads = proofs.map(p => p.payload);

  return {
    total,
    payloads,
    siblings: proofs.map(p => p.sibling),
    roots: proofs.map(p => p.root)
  };
}

function makeWorkerResult(data, caseId, jobId, threshold = null) {
  const id = Buffer.from(caseId);

  assert.equal(id.length, 32, 'case ID must be 32 bytes');

  const job = integer(String(jobId), U64_MAX);

  const minimum = threshold === null
    ? null
    : integer(String(threshold), U128_MAX);

  if (minimum !== null) {
    assert(minimum > 0n, 'zero threshold');
  }

  const payload = Buffer.concat([
    Buffer.from([
      1,
      minimum === null ? 0x21 : 0x22
    ]),
    u64(job),
    u128(data.total)
  ]);

  const domain = minimum === null
    ? 'NOMOGENESIS/M3/EXACT-SUM/V1\0'
    : 'NOMOGENESIS/M3/MIN-SUM/V1\0';

  const commitment = sha(Buffer.concat([
    Buffer.from(domain),
    id,
    minimum === null ? payload : u128(minimum)
  ]));

  return {payload, commitment};
}

module.exports = {
  load,
  makeWorkerResult,
  readCsv,
  componentFromCsv,
  minimumCommitment
};

if (require.main === module) {
  const root = path.join(
    __dirname, '..', '..', 'demo', 'data'
  );

  const data = load(
    path.join(root, 'quantities.csv'),
    path.join(root, 'prices.csv')
  );

  console.log(JSON.stringify({
    itemCount: data.payloads[0][2],
    computedTotal: data.total.toString(),
    componentRoots: data.roots.map(
      bytes => bytes.toString('hex')
    ),
    componentBytes: data.payloads.map(
      bytes => bytes.length
    )
  }, null, 2));
}
