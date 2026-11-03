const assert = require('node:assert/strict');
const fs = require('node:fs');

const BOND = 2048n;

const logfile = process.argv[2];
assert(logfile, 'Missing transition log');

const log = fs.readFileSync(logfile, 'utf8');

assert(
  log.includes('=== M2/07E/2A TRANSITION MATRIX: PASS ==='),
  'Transition source did not pass'
);

function parse() {
  const rows = [];
  const retained = new Map();

  for (const line of log.split('\n')) {
    if (line.startsWith('TRANSITION ')) {
      const m = line.match(
        /^TRANSITION (\S+) net=(-?\d+) added=\d+ removed=\d+ changed=\d+ categories=(.*)$/
      );
      assert(m, line);

      const cats = new Map();

      for (const part of m[3].split(',')) {
        const c = part.match(/^([a-z_]+):(-?\d+)$/);
        assert(c, part);
        assert(!cats.has(c[1]));
        cats.set(c[1], BigInt(c[2]));
      }

      const net = BigInt(m[2]);
      const sum = [...cats.values()].reduce(
        (a, b) => a + b, 0n
      );

      assert.equal(sum, net);
      rows.push({label: m[1], net, cats});
    }

    if (line.startsWith('RETAINED ')) {
      const m = line.match(
        /^RETAINED (\S+) records=(\d+) bytes=(\d+)$/
      );
      assert(m, line);
      assert(!retained.has(m[1]));
      retained.set(m[1], {
        count: Number(m[2]),
        bytes: BigInt(m[3])
      });
    }
  }

  return {rows, retained};
}

function verifyRetained(retained) {
  const expected = new Map([
    ['task', [2, 334n]],
    ['task_creation_bond', [2, 186n]],
    ['task_funding', [2, 270n]],
    ['offer', [4, 460n]],
    ['offer_creation_bond', [4, 384n]],
    ['settled', [2, 112n]],
    ['claimable', [4, 336n]],
    ['shared_or_unknown', [1, 257n]]
  ]);

  assert.equal(retained.size, expected.size);

  for (const [kind, [count, bytes]] of expected) {
    const row = retained.get(kind);
    assert(row, 'Missing retained category: ' + kind);
    assert.equal(row.count, count);
    assert.equal(row.bytes, bytes);
  }
}

