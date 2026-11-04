const assert = require('node:assert/strict');
const fs = require('node:fs');

const input = process.argv[2];
assert(input, 'Missing Sandbox evidence log');

const log = fs.readFileSync(input, 'utf8');

assert(
  log.includes('=== M2/07E/2A TRANSITION MATRIX: PASS ==='),
  'Source matrix is not verified PASS'
);

const BOND_BYTES = 2048n;
const BUFFER_BYTES = 2048n;
const YOCTO = 10n ** 24n;

function positiveInteger(value) {
  assert.match(value, /^\d+$/);
  return BigInt(value);
}

function parse() {
  const rows = [];
  const samples = new Map();

  for (const line of log.split('\n')) {
    if (line.startsWith('TRANSITION ')) {
      const m = line.match(
        /^TRANSITION (\S+) net=(-?\d+) added=\d+ removed=\d+ changed=\d+ categories=(.*)$/
      );

      assert(m, 'Malformed transition: ' + line);

      const categories = new Map();

      for (const part of m[3].split(',')) {
        const entry = part.match(
          /^([a-z_]+):(-?\d+)$/
        );

        assert(entry, part);
        assert(!categories.has(entry[1]));

        categories.set(
          entry[1], BigInt(entry[2])
        );
      }

      const net = BigInt(m[2]);

      assert.equal(
        [...categories.values()]
          .reduce((a, b) => a + b, 0n),
        net
      );

      rows.push({
        label: m[1],
        net,
        categories
      });
    }

    if (line.startsWith('BACKING_SAMPLE ')) {
      const payload = JSON.parse(
        line.slice('BACKING_SAMPLE '.length)
      );

      assert.equal(typeof payload.label, 'string');
      assert(!samples.has(payload.label));

      const sample = {label: payload.label};

      for (const key of [
        'bytePrice', 'balance', 'bytes',
        'economic', 'collateral', 'reserve',
        'claimable', 'pending'
      ]) {
        sample[key] = positiveInteger(payload[key]);
      }

      samples.set(sample.label, sample);
    }
  }

  assert.equal(rows.length, 21);
  assert.equal(samples.size, 22);
  assert(samples.has('baseline'));

  return {rows, samples};
}

function required(sample, storageLiabilityBytes) {
  const money = sample.economic
    + sample.collateral
    + sample.claimable
    + sample.pending;

  return (
    (sample.bytes + BUFFER_BYTES) * sample.bytePrice
    + money
    + storageLiabilityBytes * sample.bytePrice
  );
}

function reconcile(rows, samples) {
  const baseline = samples.get('baseline');
  assert(baseline);

  const q = baseline.bytePrice;

  assert(q > 0n);
  assert.equal(baseline.reserve, 0n);

  let cumulativeBytes = 0n;
  let sharedBytes = 0n;
  let registeredBonds = 0n;
  let releasedBytes = 0n;

  const trace = [];

  for (const row of rows) {
    const sample = samples.get(row.label);

    assert(sample, 'Missing sample: ' + row.label);
    assert.equal(sample.bytePrice, q);

    cumulativeBytes += row.net;

    assert.equal(
      sample.bytes - baseline.bytes,
      cumulativeBytes,
      'Account storage mismatch: ' + row.label
    );

    const shared = row.categories.get(
      'shared_or_unknown'
    ) || 0n;

    // The existing fixture creates its single
    // shared state entry with the first task.
    if (row.label === 'task_create_0') {
      assert.equal(shared, 360n);
    } else {
      assert.equal(shared, 0n);
    }

    sharedBytes += shared;

    if (
      /^(task_create_|task_fund_|offer_post_|offer_fund_)/
        .test(row.label)
    ) {
      registeredBonds++;
    }

    if (/^offer_release_/.test(row.label)) {
      assert(row.net < 0n);
      releasedBytes -= row.net;
    }

    assert.equal(sample.reserve % q, 0n);

    const recordedReserveBytes = sample.reserve / q;

    assert.equal(
      recordedReserveBytes,
      registeredBonds * BOND_BYTES - releasedBytes,
      'On-chain reserve mismatch: ' + row.label
    );

    // This formula is valid for the verified
    // fixture, not for arbitrary future lifecycles.
    const consumed = cumulativeBytes - sharedBytes;
    const unused = recordedReserveBytes - consumed;

    assert(consumed >= 0n);
    assert(unused >= 0n);

    const financial = sample.economic
      + sample.collateral
      + sample.claimable
      + sample.pending;

    // Actual physical solvency check, without
    // the optional future-payout buffer.
    assert(
      sample.balance >=
        sample.bytes * q + financial + sample.reserve,
      'Measured physical backing violated: ' + row.label
    );

    const conservative = sample.balance -
      required(sample, recordedReserveBytes);

    const shadow = sample.balance -
      required(sample, unused);

    assert.equal(
      shadow - conservative,
      consumed * q,
      'Double-counting identity failed'
    );

    trace.push({
      label: row.label,
      sample,
      consumed,
      unused,
      conservative,
      shadow
    });

    console.log(
      'BACKING_TRACK',
      row.label,
      'consumed=' + consumed,
      'unused=' + unused,
      'conservative=' + conservative,
      'shadow=' + shadow
    );
  }

  assert.equal(registeredBonds, 12n);
  assert.equal(releasedBytes, 182n);
  assert.equal(sharedBytes, 360n);
  assert.equal(cumulativeBytes, 2442n);

  const last = trace.at(-1);

  assert.equal(last.consumed, 2082n);
  assert.equal(last.unused, 22312n);
  assert.equal(last.sample.reserve / q, 24394n);

  // The tested funded deployment must remain
  // within the original conservative guard.
  assert(trace.every(x => x.conservative >= 0n));

  return {baseline, q, trace, last};
}

