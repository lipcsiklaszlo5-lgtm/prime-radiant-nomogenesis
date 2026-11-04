# M3-R2-02A — Canonical case and storage quote

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `b9e53f1`
**State:** verified; ready for checkpoint commit

## Purpose

Create immutable rescue cases using a contract-bound canonical identifier and
a storage-only payable entrypoint. Establish bounded case and future job quotes
before enabling worker reward or rescue-cap funding.

## Quote derivation

The quote uses:

- measured 40-byte raw key/value overhead;
- actual M3 storage-prefix and key lengths;
- exact maximum Borsh record lengths;
- six future case job references;
- one future bundle identifier;
- two bounded 256-byte resolved payloads;
- job, mandate and worst-case buyer claimable records.

Case quote: 893 bytes.

Future job-plus-mandate quote: 576 bytes.

## Builder command

`python3 scripts/m3/m3_r2_02a_case_quote.py`

## Intended verification

- exact descriptor and deposit rejection;
- canonical duplicate rejection;
- explicit `LookupMap::flush()` storage measurement;
- state reload;
- full Rust regression;
- Clippy, WASM target and diff checks.

## Claim boundary

This checkpoint accepts only case storage payment. It does not accept worker
reward, rescue cap or provider bond. Host-unit storage measurement is not yet
real Sandbox evidence.

## Exactly one next action

Verify and checkpoint R2-02A, then implement atomic funded job plus mandate.

## First verification finding

- Exact maximum serialized lengths passed:
  case 814, job 266 and mandate 68 bytes.
- Three of four focused case tests passed.
- Initial case write measured 256 bytes against the 893-byte bounded quote.
- The duplicate-case test compared `storage_usage` across separately created
  unit-test contexts. The new context restored its configured counter, so that
  cross-context comparison was not a valid persistence assertion.
- The corrected test compares the complete stored case before and after the
  rejected replay and separately verifies unchanged storage liability.
- Contract creation and admission logic required no correction.

## Second verification finding

- All four focused case tests passed.
- Initial case storage measured 256 bytes against the 893-byte bounded quote.
- Full Rust regression passed.
- Clippy rejected the original eight-argument public case-creation method.
- The public API now accepts one typed `RescueCaseDescriptorInput`.
- No Clippy suppression was added.
- Case hashing, storage accounting and persistent records are unchanged.

## Final verification

- Exact maximum serialized records:
  - case: 814 bytes;
  - job: 266 bytes;
  - mandate: 68 bytes.
- Focused case tests: 4 passed, 0 failed.
- Initial case storage write: 256 measured bytes.
- Bounded case quote: 893 bytes.
- Future job-plus-mandate quote: 576 bytes.
- Full Rust suite: 149 passed, 0 failed.
  - 115 contract unit tests;
  - 11 rescue-market integration tests;
  - 17 storage-event integration tests;
  - 6 storage-ledger integration tests.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- `cargo check --locked --target wasm32-unknown-unknown`: PASS.
- `git diff --check`: PASS.
- Public case creation accepts one typed descriptor object.
- No lint suppression was added.
- `sandbox/real_low_margin_audit.cjs` remained untouched.

## Verified boundary

The contract can create immutable, contract-bound rescue cases using exact
storage-only payment. The 893-byte quote covers the largest designed case
record, six future job references, one bundle ID and two bounded payloads.

No worker reward, rescue cap or provider bond is accepted by this checkpoint.
The 256-byte measurement is host-unit evidence, not yet real Sandbox evidence.

## Exactly one next action

M3-R2-02B: implement atomic funded rescue job plus mandate, worker acceptance,
authenticated views and exact `reward + cap + 576-byte quote` admission.
