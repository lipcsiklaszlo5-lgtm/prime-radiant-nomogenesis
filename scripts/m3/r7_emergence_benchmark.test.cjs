'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  allocate,
  selectPair,
  evaluate,
  scenarios
} = require('./r7_emergence_benchmark.cjs');

const byId = Object.fromEntries(
  scenarios().map(s => [s.id, s])
);

test('reference capped allocation is 4+4+4', () => {
  assert.deepEqual(
    allocate(12, [5, 5, 5]),
    [4, 4, 4]
  );

  assert.equal(
    allocate(12, [2, 2, 2]),
    null
  );
});

test('joint recovery creates feasible coordination', () => {
  const r = evaluate(byId['joint-only']);

  assert.deepEqual(r.best, ['nomogenesis']);
  assert.deepEqual(
    r.results.nomogenesis.allocation,
    [4, 4, 4]
  );

  assert.equal(r.results.individual.feasible, false);
  assert.equal(r.results.nomogenesis.netValue, 33);
});

test('prebooked reserve can beat joint rescue', () => {
  const r = evaluate(byId['reserve-wins']);

  assert.deepEqual(r.best, ['fullReserve']);

  assert(
    r.results.fullReserve.netValue >
    r.results.nomogenesis.netValue
  );
});

test('fast cheaper spot replacement can win', () => {
  const r = evaluate(byId['spot-wins']);

  assert.deepEqual(r.best, ['reactiveJointSearch']);

  assert(
    r.results.reactiveJointSearch.netValue >
    r.results.nomogenesis.netValue
  );
});

test('insufficient total authority stops rescue', () => {
  const r = evaluate(byId.unfundable);

  assert.deepEqual(r.best, []);

  for (const outcome of Object.values(r.results)) {
    assert.equal(outcome.feasible, false);
  }
});

test('underbonded and same-provider offers fail', () => {
  const s = structuredClone(byId['joint-only']);

  s.offers[0].bond = 11;

  assert.equal(
    selectPair(s.offers, s.deadline),
    null
  );

  s.offers[0].bond = 12;
  s.offers[1].provider = s.offers[0].provider;

  assert.equal(
    selectPair(s.offers, s.deadline),
    null
  );
});

test('distinct providers may reuse a slot name', () => {
  const s = structuredClone(byId['joint-only']);
  s.offers[1].slot = s.offers[0].slot;

  assert.deepEqual(
    selectPair(s.offers, s.deadline),
    { price: 12, offers: [s.offers[0].id, s.offers[1].id] }
  );
});

test('individual buyer can fund when cap allows', () => {
  const s = structuredClone(byId['joint-only']);

  s.buyers[0].cap = 12;

  const r = evaluate(s);

  assert.equal(r.results.individual.feasible, true);
  assert.equal(r.results.individual.payer, 'buyer0');
});

test('no buyer pays more than their own value', () => {
  const s = structuredClone(byId['joint-only']);

  s.buyers[0].value = 1;

  const r = evaluate(s);

  assert.equal(r.results.nomogenesis.feasible, false);
});

test('deterministic simulation is reproducible', () => {
  const first = JSON.stringify(
    scenarios().map(evaluate)
  );

  const second = JSON.stringify(
    scenarios().map(evaluate)
  );

  assert.equal(first, second);
});
