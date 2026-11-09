'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {verifyProviderWithdrawal} = require('./r7_13_live_completion.cjs');
const {createRpcBroker} = require('./r7_13h_rpc_broker.cjs');

function withdrawal() {
  const contract = 'market.testnet', signer = 'provider.testnet';
  const transfer = {receipt_id: 'transfer', predecessor_id: contract, receiver_id: signer,
    receipt: {Action: {actions: [{Transfer: {deposit: '17'}}]}}};
  const callback = {receipt_id: 'callback', predecessor_id: contract, receiver_id: contract,
    receipt: {Action: {actions: [{FunctionCall: {method_name: 'on_withdraw_complete'}}]}}};
  return {state: 'confirmed', signer, tx: 'hash', outcome: {
    final_execution_status: 'FINAL', transaction: {hash: 'hash', signer_id: signer,
      receiver_id: contract, actions: [{FunctionCall: {method_name: 'withdraw',
        args: Buffer.from('{"amount":"17"}').toString('base64')}}]},
    receipts: [transfer, callback], receipts_outcome: [transfer, callback].map(r =>
      ({id: r.receipt_id, outcome: {executor_id: r.receiver_id, status: {SuccessValue: ''}}}))}};
}

test('native payout requires the requested amount, recipient and successful callback', () => {
  assert.equal(verifyProviderWithdrawal(withdrawal(), 'market.testnet', 17n), 17n);
  for (const damage of [
    r => {r.outcome.receipts[0].receiver_id = 'attacker.testnet';},
    r => {r.outcome.receipts_outcome[1].outcome.status = {Failure: {}};},
    r => {r.outcome.receipts[0].receipt.Action.actions[0].Transfer.deposit = '18';},
    r => {r.outcome.final_execution_status = 'EXECUTED_OPTIMISTIC';}
  ]) {
    const record = withdrawal(); damage(record);
    assert.throws(() => verifyProviderWithdrawal(record, 'market.testnet', 17n));
  }
});

test('unknown hash on one finality node falls back by read only', async () => {
  const calls = [];
  const broker = createRpcBroker({upstreams: ['https://bulk.invalid'],
    finalityUpstreams: ['https://first.invalid', 'https://second.invalid'],
    fetchImpl: async (url, opts) => {
      const message = JSON.parse(opts.body);
      assert.equal(message.method, 'tx'); calls.push(url);
      return new Response(JSON.stringify({jsonrpc: '2.0', id: message.id,
        ...(url.includes('first') ? {error: {cause: {name: 'UNKNOWN_TRANSACTION'}}} :
          {result: {final_execution_status: 'FINAL'}})}));
    }});
  const url = await broker.listen();
  try {
    const response = await fetch(url, {method: 'POST', body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tx', params: {wait_until: 'NONE'}})});
    assert.equal((await response.json()).result.final_execution_status, 'FINAL');
    assert.deepEqual(calls, ['https://first.invalid', 'https://second.invalid']);
  } finally { await broker.close(); }
});
