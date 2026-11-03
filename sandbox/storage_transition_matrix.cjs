const assert = require('node:assert/strict');
const { Worker } = require('near-workspaces');

const UNIT = 10n ** 23n;
const BYTE_COUNT = 2048n;
const ZERO = 0n;

// NEAR key/value storage accounting overhead.
// Must be checked against observed storage_usage deltas.
const ENTRY_OVERHEAD = 40n;
const OFFER_PREFIX = Buffer.from('offerdep');
const CLAIM_PREFIX = Buffer.from('claims');

async function main() {
  let worker;

  try {
    worker = await Worker.init();

    assert.match(
      worker.config.rpcAddr,
      /^http:\/\/127\.0\.0\.1:\d+$/
    );

    const root = worker.rootAccount;
    const wasm = process.env.NOMOGENESIS_WASM;

    assert(wasm, 'Missing WASM path');

    async function rawAccount(account) {
      const response = await fetch(worker.config.rpcAddr, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'query',
          params: {
            request_type: 'view_account',
            account_id: account.accountId,
            finality: 'optimistic'
          }
        })
      });

      assert(response.ok);

      const reply = await response.json();

      if (reply.error) {
        throw new Error(JSON.stringify(reply.error));
      }

      return {
        bytes: BigInt(reply.result.storage_usage),
        balance: BigInt(reply.result.amount)
      };
    }

    const probe = await root.devDeploy(wasm);

    const bond = BigInt(
      await probe.view('storage_reserve_required', {})
    );

    assert.equal(bond % BYTE_COUNT, ZERO);

    const byteCost = bond / BYTE_COUNT;
    assert(byteCost > ZERO);

    const startStake =
      (await rawAccount(probe)).bytes * byteCost;

    // 0.12 NEAR free margin above WASM storage stake.
    const margin = 12n * 10n ** 22n;

    const contract = await root.devDeploy(wasm, {
      initialBalance: startStake + margin
    });

    const initial = await rawAccount(contract);

    assert.equal(initial.balance, startStake + margin);

    const buyers = [
      await root.createSubAccount('buyer_a'),
      await root.createSubAccount('buyer_b')
    ];

    const sellers = [
      await root.createSubAccount('reserve_a'),
      await root.createSubAccount('reserve_b')
    ];

    const primary = await root.createSubAccount('primary');
    const outsider = await root.createSubAccount('outsider');

    const claim = async who => BigInt(
      await contract.view('get_claimable', {
        account: who.accountId
      })
    );

    async function rawStorage() {
      const response = await fetch(worker.config.rpcAddr, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'query',
          params: {
            request_type: 'view_state',
            account_id: contract.accountId,
            prefix_base64: '',
            include_proof: false,
            finality: 'optimistic'
          }
        })
      });

      assert(response.ok);

      const payload = await response.json();

      if (payload.error) {
        throw new Error(JSON.stringify(payload.error));
      }

      assert(Array.isArray(payload.result.values));

      const result = new Map();

      for (const item of payload.result.values) {
        assert.equal(typeof item.key, 'string');
        assert.equal(typeof item.value, 'string');

        const entry = {
          key: Buffer.from(item.key, 'base64'),
          value: Buffer.from(item.value, 'base64')
        };

        assert(entry.key.length > 0);
        assert(!result.has(item.key));

        result.set(item.key, entry);
      }

      return result;
    }

    function storageDifference(before, after) {
      const added = [];
      const removed = [];
      const changed = [];

      for (const [id, previous] of before) {
        const current = after.get(id);

        if (!current) {
          removed.push(previous);
        } else if (!previous.value.equals(current.value)) {
          changed.push({previous, current});
        }
      }

      for (const [id, current] of after) {
        if (!before.has(id)) {
          added.push(current);
        }
      }

      const entryBytes = item =>
        BigInt(item.key.length + item.value.length) +
        ENTRY_OVERHEAD;

      const addedBytes = added.reduce(
        (sum, item) => sum + entryBytes(item), ZERO
      );

      const removedBytes = removed.reduce(
        (sum, item) => sum + entryBytes(item), ZERO
      );

      const changedBytes = changed.reduce(
        (sum, item) =>
          sum + BigInt(
            item.current.value.length -
            item.previous.value.length
          ),
        ZERO
      );

      return {
        added,
        removed,
        changed,
        addedBytes,
        removedBytes,
        changedBytes,
        netBytes: addedBytes - removedBytes + changedBytes
      };
    }

    async function snapshot() {
      const account = await rawAccount(contract);

      const escrow = (
        await contract.view('escrow_totals', {})
      ).map(BigInt);

      const payout = (
        await contract.view('payout_totals', {})
      ).map(BigInt);

      const ledger = [...escrow, ...payout]
        .reduce((a, b) => a + b, ZERO);

      const surplus =
        account.balance - account.bytes * byteCost - ledger;

      assert(
        surplus >= ZERO,
        `Negative contract backing: ${surplus}`
      );

      return {...account, escrow, payout, ledger, surplus};
    }


    const transitionRows = [];

    const kinds = [
      ['task_creation_bond', 'taskbond'],
      ['offer_creation_bond', 'offerbond'],
      ['task_funding', 'taskdep'],
      ['offer_funding', 'offerdep'],
      ['task', 'tasks'],
      ['offer', 'offers'],
      ['settled', 'settled'],
      ['claimable', 'claims'],
      ['slot_lock', 'locks'],
      ['pending', 'pending']
    ];

    function category(entry) {
      for (const [kind, prefix] of kinds) {
        if (entry.key.subarray(
          0, Buffer.byteLength(prefix)
        ).equals(Buffer.from(prefix))) {
          return kind;
        }
      }
      return 'shared_or_unknown';
    }

    const entryBytes = entry =>
      BigInt(entry.key.length + entry.value.length) +
      ENTRY_OVERHEAD;

    async function traceTransition(label, action) {
      const before = await rawStorage();
      const beforeAccount = await rawAccount(contract);

      const result = await action();

      const after = await rawStorage();
      const afterAccount = await rawAccount(contract);

      const diff = storageDifference(before, after);

      assert.equal(
        diff.netBytes,
        afterAccount.bytes - beforeAccount.bytes,
        label + ': storage accounting mismatch'
      );

      const byKind = new Map();

      const add = (kind, delta) => {
        byKind.set(
          kind,
          (byKind.get(kind) || ZERO) + delta
        );
      };

      for (const item of diff.added) {
        add(category(item), entryBytes(item));
      }

      for (const item of diff.removed) {
        add(category(item), -entryBytes(item));
      }

      for (const item of diff.changed) {
        add(
          category(item.current),
          BigInt(
            item.current.value.length -
            item.previous.value.length
          )
        );
      }

      const classified = [...byKind.values()]
        .reduce((a, b) => a + b, ZERO);

      assert.equal(classified, diff.netBytes);

      const details = [...byKind.entries()]
        .map(([kind, bytes]) => kind + ':' + bytes)
        .join(',');

      transitionRows.push({
        label,
        net: diff.netBytes,
        added: diff.added.length,
        removed: diff.removed.length,
        changed: diff.changed.length,
        details
      });

      console.log(
        'TRANSITION',
        label,
        'net=' + diff.netBytes,
        'added=' + diff.added.length,
        'removed=' + diff.removed.length,
        'changed=' + diff.changed.length,
        'categories=' + (details || 'none')
      );

      return result;
    }

    const start = await snapshot();

    console.log('=== TWO BUYERS, TWO RESERVE PROVIDERS ===');
    console.log('Initial balance:', start.balance.toString());
    console.log('Initial free margin:', start.surplus.toString());

    const now = Date.now();
    const tasks = [];
    const offers = [];

    for (let i = 0; i < 2; i++) {
      const buyer = buyers[i];

      const taskId = Number(await traceTransition(`task_create_${i}`, () => buyer.call(
        contract,
        'create_task',
        {
          primary: primary.accountId,
          root: Array(32).fill(i + 1),
          height: 2,
          index: 2,
          primary_deadline: (now + 600000) * 1e6,
          reserve_deadline: (now + 1200000) * 1e6
        },
        {attachedDeposit: bond.toString()}
      )));

      tasks.push(taskId);

      await traceTransition(`task_fund_${i}`, () => buyer.call(contract, 'fund_task', {
        task_id: taskId,
        primary_reward: (20n * UNIT).toString(),
        reserve_reward: (10n * UNIT).toString(),
        option_premium: (3n * UNIT).toString(),
        keeper_bounty: (2n * UNIT).toString()
      }, {
        attachedDeposit: (35n * UNIT + bond).toString()
      }));

      await traceTransition(`primary_accept_${i}`, () =>
        primary.call(contract, 'accept_primary', {
          task_id: taskId
        })
      );

      for (let j = 0; j < 2; j++) {
        const seller = sellers[(i + j) % 2];

        const offerId = Number(await traceTransition(`offer_post_${i}_${j}`, () => seller.call(
          contract,
          'post_offer',
          {
            task_id: taskId,
            slot_id: `audit_${i}_${j}`,
            expires_at: (now + 500000) * 1e6
          },
          {attachedDeposit: bond.toString()}
        )));

        await traceTransition(`offer_fund_${i}_${j}`, () => seller.call(contract, 'fund_offer', {
          offer_id: offerId,
          collateral: (13n * UNIT).toString()
        }, {
          attachedDeposit: (13n * UNIT + bond).toString()
        }));

        offers.push({id: offerId, seller, taskId});

        assert.deepEqual(
          await contract.view('offer_storage_bond', {
            offer_id: offerId
          }),
          [seller.accountId, bond.toString()]
        );
      }

      assert.deepEqual(
        await contract.view('task_storage_bond', {
          task_id: taskId
        }),
        [buyer.accountId, bond.toString()]
      );
    }

    let state = await snapshot();

    assert.deepEqual(
      state.escrow,
      [70n * UNIT, 52n * UNIT, 12n * bond]
    );

    assert.deepEqual(state.payout, [ZERO, ZERO]);

    console.log('=== REJECT FOREIGN EARLY RELEASE ===');

    const beforeDenial = await snapshot();

    await assert.rejects(() => outsider.call(
      contract,
      'release_unaccepted_offer',
      {offer_id: offers[0].id}
    ));

    await assert.rejects(() => sellers[0].call(
      contract,
      'release_unaccepted_offer',
      {offer_id: offers[1].id}
    ));

    const afterDenial = await snapshot();

    assert.equal(afterDenial.bytes, beforeDenial.bytes);
    assert.deepEqual(afterDenial.escrow, beforeDenial.escrow);
    assert.deepEqual(afterDenial.payout, beforeDenial.payout);

    console.log('Unauthorized early release: REJECTED');

    console.log('=== CANCEL UNMATCHED TASKS ===');

    for (let i = 0; i < 2; i++) {
      await traceTransition(`task_cancel_${i}`, () =>
        buyers[i].call(contract, 'cancel_unmatched', {
          task_id: tasks[i]
        })
      );

      assert.equal(await claim(buyers[i]), 35n * UNIT);

      assert.equal(
        await contract.view('is_task_settled', {
          task_id: tasks[i]
        }),
        true
      );
    }

    state = await snapshot();

    assert.deepEqual(
      state.escrow,
      [ZERO, 52n * UNIT, 12n * bond]
    );

    assert.deepEqual(
      state.payout,
      [70n * UNIT, ZERO]
    );

    console.log('=== OUTSIDER RELEASES OTHER USERS OFFERS ===');

    const rebates = [ZERO, ZERO];

    // Interleaved order: reserve B, A, B, A.
    const order = JSON.parse(process.env.RELEASE_ORDER || '[2,0,1,3]');

    assert(Array.isArray(order), 'Release order must be an array');
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      [0, 1, 2, 3],
      'Each offer must occur exactly once'
    );

    console.log('Release order:', JSON.stringify(order));

    // By offer ID:
    // 0 = buyer, 1 = foreign provider,
    // 2 = outsider, 3 = original provider.
    const releaseActors = [
      buyers[0], sellers[0], outsider, sellers[0]
    ];

    // Every replay uses a different account.
    const replayActors = [
      outsider, buyers[0], sellers[1], buyers[1]
    ];

    const releasedIds = new Set();
    const keyAttributions = [];

    for (const index of order) {
      const offer = offers[index];
      const ownerIndex = sellers.indexOf(offer.seller);
      const otherIndex = 1 - ownerIndex;
      const releaser = releaseActors[index];
      const replayer = replayActors[index];

      assert.notEqual(
        releaser.accountId,
        replayer.accountId
      );

      assert(!releasedIds.has(offer.id));

      assert.equal(
        await contract.view('is_task_settled', {
          task_id: offer.taskId
        }),
        true
      );

      const original = await contract.view(
        'get_offer', {offer_id: offer.id}
      );

      assert.equal(original.status, 'Available');
      assert.equal(original.reserve, offer.seller.accountId);

      assert.equal(
        await contract.view('is_offer_collateralized', {
          offer_id: offer.id
        }),
        true
      );

      const pre = await snapshot();
      const preOwner = await claim(offer.seller);
      const preOther = await claim(sellers[otherIndex]);
      const preOutsider = await claim(outsider);
      const preBuyers = await Promise.all(buyers.map(claim));
      const beforeKeys = await rawStorage();

      await traceTransition(`offer_release_${offer.id}`, () =>
        releaser.call(
          contract,
          'release_unaccepted_offer',
          {offer_id: offer.id}
        )
      );

      const post = await snapshot();
      const afterKeys = await rawStorage();

      const keys = storageDifference(
        beforeKeys, afterKeys
      );

      // Reconstruct physical storage_usage from the
      // actual persisted key/value differences.
      assert.equal(
        keys.netBytes,
        post.bytes - pre.bytes,
        'Raw KV delta does not match NEAR storage_usage'
      );

      // Exactly one offer funding record must disappear.
      assert.equal(keys.removed.length, 1);

      const deleted = keys.removed[0];

      assert(
        deleted.key.subarray(
          0, OFFER_PREFIX.length
        ).equals(OFFER_PREFIX),
        'Deleted key is not an offer deposit'
      );

      const suffix = deleted.key.subarray(
        OFFER_PREFIX.length
      );

      assert.equal(suffix.length, 8);
      assert.equal(
        suffix.readBigUInt64LE(0),
        BigInt(offer.id),
        'Wrong offer funding record deleted'
      );

      // Two Borsh u128 fields: collateral + reserve.
      assert.equal(deleted.value.length, 32);
      assert.equal(keys.removedBytes, 88n);

      // The first credit to each reserve provider
      // creates one new claimable storage record.
      const claimCreated = preOwner === ZERO;

      assert.equal(
        keys.added.length,
        claimCreated ? 1 : 0,
        'Unexpected new persistent key'
      );

      if (claimCreated) {
        const created = keys.added[0];
        const payerBytes = Buffer.from(
          offer.seller.accountId, 'utf8'
        );

        assert(
          created.key.subarray(
            0, CLAIM_PREFIX.length
          ).equals(CLAIM_PREFIX),
          'New key is not a claimable entry'
        );

        assert(
          created.key.includes(payerBytes),
          'Claimable key does not contain original payer'
        );

        assert.equal(created.value.length, 16);

        // Borsh string: four-byte length + account.
        assert.equal(
          created.key.length,
          CLAIM_PREFIX.length + 4 + payerBytes.length
        );
      }

      // Existing root/state records may change value,
      // but should not change serialized length here.
      assert.equal(
        keys.changedBytes,
        ZERO,
        'Unexpected additional storage resizing'
      );

      keyAttributions.push({
        offerId: offer.id,
        payer: offer.seller.accountId,
        claimCreated,
        removedBytes: keys.removedBytes,
        addedBytes: keys.addedBytes,
        netBytes: keys.netBytes
      });

      console.log(
        'KEY_ATTRIBUTION',
        'offer=' + offer.id,
        'payer=' + offer.seller.accountId,
        'deposit_freed=' + keys.removedBytes,
        'claim_allocated=' + keys.addedBytes,
        'net=' + keys.netBytes
      );

      releasedIds.add(offer.id);

      // Other, not-yet-released records must remain live.
      for (const other of offers) {
        if (releasedIds.has(other.id)) continue;

        const state = await contract.view(
          'get_offer', {offer_id: other.id}
        );

        assert.equal(state.status, 'Available');

        assert.equal(
          await contract.view('is_offer_collateralized', {
            offer_id: other.id
          }),
          true
        );
      }

      assert(
        pre.bytes >= post.bytes,
        'Unexpected storage growth during scoped release'
      );

      const freed = pre.bytes - post.bytes;

      const rebate = freed * byteCost < bond
        ? freed * byteCost
        : bond;

      rebates[ownerIndex] += rebate;

      assert.equal(pre.escrow[0], post.escrow[0]);

      assert.equal(
        pre.escrow[1] - post.escrow[1],
        13n * UNIT
      );

      assert.equal(
        pre.escrow[2] - post.escrow[2],
        rebate
      );

      assert.equal(
        post.payout[0] - pre.payout[0],
        13n * UNIT + rebate
      );

      assert.equal(post.payout[1], ZERO);
      assert.equal(pre.ledger, post.ledger);

      assert.equal(
        await claim(offer.seller),
        preOwner + 13n * UNIT + rebate
      );

      assert.equal(
        await claim(sellers[otherIndex]),
        preOther
      );

      assert.equal(await claim(outsider), preOutsider);

      assert.deepEqual(
        await Promise.all(buyers.map(claim)),
        preBuyers
      );

      assert.equal(
        await contract.view('is_offer_collateralized', {
          offer_id: offer.id
        }),
        false
      );

      assert.equal(
        (await contract.view('get_offer', {
          offer_id: offer.id
        })).status,
        'Released'
      );

      assert.deepEqual(
        await contract.view('offer_storage_bond', {
          offer_id: offer.id
        }),
        [offer.seller.accountId, bond.toString()]
      );

      console.log(
        'PROVENANCE',
        'offer=' + offer.id,
        'caller=' + releaser.accountId,
        'payer=' + offer.seller.accountId,
        'freed=' + freed,
        'rebate=' + rebate
      );

      const participants = [
        ...buyers, ...sellers, primary, outsider
      ];

      const beforeReplay = await snapshot();
      const claimsBeforeReplay =
        await Promise.all(participants.map(claim));

      await assert.rejects(() => replayer.call(
        contract,
        'release_unaccepted_offer',
        {offer_id: offer.id}
      ));

      const afterReplay = await snapshot();
      const claimsAfterReplay =
        await Promise.all(participants.map(claim));

      assert.deepEqual(
        claimsAfterReplay,
        claimsBeforeReplay
      );

      assert.equal(
        (await contract.view('get_offer', {
          offer_id: offer.id
        })).status,
        'Released'
      );

      assert.equal(
        await contract.view('is_offer_collateralized', {
          offer_id: offer.id
        }),
        false
      );

      console.log(
        'CROSS-CALLER REPLAY REJECTED',
        'offer=' + offer.id,
        'replayer=' + replayer.accountId
      );

      assert.equal(beforeReplay.bytes, afterReplay.bytes);
      assert.deepEqual(beforeReplay.escrow, afterReplay.escrow);
      assert.deepEqual(beforeReplay.payout, afterReplay.payout);
    }

    console.log('=== GLOBAL ACCOUNTING ===');

    const final = await snapshot();
    assert.equal(releasedIds.size, offers.length);

    const totalRebate = rebates[0] + rebates[1];

    console.log('=== RAW STORAGE ATTRIBUTION SUMMARY ===');

    assert.equal(keyAttributions.length, 4);

    // With order [2,0,1,3], first B and then A
    // receive their first claimable entries.
    assert.deepEqual(
      keyAttributions.map(x => x.claimCreated),
      [true, true, false, false]
    );

    const totalDeleted = keyAttributions.reduce(
      (sum, x) => sum + x.removedBytes, ZERO
    );

    const totalCreated = keyAttributions.reduce(
      (sum, x) => sum + x.addedBytes, ZERO
    );

    const totalNet = keyAttributions.reduce(
      (sum, x) => sum + x.netBytes, ZERO
    );

    assert.equal(totalDeleted, 4n * 88n);
    assert.equal(totalCreated, 2n * 85n);
    assert.equal(totalNet, -182n);
    assert.equal(
      -totalNet * byteCost,
      totalRebate
    );

    console.log('Deleted funding bytes:', totalDeleted.toString());
    console.log('Created claim bytes:', totalCreated.toString());
    console.log('Net freed bytes:', (-totalNet).toString());
    console.log('Verified storage rebate:', totalRebate.toString());
    console.log('Raw storage attribution: PASS');

    assert(rebates[0] > ZERO && rebates[1] > ZERO);

    assert.deepEqual(
      final.escrow,
      [ZERO, ZERO, 12n * bond - totalRebate]
    );

    assert.deepEqual(
      final.payout,
      [122n * UNIT + totalRebate, ZERO]
    );

    assert.equal(
      await claim(sellers[0]),
      26n * UNIT + rebates[0]
    );

    assert.equal(
      await claim(sellers[1]),
      26n * UNIT + rebates[1]
    );

    assert.equal(await claim(outsider), ZERO);

    assert.equal(
      final.ledger,
      122n * UNIT + 12n * bond
    );

    console.log('Cross-owner accounting and replay: PASS');

    console.log('=== NATIVE WITHDRAWAL OF REFUND CREDIT ===');

    const ownRebate = rebates[0];
    const otherBefore = await claim(sellers[1]);
    const buyerBefore = await Promise.all(buyers.map(claim));

    await traceTransition('native_withdrawal', () =>
      sellers[0].call(contract, 'withdraw', {
        amount: ownRebate.toString()
      }, {
        gas: '200000000000000'
      })
    );

    assert.equal(
      await claim(sellers[0]),
      26n * UNIT
    );

    assert.equal(await claim(sellers[1]), otherBefore);

    assert.deepEqual(
      await Promise.all(buyers.map(claim)),
      buyerBefore
    );

    const afterWithdrawal = await snapshot();

    assert.deepEqual(afterWithdrawal.escrow, final.escrow);

    assert.deepEqual(
      afterWithdrawal.payout,
      [final.payout[0] - ownRebate, ZERO]
    );

    console.log('Native rebate withdrawal: PASS');

    console.log('=== COMPLETE TRANSITION STORAGE MATRIX ===');

    // Two tasks, each with seven successful setup actions:
    // create, fund, accept, two posts, two offer funds.
    // Then 2 cancellations, 4 releases, 1 withdrawal.
    assert.equal(transitionRows.length, 21);

    const accumulated = transitionRows.reduce(
      (sum, row) => sum + row.net, ZERO
    );

    const endAccount = await rawAccount(contract);

    assert.equal(
      accumulated,
      endAccount.bytes - start.bytes,
      'Transition deltas do not reconcile globally'
    );

    const endKeys = await rawStorage();
    const retained = new Map();
    const retainedBytes = new Map();

    for (const item of endKeys.values()) {
      const kind = category(item);
      retained.set(kind, (retained.get(kind) || 0) + 1);
      retainedBytes.set(
        kind,
        (retainedBytes.get(kind) || ZERO) +
        entryBytes(item)
      );
    }

    // These records must survive this tested lifecycle.
    assert.equal(retained.get('task'), 2);
    assert.equal(retained.get('offer'), 4);
    assert.equal(retained.get('task_creation_bond'), 2);
    assert.equal(retained.get('offer_creation_bond'), 4);
    assert.equal(retained.get('task_funding'), 2);
    assert.equal(retained.get('settled'), 2);
    assert.equal(retained.get('claimable'), 4);

    assert.equal(retained.get('offer_funding') || 0, 0);
    assert.equal(retained.get('slot_lock') || 0, 0);

    for (const [kind, count] of [...retained].sort()) {
      console.log(
        'RETAINED',
        kind,
        'records=' + count,
        'bytes=' + retainedBytes.get(kind)
      );
    }

    console.log(
      'Total transition growth:',
      accumulated.toString()
    );
    console.log(
      'Measured account growth:',
      (endAccount.bytes - start.bytes).toString()
    );

    console.log('Transition storage reconciliation: PASS');

    console.log('=== M2/07E/2A TRANSITION MATRIX: PASS ===');

  } finally {
    if (worker) {
      await worker.tearDown();
    }
  }
}

main().catch(error => {
  console.error('=== M2/07E/2A TRANSITION MATRIX: FAIL ===');
  console.error(error);
  process.exitCode = 1;
});
