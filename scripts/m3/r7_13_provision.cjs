'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const near = require('near-api-js');

const DIR = path.join(os.homedir(), '.nomogenesis-r7-13');
const ACTOR_DIR = path.join(DIR, 'actors');
const JOURNAL = path.join(DIR, 'actors-journal.json');
const PUBLIC = path.join(DIR, 'actors-public.json');

const PARENT = 'nmg-r713-8d99c17cced1.testnet';
const RPC = 'https://rpc.testnet.fastnear.com';
const DEPOSIT = 300000000000000000000000n;
const ONE = 10n ** 24n;

const ROLES = [
  'buyer-1', 'buyer-2', 'buyer-3',
  'provider-alpha', 'provider-beta',
  'provider-gamma', 'provider-delta',
  'worker0', 'worker1', 'keeper'
];

function requireDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {mode: 0o700});
  }
  const s = fs.lstatSync(dir);
  assert(s.isDirectory() && !s.isSymbolicLink());
  assert.equal(s.uid, process.getuid());
  assert.equal(s.mode & 0o077, 0);
}

function read(file) {
  const s = fs.lstatSync(file);
  assert(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.uid, process.getuid());
  assert.equal(s.mode & 0o077, 0);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicSave(file, object) {
  const temp = file + '.' +
    crypto.randomBytes(6).toString('hex') + '.tmp';

  fs.writeFileSync(
    temp,
    JSON.stringify(object, null, 2) + '\n',
    {flag: 'wx', mode: 0o600}
  );

  fs.renameSync(temp, file);
}

function credential(role) {
  const file = path.join(ACTOR_DIR, `${role}.json`);
  const accountId = `${role}.${PARENT}`;

  let item;
  if (fs.existsSync(file)) {
    item = read(file);
  } else {
    const kp = near.KeyPair.fromRandom('ed25519');
    item = {
      network: 'testnet',
      role,
      account_id: accountId,
      public_key: kp.getPublicKey().toString(),
      private_key: kp.toString()
    };
    fs.writeFileSync(
      file,
      JSON.stringify(item, null, 2) + '\n',
      {flag: 'wx', mode: 0o600}
    );
  }

  assert.equal(item.role, role);
  assert.equal(item.network, 'testnet');
  assert.equal(item.account_id, accountId);
  assert.equal(
    near.KeyPair.fromString(item.private_key)
      .getPublicKey().toString(),
    item.public_key
  );

  return item;
}

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'r7-13',
      method, params
    }),
    signal: AbortSignal.timeout(20000)
  });

  assert(response.ok, 'RPC HTTP failure');
  const body = await response.json();
  return body;
}

async function accountState(accountId) {
  const response = await rpc('query', {
    request_type: 'view_account',
    account_id: accountId,
    finality: 'final'
  });

  if (response.error) {
    const message = JSON.stringify(response.error);
    if (/unknown_account|does not exist/i.test(message)) {
      return null;
    }
    throw Error('Account query failed: ' + message);
  }
  return response.result;
}

async function verifyKey(item) {
  const state = await accountState(item.account_id);
  if (!state) return null;

  const access = await rpc('query', {
    request_type: 'view_access_key',
    account_id: item.account_id,
    public_key: item.public_key,
    finality: 'final'
  });

  assert(!access.error,
    'Account exists without matching signer: ' + item.role);
  assert.equal(
    access.result.permission,
    'FullAccess',
    'Signer is not FullAccess: ' + item.role
  );

  return state;
}

