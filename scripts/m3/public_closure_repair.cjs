'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRpcBroker} = require('./r7_13h_rpc_broker.cjs');
const {actorBudget, CALLS, UNIT} = require('./r7_public_budget.cjs');

const CASE = 'ea02801246ad4bccbc464d5fa06153ad19e34af48094efba9bd6cd9d57b9b475';
const CONTRACT = 'nmg-r7v2-0b9a0eff20.testnet';
const PARENT = 'nmg-r713-8d99c17cced1.testnet';
const SHA = '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e';
const READ = ['https://rpc.testnet.fastnear.com',
  'https://rpc.testnet.near.org', 'https://archival-rpc.testnet.fastnear.com'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function secureJson(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid());
  assert.equal(stat.mode & 0o077, 0);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function save(file, value, replace = false) {
  const temporary = replace ? file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp' : file;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  if (replace) fs.renameSync(temporary, file);
}

function validateFailedState(s, released = 0) {
  assert([0, 7, 8].includes(released));
  assert.equal(Buffer.from(s.rescue.id).toString('hex'), CASE);
  assert.equal(s.rescue.phase, 'Open');
  assert.equal(s.rescue.awarded_bundle_id, null);
  assert.deepEqual(s.rescue.job_ids, [13]);
  assert.deepEqual(s.rescue.offer_ids, []);
  assert.deepEqual(s.rescue.resolved_payloads, [null, null]);
  assert.equal(s.job.id, 13);
  assert.equal(Buffer.from(s.job.case_id).toString('hex'), CASE);
  assert.equal(s.job.buyer, 'buyer-1.' + PARENT);
  assert.equal(s.job.worker, 'worker0.' + PARENT);
  assert.equal(s.job.phase, released === 8 ? 'Expired' : 'Accepted');
  assert.equal(BigInt(s.job.held_worker_reward), released === 8 ? 0n : UNIT);
  assert.equal(s.mandate.job_id, 13);
  assert.equal(s.mandate.phase, released ? 'Released' : 'Open');
  assert.equal(s.mandate.locked_bundle_id, null);
  assert.equal(s.mandate.locked_allocation, null);
  assert.equal(BigInt(s.mandate.held_principal), released ? 0n : 7n * UNIT);
  assert.equal(s.mandate.release_reason, released ? 'AwardExpired' : null);
  assert.equal(BigInt(s.totals.rescue_escrow), BigInt(8 - released) * UNIT);
  assert.equal(BigInt(s.payouts[0]), BigInt(302 + released) * UNIT);
  assert.equal(BigInt(s.payouts[1]), 0n);
  assert.equal(s.totals.storage_reserves, '383870000000000000000000');
}

async function rpc(url, method, params) {
  const response = await fetch(url, {method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 'closure-repair', method, params}),
    signal: AbortSignal.timeout(method === 'send_tx' ? 25000 : 16000)});
  assert(response.ok, 'RPC HTTP ' + response.status);
  const body = await response.json();
  if (body.error) {
    const error = Error(JSON.stringify(body.error));
    error.rpcCause = body.error.cause?.name;
    throw error;
  }
  assert(Object.hasOwn(body, 'result'));
  return body.result;
}

async function transferSignedOnce({account, receiver, amount, file, transferAction, baseEncode, exchange}) {
  assert(!fs.existsSync(file), 'Transfer already prepared; reconcile its journal');
  const record = {signer: account.accountId, receiver, amount: amount.toString(),
    state: 'prepared', tx: null};
  save(file, record);
  account.accessKeyByPublicKeyCache = {};
  const [hash, signed] = await account.signTransaction(receiver, [transferAction(amount)]);
  assert(crypto.createHash('sha256').update(Buffer.from(signed.transaction.encode()))
    .digest().equals(Buffer.from(hash)), 'Transfer hash mismatch');
  record.tx = baseEncode(hash);
  record.state = 'signed_not_confirmed';
  save(file, record, true);
  try {
    await exchange('send_tx', {signed_tx_base64: Buffer.from(signed.encode()).toString('base64'),
      wait_until: 'INCLUDED'});
  } catch (error) {
    record.submission_error = error.message;
    save(file, record, true);
    if (error.rpcCause === 'INVALID_TRANSACTION') throw error;
  }
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    let outcome;
    try { outcome = await exchange('tx', {tx_hash: record.tx,
      sender_account_id: account.accountId, wait_until: 'NONE'}); }
    catch { await sleep(1100); continue; }
    if (outcome.final_execution_status !== 'FINAL') { await sleep(1100); continue; }
    assert.equal(outcome.transaction.hash, record.tx);
    assert.equal(outcome.transaction.signer_id, account.accountId);
    assert.equal(outcome.transaction.receiver_id, receiver);
    assert.deepEqual(outcome.transaction.actions, [{Transfer: {deposit: amount.toString()}}]);
    assert(Object.hasOwn(outcome.status, 'SuccessValue'));
    assert(!(outcome.receipts_outcome || []).some(r => Object.hasOwn(r.outcome.status, 'Failure')));
    record.state = 'confirmed';
    record.outcome = outcome;
    save(file, record, true);
    return record;
  }
  throw Error('Transfer finality uncertain: ' + record.tx + '; do not resend');
}

