'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');

const html = fs.readFileSync(
  path.join(root, 'demo/nomogenesis_jury_demo.html'),
  'utf8'
);

const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/evidence/R6-05-public.json'),
  'utf8'
));

test('white UI and interactive controls', () => {
  assert.match(html, /background:#fafaf9/);
  assert.match(html, /Change the inputs/);
  assert.match(html, /id="price"/);
  assert.match(html, /id="buyers"/);
  assert.match(html, /function allocate/);
  assert.doesNotMatch(html, /private_key/);
});

test('all public transactions embedded', () => {
  const match = html.match(
    /<script type="application\/json" id="manifest">([\s\S]*?)<\/script>/
  );

  assert(match);
  const embedded = JSON.parse(match[1]);

  assert.deepEqual(
    embedded.transactions,
    manifest.transactions
  );

  assert.equal(embedded.transactions.length, 17);
});

test('actual capped-equal simulation', () => {
  const script = html.match(
    /<script>([\s\S]*?)<\/script>/
  );

  assert(script);
  new vm.Script(script[1]);

  const start = script[1].indexOf('function allocate(');
  const end = script[1].indexOf('function drawBuyers(');

  assert(start >= 0 && end > start);

  const allocate = new Function(
    script[1].slice(start, end) +
    '\nreturn allocate;'
  )();

  assert.deepEqual(
    allocate([5, 5, 5], 12),
    {ok: true, total: 15, values: [4, 4, 4]}
  );

  assert.equal(
    allocate([2, 2, 2], 12).ok,
    false
  );

  assert.deepEqual(
    allocate([5, 0, 7], 12).values,
    [5, 0, 7]
  );
});
