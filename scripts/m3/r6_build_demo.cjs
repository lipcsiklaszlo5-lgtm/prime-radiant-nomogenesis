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
