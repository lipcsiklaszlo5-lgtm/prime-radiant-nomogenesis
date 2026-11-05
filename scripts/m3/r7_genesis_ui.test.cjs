'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(
  'demo/nomogenesis_jury_demo.html', 'utf8'
);

const script = html.match(
  /<script>([\s\S]*?)<\/script>/
);

assert(script);

const start = script[1].indexOf('function formation(');
const end = script[1].indexOf('function drawBuyers(');

assert(start >= 0 && end > start);

const formation = new Function(
  script[1].slice(start, end) +
  '\nreturn formation;'
)();

test('Genesis UI is valid standalone JavaScript', () => {
  new vm.Script(script[1]);

  assert.match(html, /Seven coalitions/);
  assert.match(html, /id="coalition-grid"/);
  assert.match(html, /id="coalition-summary"/);
  assert.match(html, /R7-02B-01-transaction-witness.json/);
  assert.match(html, /R7-02B-03-award-transition.json/);
});

test('historical reference: exactly one minimal coalition', () => {
  const rows = formation([5, 5, 5], 12);

  assert.equal(rows.length, 7);
  assert.equal(rows.filter(x => x.viable).length, 1);

  assert.deepEqual(
    rows.filter(x => x.minimal).map(x => x.members),
    [[1, 2, 3]]
  );
});

test('general case: multiple minimal coalitions', () => {
  const rows = formation([7, 7, 7], 12);

  assert.deepEqual(
    rows.filter(x => x.minimal).map(x => x.members),
    [[1, 2], [1, 3], [2, 3]]
  );
});

test('single buyer and insufficient funding', () => {
  assert.deepEqual(
    formation([12, 2], 12)
      .filter(x => x.minimal)
      .map(x => x.members),
    [[1]]
  );

  assert.equal(
    formation([2, 2, 2], 12)
      .filter(x => x.viable).length,
    0
  );
});

test('bounded six-buyer market enumerates 63 subsets', () => {
  assert.equal(
    formation([5, 5, 5, 5, 5, 5], 12).length,
    63
  );
});