function audit(rows, retained) {
  verifyRetained(retained);

  assert.equal(rows.length, 21);

  const seen = new Set();
  const finalized = new Set();
  const claimProviders = new Set();
  const bonds = new Map();

  let shared = 0n;
  let physical = 0n;

  function checkCats(row, expected) {
    const actual = Object.fromEntries(
      [...row.cats].filter(([, n]) => n !== 0n)
    );

    assert.deepEqual(
      actual, expected, 'Wrong categories: ' + row.label
    );
  }

  function register(key, owner) {
    assert(!bonds.has(key), 'Duplicate bond: ' + key);

    bonds.set(key, {
      owner,
      total: BOND,
      consumed: 0n,
      unused: BOND,
      released: 0n
    });
  }

  function move(key, from, to, amount) {
    assert(amount > 0n);
    const b = bonds.get(key);
    assert(b, 'Missing bond: ' + key);

    assert(
      b[from] >= amount,
      key + ': insufficient ' + from
    );

    b[from] -= amount;
    b[to] += amount;
  }

  function consume(key, amount) {
    move(key, 'unused', 'consumed', amount);
  }

  function restore(key, amount) {
    move(key, 'consumed', 'unused', amount);
  }

  function credit(key, amount) {
    move(key, 'unused', 'released', amount);
  }

  for (const row of rows) {
    assert(!seen.has(row.label), 'Duplicate transition');
    seen.add(row.label);

    const label = row.label;
    let m;

    if ((m = label.match(/^task_create_([01])$/))) {
      const i = Number(m[1]);

      checkCats(row, i === 0 ? {
        shared_or_unknown: 257n,
        task_creation_bond: 93n,
        task: 167n
      } : {
        task_creation_bond: 93n,
        task: 167n
      });

      register('tc' + i, 'buyer_' + i);
      consume('tc' + i, 260n);

      if (i === 0) shared += 257n;

    } else if ((m = label.match(/^task_fund_([01])$/))) {
      const i = Number(m[1]);

      checkCats(row, {task_funding: 135n});

      register('tf' + i, 'buyer_' + i);
      consume('tf' + i, 135n);

    } else if (/^primary_accept_[01]$/.test(label)) {
      checkCats(row, {});

    } else if ((m = label.match(/^offer_post_([01])_([01])$/))) {
      const i = Number(m[1]);
      const j = Number(m[2]);
      const id = i * 2 + j;
      const owner = (i + j) % 2 === 0
        ? 'reserve_a' : 'reserve_b';

      checkCats(row, {
        offer_creation_bond: 96n,
        offer: 115n
      });

      register('oc' + id, owner);
      consume('oc' + id, 211n);

    } else if ((m = label.match(/^offer_fund_([01])_([01])$/))) {
      const i = Number(m[1]);
      const j = Number(m[2]);
      const id = i * 2 + j;
      const owner = (i + j) % 2 === 0
        ? 'reserve_a' : 'reserve_b';

      checkCats(row, {offer_funding: 88n});

      register('of' + id, owner);
      consume('of' + id, 88n);

    } else if ((m = label.match(/^task_cancel_([01])$/))) {
      const i = Number(m[1]);

      checkCats(row, {
        claimable: 83n,
        settled: 56n
      });

      consume('tf' + i, 139n);

    } else if ((m = label.match(/^offer_release_([0-3])$/))) {
      const id = Number(m[1]);
      const key = 'of' + id;
      const bond = bonds.get(key);

      assert(bond, 'Missing offer funding bond');
      assert(!finalized.has(key), 'Repeat finalization');

      const firstClaim = !claimProviders.has(bond.owner);
      const claimBytes = firstClaim ? 85n : 0n;

      checkCats(row, firstClaim ? {
        claimable: 85n,
        offer_funding: -88n
      } : {
        offer_funding: -88n
      });

      // Delete the original 88-byte funding record.
      restore(key, 88n);

      // The first claimable record remains persistent.
      if (firstClaim) {
        consume(key, 85n);
        claimProviders.add(bond.owner);
      }

      // Only the observed net freed storage is
      // already credited back to the provider.
      credit(key, 88n - claimBytes);
      finalized.add(key);

    } else if (label === 'native_withdrawal') {
      checkCats(row, {});

    } else {
      assert.fail('Unknown transition: ' + label);
    }

    physical += row.net;

    let consumed = 0n;

    for (const [key, b] of bonds) {
      assert.equal(
        b.total,
        b.consumed + b.unused + b.released,
        'Bond conservation: ' + key
      );
      consumed += b.consumed;
    }

    assert.equal(
      consumed + shared,
      physical,
      'Physical attribution mismatch at ' + label
    );
  }

  assert.equal(bonds.size, 12);
  assert.equal(finalized.size, 4);
  assert.equal(claimProviders.size, 2);

  const totals = {
    total: 0n,
    consumed: 0n,
    unused: 0n,
    released: 0n
  };

  for (const b of bonds.values()) {
    for (const key of Object.keys(totals)) {
      totals[key] += b[key];
    }
  }

  assert.equal(totals.total, 24576n);
  assert.equal(totals.consumed, 2082n);
  assert.equal(totals.unused, 22312n);
  assert.equal(totals.released, 182n);

  assert.equal(shared, 257n);
  assert.equal(physical, 2339n);

  // On-chain storage_reserves remains conservative.
  // This is an accounting comparison, NOT a payout.
  const currentRecordedReserve = 24576n - 182n;

  assert.equal(currentRecordedReserve, 24394n);
  assert.equal(
    currentRecordedReserve - totals.unused,
    totals.consumed
  );

  return {bonds, totals, shared, physical};
}

function cloneRows(rows) {
  return rows.map(row => ({
    label: row.label,
    net: row.net,
    cats: new Map(row.cats)
  }));
}

const {rows, retained} = parse();

console.log('=== ORIGINAL STORAGE COST POLICY ===');

const result = audit(rows, retained);

for (const [key, b] of result.bonds) {
  console.log(
    'POLICY_BOND',
    key,
    'owner=' + b.owner,
    'consumed=' + b.consumed,
    'unused=' + b.unused,
    'released=' + b.released
  );
}

console.log(
  'POLICY_TOTALS',
  'total=' + result.totals.total,
  'consumed=' + result.totals.consumed,
  'unused=' + result.totals.unused,
  'released=' + result.totals.released,
  'shared=' + result.shared
);

console.log('=== ADVERSARIAL POLICY TESTS ===');

function mustReject(name, mutate) {
  const copy = cloneRows(rows);
  mutate(copy);

  assert.throws(
    () => audit(copy, retained),
    'Tampered policy accepted: ' + name
  );

  console.log('REJECTED', name);
}

mustReject('duplicate_transition', copy => {
  copy[copy.length - 1].label = copy[0].label;
});

mustReject('double_claimable_allocation', copy => {
  const row = copy.find(x => x.label === 'offer_release_1');
  assert(row);

  row.cats.set('claimable', 85n);
  row.net += 85n;
});

mustReject('misassigned_shared_storage', copy => {
  const row = copy.find(x => x.label === 'task_create_0');
  assert(row);

  row.cats.set('shared_or_unknown', 0n);
  row.cats.set('task', 424n);
});

mustReject('forged_released_amount', copy => {
  const row = copy.find(x => x.label === 'offer_release_3');
  assert(row);

  row.net -= 1n;
});

mustReject('missing_funding_record', copy => {
  const index = copy.findIndex(
    x => x.label === 'offer_fund_0_0'
  );
  assert(index >= 0);
  copy.splice(index, 1);
});

console.log('=== M2/07E/2B/1 POLICY MODEL: PASS ===');
console.log('DESIGN ONLY — NO ON-CHAIN REFUND AUTHORIZATION');
