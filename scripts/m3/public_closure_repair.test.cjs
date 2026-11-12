'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {actorBudget, UNIT} = require('./r7_public_budget.cjs');
const {validateFailedState, transferSignedOnce, CASE, PARENT} = require('./public_closure_repair.cjs');
const {createRpcBroker} = require('./r7_13h_rpc_broker.cjs');

const inputs = {gasPrice: '100000000', storagePrice: '10000000000000000000',
  quote: {case_storage_cost: '12330000000000000000000', job_storage_cost: '5760000000000000000000',
    offer_storage_cost: '6130000000000000000000'}, consentStorage: '40960000000000000000000',
  policies: Object.fromEntries(['buyer-1', 'buyer-2', 'provider-alpha', 'provider-beta', 'provider-gamma']
    .map(role => [role, {cap: 7, value: 10, outside_option: 0, bond: 12}]))};

test('NEP-642 purchase floor rejects the observed provider balance despite low block gas price', () => {
  const b = actorBudget('provider-gamma', {amount: '208045287332115700000000', storage_usage: 182}, inputs);
  assert.equal(b.purchasePrice, 1000000000n);
  assert(b.required > b.amount);
  assert.equal(b.required, 819950000000000000000000n);
  assert.equal(b.target, 850n * UNIT);
});

test('budget includes both buyer storage deposits, all calls, and maintenance keeper calls', () => {
  const buyer = actorBudget('buyer-1', {amount: '215778799744690100000000', storage_usage: 182}, inputs);
  assert.equal(buyer.required, 606540000000000000000000n);
  const keeper = actorBudget('keeper', {amount: '290850177860714300000000', storage_usage: 182},
    {...inputs, extraCalls: 2});
  assert.equal(keeper.calls, 5);
  assert.equal(keeper.target, 1350n * UNIT);
  const funded = actorBudget('buyer-1', {amount: buyer.target.toString(), storage_usage: 182}, inputs);
  assert.equal(funded.topup, 0n);
  assert.throws(() => actorBudget('unknown', {amount: '0', storage_usage: 0}, inputs));
});

function state(released = 0) {
  return {rescue: {id: [...Buffer.from(CASE, 'hex')], phase: 'Open', awarded_bundle_id: null,
    job_ids: [13], offer_ids: [], resolved_payloads: [null, null]},
  job: {id: 13, case_id: [...Buffer.from(CASE, 'hex')], buyer: 'buyer-1.' + PARENT,
    worker: 'worker0.' + PARENT, phase: released === 8 ? 'Expired' : 'Accepted',
    held_worker_reward: released === 8 ? '0' : UNIT.toString()},
  mandate: {job_id: 13, phase: released ? 'Released' : 'Open', locked_bundle_id: null,
    locked_allocation: null, held_principal: released ? '0' : (7n * UNIT).toString(),
    release_reason: released ? 'AwardExpired' : null},
  totals: {rescue_escrow: (BigInt(8 - released) * UNIT).toString(), storage_reserves: '383870000000000000000000'},
  payouts: [(BigInt(302 + released) * UNIT).toString(), '0']};
}

test('exact failed case conserves 8 UNIT across mandate release and worker expiry', () => {
  for (const released of [0, 7, 8]) validateFailedState(state(released), released);
  for (const damage of [
    s => { s.rescue.job_ids.push(14); }, s => { s.rescue.offer_ids.push(18); },
    s => { s.job.buyer = 'other.testnet'; }, s => { s.mandate.locked_allocation = '1'; },
    s => { s.payouts[1] = '1'; }, s => { s.totals.rescue_escrow = '0'; },
    s => { s.totals.storage_reserves = '0'; }
  ]) {
    const modified = state(); damage(modified);
    assert.throws(() => validateFailedState(modified));
  }
});

