'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const near = require('near-api-js');

const {
  componentFromCsv,
  minimumCommitment
} = require('./r5_data_envelope.cjs');

const BASE = '/workspaces/.nomogenesis-r6';
const IDENTITIES = `${BASE}/r6-04-actors.json`;
const JOURNAL = `${BASE}/r6-04-journal.json`;

const CONTRACT = 'nomogenesis-70e59593a3.testnet';
const CODE_HASH =
  'Hc2soWJ38GHn4i2gVy87jexrBYEgquboFg6VJLUL56wQ';

const PRIMARY = 'https://rpc.testnet.fastnear.com';
const SECONDARY = 'https://near-testnet.drpc.org';
const FAUCET = 'https://helper.nearprotocol.com/account';

const UNIT = 10n ** 21n;
const SECOND = 1000000000n;
const DAY = 86400n * SECOND;
const GAS = 200000000000000n;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

// A successful transaction may become visible through
// finalized state queries later than its RPC outcome.
// Retry reads only; never repeat signed transactions.
async function eventuallyView(
  method, args, predicate, label
) {
  let last = null;

  for (let attempt = 1; attempt <= 40; attempt++) {
    last = await view(method, args);

    if (predicate(last)) {
      console.log(
        'FINALIZED_STATE:',
        label,
        'PASS',
        'attempt=' + attempt
      );
      return last;
    }

    if (attempt < 40) {
      await sleep(1500);
    }
  }

  throw new Error(
    'Finalized state did not converge: ' +
    label +
    '; last=' + JSON.stringify(last)
  );
}

function save(filename, value) {
  const temp = filename + '.tmp';

  fs.writeFileSync(
    temp,
    JSON.stringify(value, null, 2) + '\n',
    {mode: 0o600}
  );

  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, filename);
}

function load(filename, fallback) {
  return fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename, 'utf8'))
    : fallback;
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  assert(response.ok, `RPC HTTP ${response.status}`);

  const body = await response.json();

  if (body.error) {
    throw new Error(JSON.stringify(body.error));
  }

  return body.result;
}

async function view(method, args = {}) {
  const result = await rpc(PRIMARY, 'query', {
    request_type: 'call_function',
    account_id: CONTRACT,
    method_name: method,
    args_base64: Buffer.from(
      JSON.stringify(args)
    ).toString('base64'),
    finality: 'final'
  });

  return JSON.parse(
    Buffer.from(result.result).toString('utf8')
  );
}

async function accountState(accountId) {
  try {
    return await rpc(PRIMARY, 'query', {
      request_type: 'view_account',
      account_id: accountId,
      finality: 'final'
    });
  } catch (error) {
    if (
      /UNKNOWN_ACCOUNT|does not exist|unknown account/i
        .test(error.message)
    ) {
      return null;
    }

    throw error;
  }
}

async function provision(actor) {
  let state = await accountState(actor.account_id);

  if (!state) {
    console.log('FAUCET_REQUEST:', actor.account_id);

    const response = await fetch(FAUCET, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        newAccountId: actor.account_id,
        newAccountPublicKey: actor.public_key
      })
    });

    console.log(
      'FAUCET_HTTP:',
      actor.account_id,
      response.status
    );

    // Check chain state even after an uncertain helper result.
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(2000);
      state = await accountState(actor.account_id);
      if (state) break;
    }
  }

  assert(state, `account not funded: ${actor.account_id}`);

  assert(
    BigInt(state.amount) >= 1n * 10n ** 24n,
    'insufficient actor funding'
  );

  console.log('FUNDED_ACCOUNT: PASS', actor.account_id);
}

function identities() {
  const existing = load(IDENTITIES, null);

  if (existing) return existing;

  const actors = {};

  for (const role of ['creator', 'buyer', 'worker']) {
    const keyPair = near.KeyPair.fromRandom('ed25519');

    actors[role] = {
      account_id:
        `nmg-${role}-${crypto.randomBytes(5).toString('hex')}.testnet`,
      public_key: keyPair.getPublicKey().toString(),
      private_key: keyPair.toString()
    };
  }

  save(IDENTITIES, actors);
  return actors;
}