function history(keyRoot) {
  const source = path.join(keyRoot, 'technical-closure');
  const run = secureJson(path.join(source, 'run.json'));
  assert.equal(run.contract, CONTRACT);
  assert.equal(run.restart_allowed, false);
  assert.equal(Buffer.from(run.case_id).toString('hex'), CASE);
  const expected = {
    'bootstrap__create_rescue_case.json': ['confirmed', '9bC865ipXudWWYY3DVL24tBoanUQ9bwVTiGHDGNi9EtR'],
    'buyer-1__create_funded_rescue_job.json': ['confirmed', 'Ddskdq3isfJQBveLYrUXav6v1QBpK5APunu6hHLqcFvy'],
    'worker0__accept_rescue_job.json': ['confirmed', '8hGrWBy4v2G6hiLY9ZdFKGfzv1n4gk367Ub9AW7XzEur'],
    'provider-alpha__post_rescue_offer.json': ['rejected', 'GR2q9z6H2r85uDoMm8cCiVo3HPvvj6fuJNUwQaBWbDkn'],
    'provider-gamma__post_rescue_offer.json': ['rejected', '4A2Fod6jwtFrnwyrVusoy8Vr6GPN3LDTuBTTKMsyU6ug'],
    'buyer-2__create_funded_rescue_job.json': ['signed_not_confirmed', 'GexNmCxK3qthBDz5Vq5Bh2Cv2YjycDsfEgpksfULsXP4'],
    'provider-beta__post_rescue_offer.json': ['signed_not_confirmed', 'Hf37EWNj4DfkqAtRpjpTzZ9QZ3bw8JoCWCW7aE3PWvrU']
  };
  assert.deepEqual(fs.readdirSync(source).filter(n => n.includes('__') && n.endsWith('.json')).sort(),
    Object.keys(expected).sort(), 'Unexpected transaction journals');
  const uncertain = [];
  for (const [name, [state, tx]] of Object.entries(expected)) {
    const record = secureJson(path.join(source, name));
    assert.equal(record.state, state);
    assert.equal(record.tx, tx);
    if (state === 'confirmed') assert.equal(record.outcome.final_execution_status, 'FINAL');
    if (state === 'rejected') assert.match(record.submission_error, /NotEnoughBalance/);
    if (state === 'signed_not_confirmed') {
      assert.match(record.submission_error, /RPC queue deadline expired/);
      uncertain.push(record);
    }
  }
  const intent = secureJson(path.join(keyRoot, 'technical-closure-launch-intent.json'));
  assert.equal(intent.run, 'technical-closure');
  assert.equal(intent.network, 'testnet');
  assert.equal(intent.contract, CONTRACT);
  assert.equal(intent.restart_allowed, false);
  return {source, run, uncertain};
}

