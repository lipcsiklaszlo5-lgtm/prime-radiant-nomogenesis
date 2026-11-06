'use strict';

const assert = require('node:assert/strict');

const MAX = 1000000;

function natural(value, name) {
  assert(
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX,
    'invalid ' + name
  );
  return value;
}

function allocate(price, caps) {
  natural(price, 'price');

  const total = caps.reduce((sum, cap) =>
    sum + natural(cap, 'cap'), 0
  );

  if (total < price) return null;

  const allocations = caps.map(() => 0);
  let remaining = price;

  while (remaining > 0) {
    const active = caps
      .map((cap, i) =>
        cap > allocations[i] ? i : -1
      )
      .filter(i => i !== -1);

    assert(active.length > 0);

    const share = Math.floor(
      remaining / active.length
    );

    const remainder = remaining % active.length;
    let progress = 0;

    active.forEach((i, order) => {
      const contribution = Math.min(
        caps[i] - allocations[i],
        share + (order < remainder ? 1 : 0)
      );

      allocations[i] += contribution;
      progress += contribution;
    });

    assert(progress > 0);
    remaining -= progress;
  }

  assert.equal(
    allocations.reduce((a, b) => a + b, 0),
    price
  );

  return allocations;
}

function selectPair(offers, deadline) {
  const pairs = [];

  for (const a of offers.filter(
    offer => offer.component === 0
  )) {
    for (const b of offers.filter(
      offer => offer.component === 1
    )) {
      const price = a.fee + b.fee;

      if (
        a.provider === b.provider ||
        (a.provider === b.provider && a.slot === b.slot) ||
        a.bond < price ||
        b.bond < price ||
        a.readyAt > deadline ||
        b.readyAt > deadline
      ) continue;

      pairs.push({
        price,
        offers: [a.id, b.id]
      });
    }
  }

  pairs.sort((a, b) =>
    a.price - b.price ||
    a.offers[0].localeCompare(b.offers[0]) ||
    a.offers[1].localeCompare(b.offers[1])
  );

  return pairs[0] || null;
}