async function connect(actor) {
  const keyPair = near.KeyPair.fromString(actor.private_key);

  assert.equal(
    keyPair.getPublicKey().toString(),
    actor.public_key
  );

  const keys = new near.keyStores.InMemoryKeyStore();

  await keys.setKey(
    'testnet',
    actor.account_id,
    keyPair
  );

  const connection = await near.connect({
    networkId: 'testnet',
    nodeUrl: PRIMARY,
    keyStore: keys,
    deps: {keyStore: keys}
  });

  return connection.account(actor.account_id);
}

function decodeOutcome(outcome) {
  assert(
    outcome.status &&
    Object.hasOwn(outcome.status, 'SuccessValue'),
    'transaction lacks successful return value'
  );

  const decoded = Buffer.from(
    outcome.status.SuccessValue,
    'base64'
  ).toString('utf8');

  return decoded ? JSON.parse(decoded) : null;
}

async function signedCall(account, method, args, deposit) {
  // Deliberately no automatic transaction retry.
  const outcome = await account.functionCall({
    contractId: CONTRACT,
    methodName: method,
    args,
    gas: GAS,
    attachedDeposit: deposit
  });

  assert.equal(
    outcome.transaction.signer_id,
    account.accountId
  );

  return {
    tx: outcome.transaction.hash,
    value: decodeOutcome(outcome)
  };
}

async function verifyTransaction(entry, signer, method, deposit) {
  let result;

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      result = await rpc(
        SECONDARY,
        'EXPERIMENTAL_tx_status',
        [entry.tx, signer]
      );
      break;
    } catch (error) {
      if (attempt === 11) throw error;
      await sleep(2000);
    }
  }

  assert.equal(result.transaction.signer_id, signer);
  assert.equal(result.transaction.receiver_id, CONTRACT);

  assert(
    result.status &&
    (
      Object.hasOwn(result.status, 'SuccessValue') ||
      Object.hasOwn(result.status, 'SuccessReceiptId')
    ),
    'on-chain transaction failed'
  );

  const actions = result.transaction.actions || [];

  const calls = actions.filter(action =>
    action.FunctionCall?.method_name === method
  );

  assert.equal(calls.length, 1);
  assert.equal(
    BigInt(calls[0].FunctionCall.deposit),
    deposit
  );

  console.log('VERIFIED_TX:', method, entry.tx);
}

