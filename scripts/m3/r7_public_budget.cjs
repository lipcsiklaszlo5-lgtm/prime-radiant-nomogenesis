'use strict';

const assert = require('node:assert/strict');
const UNIT = 10n ** 21n;
const PURCHASE_PRICE_FLOOR = 10n ** 9n;
// The actual calls attach 200 Tgas. Reserve another 50 Tgas for action fees.
const GAS_PER_CALL = 250000000000000n;
const CALLS = Object.freeze({bootstrap: 1, 'buyer-1': 2, 'buyer-2': 2,
  'buyer-3': 0, 'provider-alpha': 1, 'provider-beta': 3, 'provider-gamma': 3,
  'provider-delta': 0, worker0: 2, worker1: 2, keeper: 3});

function actorBudget(role, account, {gasPrice, storagePrice, quote, consentStorage, policies, extraCalls = 0}) {
  assert(Object.hasOwn(CALLS, role), 'Unknown role');
  assert(Number.isSafeInteger(extraCalls) && extraCalls >= 0);
  const calls = CALLS[role] + extraCalls;
  const blockPrice = BigInt(gasPrice);
  assert(blockPrice > 0n && BigInt(storagePrice) > 0n);
  // NEP-642 buys receipt gas at >= 1e9, even when gas_price reports 1e8.
  const purchasePrice = blockPrice > PURCHASE_PRICE_FLOOR ? blockPrice : PURCHASE_PRICE_FLOOR;
  let deposits = 0n;
  if (role === 'bootstrap') deposits = BigInt(quote.case_storage_cost);
  if (role === 'buyer-1' || role === 'buyer-2') {
    const p = policies[role];
    const cap = Math.min(p.cap, p.value - p.outside_option);
    assert(Number.isSafeInteger(cap) && cap > 0);
    deposits = (1n + BigInt(cap)) * UNIT + BigInt(quote.job_storage_cost) + BigInt(consentStorage);
  }
  if (role.startsWith('provider-') && calls) {
    deposits = BigInt(policies[role].bond) * UNIT + BigInt(quote.offer_storage_cost);
  }
  // Reserving each call's full gas avoids depending on refund timing.
  const storage = BigInt(account.storage_usage) * BigInt(storagePrice);
  const required = storage + deposits + BigInt(calls) * GAS_PER_CALL * purchasePrice +
    (calls ? 50n * UNIT : 0n);
  const amount = BigInt(account.amount);
  const quantum = 50n * UNIT;
  const target = ((required + quantum - 1n) / quantum) * quantum;
  return {role, calls, amount, required, target, purchasePrice,
    topup: amount < required ? target - amount : 0n};
}

module.exports = {actorBudget, CALLS, UNIT, PURCHASE_PRICE_FLOOR};
