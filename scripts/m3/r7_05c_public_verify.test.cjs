'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  verifyManifest,
  extract
} = require('./r7_05c_public_verify.cjs');

const evidence = JSON.parse(
  fs.readFileSync(
    'docs/evidence/R7-05C-public.json',
    'utf8'
  )
);

const wrapper = JSON.parse(
  fs.readFileSync(
    'docs/evidence/R7-05C-genesis-certificate.json',
    'utf8'
  )
);

const clone = x =>
  JSON.parse(JSON.stringify(x));

test('recorded evidence structure', () => {
  assert.doesNotThrow(
    () => verifyManifest(evidence, wrapper)
  );
});

test('duplicate transaction rejected', () => {
  const x = clone(evidence);

  x.transactions[1].tx =
    x.transactions[0].tx;

  assert.throws(
    () => verifyManifest(x, wrapper)
  );
});

test('forged certificate hash rejected', () => {
  const x = clone(wrapper);

  x.genesis_certificate.certificate_hash =
    '0'.repeat(64);

  assert.throws(
    () => verifyManifest(evidence, x)
  );
});

test('altered allocation rejected', () => {
  const x = clone(evidence);

  x.onchain_allocation_units = [5, 4, 3];

  assert.throws(
    () => verifyManifest(x, wrapper)
  );
});

test('altered signed args rejected', () => {
  const row = clone(
    evidence.transactions[0]
  );

  const raw = Buffer.from(
    JSON.stringify({
      descriptor: {descriptor_version: 1}
    })
  );

  const response = {
    transaction: {
      hash: row.tx,
      signer_id: row.signer,
      receiver_id: evidence.contract,
      actions: [{
        FunctionCall: {
          method_name: row.method,
          deposit: row.deposit,
          args: raw.toString('base64')
        }
      }]
    },
    status: {
      SuccessValue:
        Buffer.from('[]').toString('base64')
    },
    receipts_outcome: []
  };

  assert.throws(
    () => extract(row, response)
  );
});