function evaluate(s) {
  assert(
    s && typeof s.id === 'string' &&
    s.id.length > 0
  );

  natural(s.deadline, 'deadline');

  assert(
    Array.isArray(s.buyers) &&
    s.buyers.length >= 1 &&
    s.buyers.length <= 6
  );

  assert(
    Array.isArray(s.offers) &&
    s.offers.length <= 6
  );

  const caps = s.buyers.map(b =>
    natural(b.cap, 'buyer cap')
  );

  const values = s.buyers.map(b =>
    natural(b.value, 'job value')
  );

  const totalValue = values.reduce(
    (a, b) => a + b, 0
  );

  for (const offer of s.offers) {
    assert(
      offer.component === 0 ||
      offer.component === 1
    );

    assert(
      typeof offer.provider === 'string' &&
      typeof offer.slot === 'string' &&
      typeof offer.id === 'string'
    );

    natural(offer.fee, 'offer fee');
    natural(offer.bond, 'offer bond');
    natural(offer.readyAt, 'offer readiness');
  }

  assert.equal(
    new Set(s.offers.map(o => o.id)).size,
    s.offers.length
  );

  function affordable(cost) {
    const allocations = allocate(cost, caps);

    if (!allocations) return null;

    // No buyer pays above their own modelled
    // economic value of saving the blocked job.
    if (allocations.some(
      (n, i) => n > values[i]
    )) return null;

    return allocations;
  }

  const rejected = reason => ({
    feasible: false,
    netValue: 0,
    cost: 0,
    lockedCapital: 0,
    reason
  });

  const results = {};
  const winner = selectPair(
    s.offers,
    s.deadline
  );

  if (winner) {
    const allocation = affordable(winner.price);

    results.nomogenesis = allocation
      ? {
          feasible: true,
          netValue: totalValue - winner.price,
          cost: winner.price,
          lockedCapital: 3 * winner.price,
          allocation,
          pair: winner.offers
        }
      : rejected('collective budget or value limit');

    const single = s.buyers.find(
      b =>
        b.cap >= winner.price &&
        b.value >= winner.price
    );

    results.individual = single
      ? {
          feasible: true,
          netValue: totalValue - winner.price,
          cost: winner.price,
          lockedCapital: 3 * winner.price,
          payer: single.id
        }
      : rejected('no individual can fund complete rescue');

  } else {
    results.nomogenesis = rejected(
      'no bonded complete in-time offer pair'
    );

    results.individual = rejected(
      'no bonded complete in-time offer pair'
    );
  }

  const reserve = s.reserve;

  natural(reserve.bookingFee, 'booking fee');
  natural(reserve.activationFee, 'activation fee');
  natural(reserve.readyAt, 'reserve readiness');

  const reserveCost =
    reserve.bookingFee + reserve.activationFee;

  const reservation = (
    reserve.available &&
    reserve.readyAt <= s.deadline
  ) ? affordable(reserveCost) : null;

  results.fullReserve = reservation
    ? {
        feasible: true,
        netValue: totalValue - reserveCost,
        cost: reserveCost,
        lockedCapital: reserveCost,
        allocation: reservation
      }
    : rejected('standby unavailable or unaffordable');

  const spot = s.spot;

  natural(spot.cost, 'spot price');
  natural(spot.readyAt, 'spot readiness');

  const spotAllocation = (
    spot.available &&
    spot.readyAt <= s.deadline
  ) ? affordable(spot.cost) : null;

  results.reactiveJointSearch = spotAllocation
    ? {
        feasible: true,
        netValue: totalValue - spot.cost,
        cost: spot.cost,
        lockedCapital: spot.cost,
        allocation: spotAllocation
      }
    : rejected('spot too late or unaffordable');

  const bestNetValue = Math.max(
    0,
    ...Object.values(results)
      .filter(r => r.feasible)
      .map(r => r.netValue)
  );

  const best = Object.entries(results)
    .filter(([, r]) =>
      r.feasible &&
      r.netValue === bestNetValue
    )
    .map(([name]) => name);

  return {
    id: s.id,
    deadline: s.deadline,
    results,
    best,
    bestNetValue
  };
}

function scenarios() {
  const buyers = [0, 1, 2].map(i => ({
    id: 'buyer' + i,
    cap: 5,
    value: 15
  }));

  const offers = [
    {
      id: 'quantities',
      component: 0,
      provider: 'provider-q',
      slot: 'q-slot',
      fee: 6,
      bond: 12,
      readyAt: 1
    },
    {
      id: 'prices',
      component: 1,
      provider: 'provider-p',
      slot: 'p-slot',
      fee: 6,
      bond: 12,
      readyAt: 1
    }
  ];

  const base = {
    deadline: 2,
    buyers,
    offers,
    reserve: {
      available: true,
      bookingFee: 8,
      activationFee: 6,
      readyAt: 0
    },
    spot: {
      available: true,
      cost: 9,
      readyAt: 3
    }
  };

  return [
    {
      ...structuredClone(base),
      id: 'joint-only'
    },
    {
      ...structuredClone(base),
      id: 'reserve-wins',
      reserve: {
        available: true,
        bookingFee: 3,
        activationFee: 6,
        readyAt: 0
      }
    },
    {
      ...structuredClone(base),
      id: 'spot-wins',
      spot: {
        available: true,
        cost: 8,
        readyAt: 1
      }
    },
    {
      ...structuredClone(base),
      id: 'unfundable',
      buyers: buyers.map(b => ({
        ...b,
        cap: 1
      }))
    }
  ];
}

function main() {
  const report = {
    model: 'R7-01-exploratory',
    data: 'synthetic',
    empirical_market_claim: false,
    scenario_count: scenarios().length,
    results: scenarios().map(evaluate),
    limitations: [
      'Buyer values are assumed, not measured',
      'All scenarios contain a failed dependency',
      'Services are assumed equivalent after delivery',
      'Agent strategic responses are not modelled',
      'Standby and spot collateral risks differ',
      'This is not actual NEAR transaction evidence'
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

module.exports = {
  allocate,
  selectPair,
  evaluate,
  scenarios
};

if (require.main === module) main();
