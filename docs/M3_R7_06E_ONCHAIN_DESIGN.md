# R7-06E/02 — Versioned NEAR Authorization Design

Status: pure Rust state-machine design only.
Base: ca9e354.

## Preserved

Existing M2/M3 contract, account state, storage
layout, published WASM and Testnet receipts remain
unchanged.

## Proposed New Contract API

1. register_rescue_coalition_consent
   - Authenticated via env::predecessor_account_id.
   - Case, job, buyer, chain, contract bound.
   - Exact payment, maximum payment, expiry, nonce.
   - Commitment to entire selected coalition,
     provider pair and fee through plan hash.
   - Storage paid and separately accounted.

2. revoke_rescue_coalition_consent
   - Only registered buyer.
   - Before successful atomic award.
   - Nonce cannot be reused.
   - Failed/replayed withdrawals do not mutate state.

3. award_authorized_rescue_bundle
   - Revalidate current funded case and offers.
   - Check every selected buyer's consent.
   - Recompute provider and exact allocation.
   - Reject wrong pair, scope, stale values or nonce.
   - Compute all refunds and liabilities.
   - Commit entire transition in one synchronous
     NEAR transaction after successful checks.
   - Publish auditable event and receipt.

## Critical Compatibility Constraints

Old award_rescue_bundle(case_id) must NOT bypass
authorization for an explicitly protected case.
Legacy cases must remain compatible.

Changing the existing Borsh contract_state structure
in place is unsafe without explicit migration.
Use a versioned contract design and separate
storage accounting for new consent records.

No additional cross-contract promise can be treated
as part of a synchronous atomic award.

Excluded workers, refunds, original-provider
recovery rights, case storage deposits, offer
storage bonds and global claimable liabilities
need full end-to-end tests.

A non-excludable shared physical benefit remains
outside smart-contract enforcement.

## Security and Proof Boundaries

The R7-06E/02 test harness supplies the
`caller` string. It is NOT a real authenticated
NEAR account, signature or chain predecessor.

The state machine tests failure-before-commit
on cloned in-memory state, NOT persistent NEAR
storage or Sandbox rollback.

The proposed plan hash binds:
- Case ID, network and contract.
- Award window.
- Selected job identifiers.
- Selected provider IDs, accounts, slots and fees.
- Total recovery price.

Buyer records additionally bind exact payments,
caps, expiry and one-time nonces.

No deployed contract or Testnet transaction changed.

## Next Gate — R7-06E/03

Implement a versioned NEAR-compatible authorization
adapter and Sandbox tests.

Must prove:
- Real predecessor account authorization.
- Persistent nonce/consent registry and storage funding.
- Correct phase transitions and atomic failure rollback.
- No legacy award bypass.
- Exact refunds with M2/M3 global ledger conservation.
- No premature worker or provider release.
- Sandbox replay, failure and migration protections.

Deployment requires separate approval after these
checks and independent security review.
