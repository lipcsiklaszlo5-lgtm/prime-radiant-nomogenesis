'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/evidence/R6-05-public.json'),
  'utf8'
));

const template = fs.readFileSync(
  path.join(root, 'demo/nomogenesis_jury_demo.template.html'),
  'utf8'
);


const firstWitness = JSON.parse(fs.readFileSync(
  path.join(
    root, 'docs/evidence/R7-02B-01-transaction-witness.json'
  ), 'utf8'
));

const second = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/evidence/R7-05C-public.json'),
  'utf8'
));

const secondCert = JSON.parse(fs.readFileSync(
  path.join(
    root, 'docs/evidence/R7-05C-genesis-certificate.json'
  ), 'utf8'
)).genesis_certificate;

assert.deepEqual(
  firstWitness.genesis_certificate.minimal_coalitions,
  [[1, 2, 3]]
);

assert.equal(second.transaction_count, 17);
assert.deepEqual(second.caps_units, [7, 7, 7]);

assert.deepEqual(
  second.minimal_coalitions,
  [[4, 5], [4, 6], [5, 6]]
);

assert.equal(
  second.certificate_hash,
  secondCert.certificate_hash
);

assert.equal(
  second.transactions.find(x => x.step === 'award').tx,
  '8xcW4BQutqeokHGpajkSUaMy6F3tMkvFDo7U9hDg3XTG'
);

assert.equal(manifest.transactions.length, 17);
assert.equal(
  new Set(manifest.transactions.map(x => x.tx)).size,
  17
);
assert.equal(template.split('__MANIFEST__').length, 2);

const evidence = JSON.stringify({
  transactions: manifest.transactions
}).replaceAll('<', '\\u003c');

const html = template.replace('__MANIFEST__', evidence);

assert(html.includes('function allocate(limits,cost)'));
assert(html.includes('Change the inputs.'));
assert(!html.includes('private_key'));
assert(!html.includes('/workspaces/'));

fs.writeFileSync(
  path.join(root, 'demo/nomogenesis_jury_demo.html'),
  html
);

console.log('WHITE INTERACTIVE DEMO BUILD: PASS');