async function main() {
  assert.equal(
    require('near-api-js/package.json').version,
    '5.1.1'
  );

  requireDirectory(DIR);
  requireDirectory(ACTOR_DIR);

  const admin = read(path.join(DIR, 'bootstrap.json'));

  assert.equal(admin.account_id, PARENT);
  assert.equal(admin.network, 'testnet');
  assert.equal(
    near.KeyPair.fromString(admin.private_key)
      .getPublicKey().toString(),
    admin.public_key
  );

  const network = await rpc('status', []);
  assert.equal(network.result.chain_id, 'testnet');

  const parent = await verifyKey({
    ...admin, role: 'bootstrap'
  });
  assert(parent, 'Bootstrap account unavailable');

  const actors = Object.fromEntries(
    ROLES.map(role => [role, credential(role)])
  );

  const journal = fs.existsSync(JOURNAL)
    ? read(JOURNAL)
    : {
        schema: 'nomogenesis.r7-13.actors-journal.v1',
        parent: PARENT,
        deposit_yocto: DEPOSIT.toString(),
        rows: {}
      };

  assert.equal(journal.parent, PARENT);
  assert.equal(journal.deposit_yocto, DEPOSIT.toString());

  for (const role of ROLES) {
    const item = actors[role];
    if (!journal.rows[role]) {
      journal.rows[role] = {
        account_id: item.account_id,
        public_key: item.public_key,
        state: 'planned',
        tx: null
      };
    }
    assert.equal(
      journal.rows[role].account_id, item.account_id
    );
    assert.equal(
      journal.rows[role].public_key, item.public_key
    );
  }

  atomicSave(JOURNAL, journal);

  const existing = {};

  for (const role of ROLES) {
    existing[role] = await verifyKey(actors[role]);
  }

  const missing = ROLES.filter(role => !existing[role]);

  assert(
    BigInt(parent.amount) >=
      DEPOSIT * BigInt(missing.length) + ONE,
    'Insufficient bootstrap balance with safety reserve'
  );

  const keys = new near.keyStores.InMemoryKeyStore();

  await keys.setKey(
    'testnet',
    PARENT,
    near.KeyPair.fromString(admin.private_key)
  );

  const connection = await near.connect({
    networkId: 'testnet',
    nodeUrl: RPC,
    keyStore: keys,
    deps: {keyStore: keys}
  });

  const controller = await connection.account(PARENT);

  console.log('NETWORK: testnet');
  console.log('CONTROLLER:', PARENT);
  console.log('ACTORS:', ROLES.length);
  console.log('NEW_ACCOUNTS_NEEDED:', missing.length);
  console.log('INITIAL_BALANCE_EACH: 0.3 testNEAR');
  console.log('PRIVATE_KEYS_EXPORTED: NO');

  for (const role of ROLES) {
    const item = actors[role];
    const row = journal.rows[role];

    let state = existing[role];

    if (!state) {
      assert.equal(
        row.state, 'planned',
        'Uncertain prior submission: ' + role +
        '. Inspect journal before resubmission.'
      );

      row.state = 'prepared';
      atomicSave(JOURNAL, journal);

      console.log('CREATE_SUBACCOUNT:', role);

      // Exactly one application-level submission.
      // An uncertain result is never automatically replayed.
      const result = await controller.createAccount(
        item.account_id,
        item.public_key,
        DEPOSIT
      );

      assert(
        result.status &&
        !Object.hasOwn(result.status, 'Failure'),
        'CreateAccount transaction failed'
      );

      row.tx = result.transaction?.hash ?? null;
      row.state = 'submitted';
      atomicSave(JOURNAL, journal);

      for (let attempt = 0; attempt < 10; attempt++) {
        state = await verifyKey(item);
        if (state) break;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      assert(state, 'Account not finalized: ' + role);
    }

    assert(
      BigInt(state.amount) >= DEPOSIT -
        1000000000000000000000n,
      'Unexpected child account balance: ' + role
    );

    row.state = 'confirmed';
    row.balance_yocto = state.amount;
    atomicSave(JOURNAL, journal);

    console.log(
      'ACTOR_VERIFIED:', role, item.account_id
    );
  }

  const report = {
    schema: 'nomogenesis.r7-13.public-actors.v1',
    network: 'near-testnet',
    controller: PARENT,
    initial_balance_each_yocto: DEPOSIT.toString(),
    actors: ROLES.map(role => ({
      role,
      account_id: actors[role].account_id,
      public_key: actors[role].public_key,
      creation_tx: journal.rows[role].tx,
      full_access_verified: true,
      balance_yocto: journal.rows[role].balance_yocto
    })),
    operator_independence_claimed: false,
    production_security_audit_claimed: false
  };

  atomicSave(PUBLIC, report);

  console.log('TEN_PERSISTENT_AGENT_SIGNERS: PASS');
  console.log('TEN_ONCHAIN_ACCESS_KEYS: PASS');
  console.log('R7_13_ACTOR_PROVISIONING: PASS');
}

main().catch(error => {
  console.error(
    'R7_13_ACTOR_PROVISIONING: STOP:',
    error.message
  );
  console.error(
    'Preserve private journal; do not regenerate keys.'
  );
  process.exitCode = 1;
});