const {rows, samples} = parse();

console.log('=== LIVE SANDBOX BACKING RECONCILIATION ===');

const result = reconcile(rows, samples);

const {baseline, q, trace, last} = result;

console.log('=== SYNTHETIC TREASURY MARGIN STRESS ===');

const originalMargin =
  baseline.balance - baseline.bytes * q;

assert(originalMargin >= 0n);

const margins = [
  0n,
  15n * 10n ** 21n,
  6n * 10n ** 22n,
  originalMargin
];

for (const margin of margins) {
  assert(margin <= originalMargin);

  // Counterfactual: remove initial treasury
  // funding while holding all observed gas
  // and transaction balance changes fixed.
  const reduction = originalMargin - margin;

  const conservativeMin = trace.reduce(
    (min, t) => {
      const value = t.conservative - reduction;
      return min === null || value < min ? value : min;
    },
    null
  );

  const shadowMin = trace.reduce(
    (min, t) => {
      const value = t.shadow - reduction;
      return min === null || value < min ? value : min;
    },
    null
  );

  assert(shadowMin >= conservativeMin);

  console.log(
    'CAPITAL_SCENARIO',
    'initial_margin=' + margin,
    'conservative_min=' + conservativeMin,
    'shadow_min=' + shadowMin,
    'conservative_pass=' + (conservativeMin >= 0n),
    'shadow_pass=' + (shadowMin >= 0n)
  );

  if (margin === 0n) {
    // At startup, the 2048-byte payout buffer
    // is not funded in a zero-margin scenario.
    assert(
      margin - BUFFER_BYTES * q < 0n,
      'Zero-margin buffer unexpectedly funded'
    );
  }
}

console.log('=== FUTURE MUTATION BUDGET ===');

const unused = last.unused;

for (const future of [
  0n, 2048n, 4096n, 8192n,
  unused, unused + 1n
]) {
  if (future > unused) {
    console.log(
      'FUTURE_REJECTED',
      'requested=' + future,
      'available=' + unused
    );
    continue;
  }

  // Use retained unused capacity to finance
  // additional physical storage. No new bond.
  const hypothetical = {
    ...last.sample,
    bytes: last.sample.bytes + future
  };

  const newUnused = unused - future;

  const newRequired = required(
    hypothetical, newUnused
  );

  assert.equal(
    last.sample.balance - newRequired,
    last.shadow
  );

  console.log(
    'FUTURE_COVERED',
    'bytes=' + future,
    'remaining_unused=' + newUnused
  );
}

// A hypothetical refund cannot consume capacity
// that a future valid mutation still requires.
const futureNeed = 2048n;

assert(unused > futureNeed);

function canReturn(bytes) {
  return bytes >= 0n
    && bytes <= unused
    && unused - bytes >= futureNeed;
}

assert(canReturn(unused - futureNeed));
assert(!canReturn(unused - futureNeed + 1n));
assert(!canReturn(unused + 1n));

console.log(
  'FUTURE_RESERVE_BOUNDARY',
  'minimum_future=' + futureNeed,
  'largest_conditional_release=' + (unused - futureNeed),
  'status=MODEL_ONLY'
);

// Moving unused reserve into a claimable balance
// does NOT create new free capital.
const simulatedRefund = 1000n;

const afterCredit = {
  ...last.sample,
  claimable: last.sample.claimable
    + simulatedRefund * q
};

assert.equal(
  required(afterCredit, unused - simulatedRefund),
  required(last.sample, unused)
);

console.log(
  'REFUND_CONVERSION',
  'bytes=' + simulatedRefund,
  'new_free_capital=0'
);

console.log('=== ADVERSARIAL BACKING TESTS ===');

function mustReject(name, mutate) {
  const copy = new Map(
    [...samples.entries()].map(
      ([key, value]) => [key, {...value}]
    )
  );

  mutate(copy);

  assert.throws(
    () => reconcile(rows, copy),
    'Tampered backing was accepted: ' + name
  );

  console.log('REJECTED', name);
}

mustReject('forged_storage_usage', copy => {
  copy.get('task_fund_0').bytes += 1n;
});

mustReject('fabricated_reserve', copy => {
  copy.get('task_fund_0').reserve += q;
});

mustReject('unbacked_account_balance', copy => {
  copy.get('task_create_0').balance = 0n;
});

mustReject('wrong_storage_price', copy => {
  copy.get('offer_fund_1_1').bytePrice += 1n;
});

mustReject('missing_transition_snapshot', copy => {
  copy.delete('offer_release_0');
});

console.log('=== M2/07E/2B/2A BACKING MODEL: PASS ===');
console.log(
  'ZERO-CAPITAL SCENARIOS ARE COUNTERFACTUAL, ' +
  'NOT ZERO-MARGIN SANDBOX DEPLOYMENTS'
);
console.log(
  'DESIGN ONLY — ON-CHAIN GUARD AND REFUNDS UNCHANGED'
);