async function main() {
  fs.mkdirSync(BASE, {recursive: true, mode: 0o700});
  fs.chmodSync(BASE, 0o700);

  const network = await rpc(PRIMARY, 'status', []);
  assert.equal(network.chain_id, 'testnet');

  const code = await accountState(CONTRACT);
  assert(code, 'deployed contract account missing');
  assert.equal(code.code_hash, CODE_HASH);

  console.log('TESTNET_CONTRACT:', CONTRACT);
  console.log('CONTRACT_CODE_HASH: PASS');

  const actors = identities();

  for (const role of ['creator', 'buyer', 'worker']) {
    const actor = actors[role];

    assert.match(
      actor.account_id,
      /^nmg-(creator|buyer|worker)-[a-f0-9]{10}\.testnet$/
    );

    const restored = near.KeyPair.fromString(
      actor.private_key
    );

    assert.equal(
      restored.getPublicKey().toString(),
      actor.public_key
    );

    await provision(actor);
  }

  console.log('THREE DISTINCT FUNDED ACCOUNTS: PASS');

  const creator = await connect(actors.creator);
  const buyer = await connect(actors.buyer);
  const worker = await connect(actors.worker);

  const quote = await view('m3_storage_quote');

  const caseStorage = BigInt(quote.case_storage_cost);
  const jobStorage = BigInt(quote.job_storage_cost);

  const quantities = componentFromCsv(
    'demo/data/quantities.csv', 0
  );

  const prices = componentFromCsv(
    'demo/data/prices.csv', 1
  );

  const journal = load(JOURNAL, {});

  if (!journal.case) {
    const block = await rpc(PRIMARY, 'block', {
      finality: 'final'
    });

    const now = BigInt(
      block.header.timestamp_nanosec ??
      block.header.timestamp
    );

    const descriptor = {
      descriptor_version: 1,
      original_provider: actors.creator.account_id,
      component_commitments: [
        Array.from(quantities.root),
        Array.from(prices.root)
      ],
      dependency_deadline: Number(now + DAY),
      bid_close: Number(now + 2n * DAY),
      award_close: Number(now + 3n * DAY),
      recovery_deadline: Number(now + 4n * DAY)
    };

    const created = await signedCall(
      creator,
      'create_rescue_case',
      {descriptor},
      caseStorage
    );

    assert(
      Array.isArray(created.value) &&
      created.value.length === 32
    );

    journal.case = {
      ...created,
      descriptor
    };

    save(JOURNAL, journal);
  }

  await verifyTransaction(
    journal.case,
    creator.accountId,
    'create_rescue_case',
    caseStorage
  );

  const caseId = journal.case.value;

  const caseView = await eventuallyView(
    'get_rescue_case',
    {case_id: caseId},
    state =>
      state?.phase === 'Open' &&
      JSON.stringify(state.id) ===
        JSON.stringify(caseId),
    'rescue-case-open'
  );

  assert.deepEqual(caseView.id, caseId);

  console.log('PUBLIC RESCUE CASE: PASS');

  if (!journal.job) {
    const input = {
      case_id: caseId,
      worker: worker.accountId,
      worker_reward: (25n * UNIT).toString(),
      rescue_cap: (5n * UNIT).toString(),
      result_profile: 'MinimumThreshold',
      result_commitment: Array.from(
        minimumCommitment(caseId, 500n)
      ),
      threshold: '500',
      final_deadline:
        journal.case.descriptor.recovery_deadline +
        Number(DAY)
    };

    const funded = await signedCall(
      buyer,
      'create_funded_rescue_job',
      {input},
      30n * UNIT + jobStorage
    );

    assert(Number.isSafeInteger(funded.value));

    journal.job = funded;
    save(JOURNAL, journal);
  }

  await verifyTransaction(
    journal.job,
    buyer.accountId,
    'create_funded_rescue_job',
    30n * UNIT + jobStorage
  );

  const jobId = journal.job.value;

  console.log('PUBLIC FUNDED JOB: PASS');

  if (!journal.acceptance) {
    const accepted = await signedCall(
      worker,
      'accept_rescue_job',
      {job_id: jobId},
      0n
    );

    journal.acceptance = accepted;
    save(JOURNAL, journal);
  }

  await verifyTransaction(
    journal.acceptance,
    worker.accountId,
    'accept_rescue_job',
    0n
  );

  const jobView = await eventuallyView(
    'get_rescue_job',
    {job_id: jobId},
    state => state?.phase === 'Accepted',
    'worker-accepted'
  );

  const mandate = await eventuallyView(
    'get_rescue_mandate',
    {job_id: jobId},
    state => state?.phase === 'Open',
    'mandate-open'
  );

  assert.equal(jobView.phase, 'Accepted');
  assert.equal(jobView.buyer, buyer.accountId);
  assert.equal(jobView.worker, worker.accountId);

  assert.equal(
    BigInt(jobView.held_worker_reward),
    25n * UNIT
  );

  assert.equal(mandate.phase, 'Open');

  assert.equal(
    BigInt(mandate.held_principal),
    5n * UNIT
  );

  const totals = await eventuallyView(
    'm3_totals',
    {},
    state =>
      state !== null &&
      BigInt(state.rescue_escrow) === 30n * UNIT,
    'funded-escrow'
  );

  assert.equal(
    BigInt(totals.rescue_escrow),
    30n * UNIT
  );

  assert.equal(
    BigInt(await view('claimable_total')),
    0n
  );

  console.log('WORKER ACCEPTANCE: PASS');
  console.log('PUBLIC ESCROW: 30 UNITS');
  console.log('WORKER REWARD HELD: 25 UNITS');
  console.log('RESCUE CAP HELD: 5 UNITS');
  console.log('PUBLIC ECONOMIC STATE: PASS');

  console.log('CASE_ID_HEX:', Buffer.from(caseId).toString('hex'));
  console.log('JOB_ID:', jobId);

  console.log('=== M3-R6-04 RESULT: PASS ===');
}

main().catch(error => {
  console.error('=== M3-R6-04 RESULT: FAIL ===');
  console.error(error.stack || error.message);
  console.error(
    'Persistent identities and transaction journal preserved.'
  );
  process.exitCode = 1;
});