async function transferScenario({lostAck = false, wrongReceiver = false} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-transfer-test-'));
  const txBytes = Buffer.from('synthetic unsigned transfer');
  const hash = crypto.createHash('sha256').update(txBytes).digest();
  let signatures = 0, sends = 0;
  const account = {accountId: 'parent.testnet', signTransaction: async () => {
    signatures++;
    return [hash, {transaction: {encode: () => txBytes}, encode: () => Buffer.from('synthetic signed transfer')}];
  }};
  const file = path.join(directory, 'transfer.json');
  const args = {account, receiver: 'actor.parent.testnet', amount: UNIT, file,
    transferAction: amount => ({amount}), baseEncode: bytes => Buffer.from(bytes).toString('hex'),
    exchange: async method => {
      if (method === 'send_tx') { sends++; if (lostAck) throw Error('lost acknowledgement'); return {}; }
      return {final_execution_status: 'FINAL', status: {SuccessValue: ''},
        transaction: {hash: hash.toString('hex'), signer_id: account.accountId,
          receiver_id: wrongReceiver ? 'attacker.testnet' : 'actor.parent.testnet',
          actions: [{Transfer: {deposit: UNIT.toString()}}]}, receipts_outcome: []};
    }};
  return {args, file, counts: () => ({signatures, sends})};
}

test('native top-up reconciles a lost acknowledgement without signing or sending twice', async () => {
  const s = await transferScenario({lostAck: true});
  const result = await transferSignedOnce(s.args);
  assert.equal(result.state, 'confirmed');
  assert.deepEqual(s.counts(), {signatures: 1, sends: 1});
  await assert.rejects(transferSignedOnce(s.args), /already prepared/);
  assert.deepEqual(s.counts(), {signatures: 1, sends: 1});
});

test('native top-up refuses a mismatched finalized recipient', async () => {
  const s = await transferScenario({wrongReceiver: true});
  await assert.rejects(transferSignedOnce(s.args));
  assert.equal(JSON.parse(fs.readFileSync(s.file)).state, 'signed_not_confirmed');
});

async function post(url, id, method, params) {
  const response = await fetch(url, {method: 'POST', body: JSON.stringify({jsonrpc: '2.0', id, method, params})});
  return {status: response.status, body: await response.json()};
}

test('five slow INCLUDED sends do not expire behind one another or block signing reads', {timeout: 10000}, async () => {
  let active = 0, peak = 0, sends = 0, release, allStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { allStarted = resolve; });
  const broker = createRpcBroker({upstreams: ['https://read.invalid'], sendUpstream: 'https://send.invalid',
    maxConcurrentSends: 5, maxConcurrentReads: 4, minGapMs: 0, maxSendQueueWaitMs: 100,
    fetchImpl: async (_url, opts) => {
      const message = JSON.parse(opts.body);
      if (message.method === 'send_tx') {
        sends++; active++; peak = Math.max(peak, active);
        if (active === 5) allStarted();
        await gate; active--;
      }
      return new Response(JSON.stringify({jsonrpc: '2.0', id: message.id, result: {ok: true}}));
    }});
  const url = await broker.listen();
  let pending;
  try {
    pending = Promise.all(Array.from({length: 5}, (_, i) => post(url, i, 'send_tx',
      {signed_tx_base64: 'synthetic-' + i, wait_until: 'INCLUDED'})));
    await Promise.race([started, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(Error('Independent sends did not all start')), 1000);
      timer.unref();
    })]);
    await new Promise(resolve => setTimeout(resolve, 150));
    const read = await post(url, 'signing-read', 'query', {request_type: 'view_account', account_id: 'actor.testnet'});
    assert.equal(read.status, 200);
    const health = await (await fetch(url + 'health')).json();
    assert.equal(health.active_sends, 5);
    const duplicate = await post(url, 'duplicate', 'send_tx', {signed_tx_base64: 'synthetic-0', wait_until: 'INCLUDED'});
    assert.equal(duplicate.status, 409);
    release();
    assert((await pending).every(r => r.status === 200));
    assert.equal(peak, 5);
    assert.equal(sends, 5);
  } finally { release(); if (pending) await pending; await broker.close(); }
});