async function main(mode = process.argv[2]) {
  assert(['--check', '--live'].includes(mode), 'Use --check or --live');
  assert(!process.env.NMG_LOCAL_SANDBOX_CONFIG);
  const live = mode === '--live';
  const keyRoot = path.join(os.homedir(), '.nomogenesis-r7-13');
  const destination = path.join(keyRoot, 'public-closure-maintenance-20261112');
  assert(!fs.existsSync(destination), 'Maintenance already exists; inspect its journals');
  const old = history(keyRoot);
  const policies = Object.fromEntries(Object.keys(CALLS).filter(r => r.includes('-')).map(role =>
    [role, JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../demo/policies/r7-06b', role + '.json')))]));
  const broker = createRpcBroker({upstreams: [READ[0], READ[2]], sendUpstream: READ[1],
    finalityUpstreams: READ, maxConcurrentReads: 4, minGapMs: 250, timeoutMs: 12000,
    fetchImpl: (url, options) => {
      const message = JSON.parse(options.body);
      if (!live) assert(['query', 'status', 'block', 'gas_price', 'EXPERIMENTAL_protocol_config', 'tx']
        .includes(message.method), 'Read-only mode');
      return fetch(url, options);
    }});
  try {
    const url = await broker.listen();
    const exchange = (method, params) => rpc(url, method, params);
    assert.equal((await exchange('status', [])).chain_id, 'testnet');
    const code = await exchange('query', {request_type: 'view_code', account_id: CONTRACT, finality: 'final'});
    assert.equal(crypto.createHash('sha256').update(Buffer.from(code.code_base64, 'base64')).digest('hex'), SHA);
    const view = async (block, method_name, args = {}) => {
      const result = await exchange('query', {request_type: 'call_function', account_id: CONTRACT,
        method_name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), block_id: block});
      return JSON.parse(Buffer.from(result.result).toString());
    };
    const snapshot = async () => {
      const block = await exchange('block', {finality: 'final'});
      const h = block.header.hash;
      const ns = BigInt(block.header.timestamp_nanosec ?? block.header.timestamp);
      assert(Math.abs(Date.now() - Number(ns / 1000000n)) < 180000, 'Stale finalized block');
      return {block: h, ns, rescue: await view(h, 'get_rescue_case', {case_id: old.run.case_id}),
        job: await view(h, 'get_rescue_job', {job_id: 13}),
        mandate: await view(h, 'get_rescue_mandate', {job_id: 13}),
        totals: await view(h, 'm3_totals'), payouts: await view(h, 'payout_totals')};
    };
    const before = await snapshot();
    validateFailedState(before);
    const waitState = async released => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const current = await snapshot();
        if (BigInt(current.totals.rescue_escrow) === BigInt(8 - released) * UNIT) {
          validateFailedState(current, released);
          return current;
        }
        await sleep(1000);
      }
      throw Error('Finalized state reader did not observe released escrow');
    };
    for (const record of old.uncertain) {
      let unknown = 0;
      for (const endpoint of READ) {
        let outcome;
        try { outcome = await rpc(endpoint, 'tx', {tx_hash: record.tx,
          sender_account_id: record.signer, wait_until: 'NONE'}); }
        catch (error) { if (error.rpcCause === 'UNKNOWN_TRANSACTION') unknown++; else console.log('READ_NOTE:', error.message.slice(0, 120)); }
        assert(!outcome, 'Previously uncertain hash now exists; reconcile first: ' + record.tx);
      }
      assert(unknown >= 2, 'Fewer than two UNKNOWN_TRANSACTION confirmations');
    }
    const inputs = {gasPrice: (await exchange('gas_price', [before.block])).gas_price,
      storagePrice: (await exchange('EXPERIMENTAL_protocol_config', {block_id: before.block}))
        .runtime_config.storage_amount_per_byte,
      quote: await view(before.block, 'm3_storage_quote'),
      consentStorage: await view(before.block, 'quote_r7_v2_consent_storage'), policies};
    const budgets = [];
    for (const role of Object.keys(CALLS)) {
      const account_id = role === 'bootstrap' ? PARENT : role + '.' + PARENT;
      const account = await exchange('query', {request_type: 'view_account', account_id, block_id: before.block});
      const budget = actorBudget(role, account, {...inputs, extraCalls: role === 'keeper' ? 2 : 0});
      budgets.push({...budget, account_id});
      console.log('FUNDING_PLAN:', role, 'AVAILABLE=' + budget.amount, 'REQUIRED=' + budget.required, 'TOPUP=' + budget.topup);
    }
    const transfers = budgets.filter(b => b.role !== 'bootstrap' && b.topup > 0n);
    const total = transfers.reduce((sum, b) => sum + b.topup, 0n);
    const bootstrap = budgets.find(b => b.role === 'bootstrap');
    assert(bootstrap.amount >= bootstrap.required + total + BigInt(transfers.length) * 10n * UNIT,
      'Parent cannot fund actors while retaining its gas budget');
    const deadline = BigInt(before.job.final_deadline);
    assert.equal(deadline, BigInt(old.run.deadlines_ns[4]));
    console.log('FINAL_DEADLINE_UTC=' + new Date(Number(deadline / 1000000n)).toISOString());
    console.log('RECOVERY_ELIGIBLE=' + (before.ns >= deadline));
    console.log('TOPUP_TOTAL_YOCTO=' + total);
    if (!live) { console.log('PUBLIC_REPAIR_CHECK: PASS; BROADCASTS=0'); return; }
    assert.equal(process.env.NMG_PUBLIC_REPAIR_APPROVAL, 'YES_RELEASE_8_UNITS_AND_FUND_EXISTING_TESTNET_ACTORS');
    assert(before.ns >= deadline, 'Final deadline not reached; no transactions sent');

    fs.mkdirSync(destination, {mode: 0o700});
    save(path.join(destination, 'plan.json'), {case: CASE, block: before.block,
      transfers: transfers.map(b => ({role: b.role, receiver: b.account_id, amount: b.topup.toString()}))});
    const near = require('near-api-js');
    const {baseEncode} = require('@near-js/utils');
    const {callSignedOnce} = require('./r7_13_tx_guard.cjs');
    const runtime = require('./r7_runtime.cjs');
    const store = new near.keyStores.InMemoryKeyStore();
    for (const role of ['bootstrap', 'keeper']) {
      const credential = runtime.credential(role);
      const key = near.KeyPair.fromString(credential.private_key);
      assert.equal(key.getPublicKey().toString(), credential.public_key);
      await store.setKey('testnet', credential.account_id, key);
    }
    const connection = await near.connect({networkId: 'testnet', nodeUrl: url, keyStore: store, deps: {keyStore: store}});
    const parent = await connection.account(PARENT);
    for (const budget of transfers) {
      const result = await transferSignedOnce({account: parent, receiver: budget.account_id, amount: budget.topup,
        file: path.join(destination, 'topup-' + budget.role + '.json'),
        transferAction: near.transactions.transfer, baseEncode, exchange});
      console.log('TESTNET_ACTOR_FUNDED:', budget.role, 'TX=' + result.tx);
    }
    const keeper = await connection.account('keeper.' + PARENT);
    const previousRpc = process.env.NMG_R7_13H_RPC_URL;
    process.env.NMG_R7_13H_RPC_URL = url;
    try {
      validateFailedState(await snapshot());
      await callSignedOnce({dir: destination, role: 'keeper', step: 'release-mandate-13', account: keeper,
        contractId: CONTRACT, method: 'release_expired_rescue_mandate', args: {job_id: 13}});
      await waitState(7);
      await callSignedOnce({dir: destination, role: 'keeper', step: 'expire-job-13', account: keeper,
        contractId: CONTRACT, method: 'expire_rescue_job', args: {job_id: 13}});
      const after = await waitState(8);
      const readyPrice = (await exchange('gas_price', [after.block])).gas_price;
      for (const b of budgets) {
        const account = await exchange('query', {request_type: 'view_account', account_id: b.account_id, block_id: after.block});
        const current = actorBudget(b.role, account, {...inputs, gasPrice: readyPrice});
        assert(current.amount >= current.required, 'Remaining actor balance too low: ' + b.role);
      }
      save(path.join(destination, 'completed.json'), {case: CASE, block: after.block,
        released_units: 8, escrow: after.totals.rescue_escrow, claimable: after.payouts[0]});
    } finally {
      if (previousRpc === undefined) delete process.env.NMG_R7_13H_RPC_URL;
      else process.env.NMG_R7_13H_RPC_URL = previousRpc;
    }
    // Preserve the complete failed attempt, rather than erasing its one-send journals.
    fs.renameSync(old.source, path.join(destination, 'failed-run'));
    fs.renameSync(path.join(keyRoot, 'technical-closure-launch-intent.json'), path.join(destination, 'failed-launch-intent.json'));
    console.log('FAILED_RUN_PRESERVED=' + path.join(destination, 'failed-run'));
    console.log('RELEASED_UNIT=8; ESCROW_UNIT=0; CLAIMABLE_UNIT=310');
    console.log('PUBLIC_REPAIR_COMPLETE: PASS');
  } finally { await broker.close(); }
}

if (require.main === module) main().catch(error => {
  console.error('PUBLIC_REPAIR_STOP:', error.stack || error);
  console.error('Inspect maintenance and failed-run journals before another live action.');
  process.exitCode = 1;
});
module.exports = {validateFailedState, transferSignedOnce, main, CASE, PARENT};
