'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const near = require('near-api-js');

const {
  rpc, view, accountState, save
} = require('./r6_funded_smoke.cjs');

const BASE = '/workspaces/.nomogenesis-r6';
const NEW_BASE = '/workspaces/.nomogenesis-r7-live';
const PRIMARY = 'https://rpc.testnet.fastnear.com';

const CONTRACT = 'nomogenesis-70e59593a3.testnet';
const CODE_HASH =
  'Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ';

const UNIT = 10n ** 21n;
const SAFETY_BUFFER = 300n * UNIT;

function safeRead(filename) {
  const stat = fs.lstatSync(filename);

  assert(stat.isFile(), 'credentials not a regular file');
  assert(!stat.isSymbolicLink(), 'symlink credentials');
  assert.equal(
    stat.mode & 0o077,
    0,
    'unsafe credential permissions'
  );

  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

async function main() {
  console.log('=== VERIFY NETWORK AND CONTRACT ===');

  const network = await rpc(PRIMARY, 'status', []);
  assert.equal(network.chain_id, 'testnet');

  const contract = await accountState(CONTRACT);
  assert(contract, 'contract missing');
  assert.equal(contract.code_hash, CODE_HASH);

  console.log('NETWORK: testnet');
  console.log('CONTRACT CODE HASH: PASS');

  const quote = await view('m3_storage_quote');

  const costs = {
    creator: BigInt(quote.case_storage_cost),
    buyer: 32n * UNIT + BigInt(quote.job_storage_cost),
    worker: 0n,
    provider: 12n * UNIT + BigInt(quote.offer_storage_cost)
  };

  for (const [role, amount] of Object.entries(costs)) {
    assert(amount >= 0n, 'invalid storage quote');
    console.log(
      'REQUIRED DEPOSIT:',
      role,
      amount.toString(),
      'yoctoNEAR'
    );
  }

  console.log('=== CHECK PRIVATE LOCAL IDENTITIES ===');

  const old = safeRead(BASE + '/r6-04-actors.json');
  const newer = safeRead(BASE + '/r6-05-actors.json');

  const actors = {
    creator: old.creator,
    buyer0: old.buyer,
    worker0: old.worker,
    buyer1: newer.buyer1,
    worker1: newer.worker1,
    buyer2: newer.buyer2,
    worker2: newer.worker2,
    quantities: newer.quantities,
    prices: newer.prices
  };

  const accounts = new Set();
  const balances = {};

  for (const [role, actor] of Object.entries(actors)) {
    assert(actor, 'missing role: ' + role);
    assert(typeof actor.account_id === 'string');
    assert(typeof actor.private_key === 'string');
    assert(typeof actor.public_key === 'string');

    assert(!accounts.has(actor.account_id), 'duplicate actor');
    accounts.add(actor.account_id);

    const keyPair = near.KeyPair.fromString(
      actor.private_key
    );

    assert.equal(
      keyPair.getPublicKey().toString(),
      actor.public_key,
      'local key mismatch'
    );

    const keyState = await rpc(PRIMARY, 'query', {
      request_type: 'view_access_key',
      account_id: actor.account_id,
      public_key: actor.public_key,
      finality: 'final'
    });

    assert.equal(
      keyState.permission,
      'FullAccess',
      'signer lacks full access'
    );

    const state = await accountState(actor.account_id);

    assert(state, 'missing funded actor: ' + role);

    const category =
      role === 'creator' ? 'creator' :
      role.startsWith('buyer') ? 'buyer' :
      role.startsWith('worker') ? 'worker' :
      'provider';

    const required = costs[category];

    const balance = BigInt(state.amount);

    assert(
      balance >= required + SAFETY_BUFFER,
      'insufficient conservative balance: ' + role
    );

    balances[role] = balance.toString();

    console.log(
      'SIGNER READY:',
      role,
      actor.account_id,
      'balance_UNIT=' + (balance / UNIT)
    );
  }

  assert.equal(accounts.size, 9);

  console.log('FUNDED AND AUTHORIZED SIGNERS: 9/9');

  console.log('=== VERIFY PROVIDER CAPACITY ===');

  const providerSlots = [
    {
      role: 'quantities',
      slot: 'r7_05c_quantities_v1'
    },
    {
      role: 'prices',
      slot: 'r7_05c_prices_v1'
    }
  ];

  for (const item of providerSlots) {
    const holder = await view('capacity_lock_holder', {
      provider: actors[item.role].account_id,
      slot_id: item.slot
    });

    assert.equal(
      holder, null,
      'provider slot already locked'
    );

    console.log('PROVIDER SLOT FREE:', item.role);
  }

  console.log('=== READ ECONOMIC BASELINE ===');

  const totals = await view('m3_totals');
  const claimable = BigInt(
    await view('claimable_total')
  );

  const escrow = BigInt(totals.rescue_escrow);

  assert.equal(
    escrow,
    30n * UNIT,
    'unexpected previous escrow'
  );

  assert.equal(
    claimable,
    94n * UNIT,
    'unexpected previous claimable total'
  );

  console.log('BASELINE ESCROW:', escrow / UNIT, 'UNIT');
  console.log('BASELINE CLAIMABLE:', claimable / UNIT, 'UNIT');

  console.log('=== VERIFY NEW JOURNAL IS UNUSED ===');

  fs.mkdirSync(NEW_BASE, {
    recursive: true,
    mode: 0o700
  });

  fs.chmodSync(NEW_BASE, 0o700);

  const journal = NEW_BASE + '/r7-05c-journal.json';

  assert(
    !fs.existsSync(journal),
    'existing R7 journal: inspect before any broadcast'
  );

  const report = {
    version: 1,
    network: 'testnet',
    contract: CONTRACT,
    contract_code_hash: CODE_HASH,
    actor_accounts: Object.fromEntries(
      Object.entries(actors).map(
        ([role, actor]) => [role, actor.account_id]
      )
    ),
    buyer_caps_units: [7, 7, 7],
    provider_fees_units: [6, 6],
    provider_bonds_units: [12, 12],
    baseline_escrow: escrow.toString(),
    baseline_claimable: claimable.toString(),
    balances,
    journal_exists: false,
    signed_transactions_sent: 0
  };

  save(NEW_BASE + '/r7-05c-preflight.json', report);

  console.log('EXPECTED NEW PRINCIPAL: 120 UNIT');
  console.log('EXPECTED PRE-AWARD ESCROW: 150 UNIT');
  console.log('FRESH JOURNAL: AVAILABLE');
  console.log('PRIVATE KEYS EXPORTED: NO');
  console.log('SIGNED TRANSACTIONS SENT: ZERO');
  console.log('R7-05C/00 REAL TESTNET PREFLIGHT: PASS');
}

main().catch(error => {
  console.error('R7-05C/00 PREFLIGHT: FAIL');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
