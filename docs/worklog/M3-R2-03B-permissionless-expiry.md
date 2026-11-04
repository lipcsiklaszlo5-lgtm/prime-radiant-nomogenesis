# M3-R2-03B — permissionless deadline expiry

**Status:** verified
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `a083eb2`

## Purpose

Prevent abandoned M3 capital from remaining trapped when a buyer, worker or
keeper stops acting.

This ticket adds three permissionless terminal transitions:

1. unaccepted job expiry at `dependency_deadline`;
2. open mandate release at `award_close`;
3. accepted job expiry at `final_deadline`.

## Boundary rule

Every active action uses a strict pre-deadline condition. Its matching expiry
uses an inclusive post-deadline condition:

- worker acceptance: `now < dependency_deadline`;
- unaccepted expiry: `now >= dependency_deadline`;
- future bundle award: `now < award_close`;
- open-mandate expiry: `now >= award_close`;
- future job proof: `now < final_deadline`;
- accepted-job expiry: `now >= final_deadline`.

There is no timestamp where both competing transitions are valid.

## Economic rules

- Unaccepted expiry returns held worker reward and any still-open rescue cap.
- A previously revoked or award-expired cap is not credited twice.
- Award expiry releases only an open, unlocked cap.
- A locked mandate remains protected for later bundle settlement.
- Accepted-job expiry releases only the worker reward.
- Every release decreases `rescue_escrow` by exactly the claimable credit.
- Any account may trigger expiry, but value always returns to the immutable
  buyer.

## Intended evidence

- exact-boundary behavior;
- permissionless callers cannot redirect value;
- replayed expiry creates no second credit;
- locked mandates cannot escape through award expiry;
- worker reward and rescue cap remain independent;
- overflow preserves all persistent economic state;
- terminal state and totals survive reload.

## Files

- `src/lib.rs`
- `src/rescue.rs`
- `src/rescue_expiry_tests.rs`
- `scripts/m3/m3_r2_03b_permissionless_expiry.py`
- `docs/worklog/M3-R2-03B-permissionless-expiry.md`

## Next single action

Run focused tests. If green, run the complete Rust, Clippy, WASM and diff gates
before committing the completed R2-03 liability lifecycle.

## Final verification

Base commit: `a083eb2`.

Commands and results:

- `cargo test --locked rescue_expiry_tests -- --nocapture`
  - 7 passed, 0 failed; exit code 0.
  - Panic output came only from expected rejected transitions.
- `cargo test --locked`
  - 134 unit tests, 11 rescue-model tests, 17 storage-event tests and
    6 storage-ledger tests passed; 168 total, 0 failed; exit code 0.
- `cargo clippy --locked --all-targets -- -D warnings`
  - passed; exit code 0.
- `cargo check --locked --target wasm32-unknown-unknown`
  - passed; exit code 0.
- `git diff --check`
  - passed; exit code 0.

Verified invariants:

- acceptance and unaccepted expiry cannot both be valid at one timestamp;
- award and open-mandate expiry use disjoint time windows;
- future completion and accepted-job expiry have a disjoint boundary;
- any caller may trigger expiry but value always credits the stored buyer;
- unaccepted expiry returns reward and only still-held mandate principal;
- award expiry cannot release a locked mandate;
- accepted-job expiry leaves mandate principal independent;
- replay cannot create a second claim;
- claimable overflow mutates no job, mandate or escrow state;
- terminal records, claimables and aggregate totals survive reload;
- every successful release decreases `rescue_escrow` by its exact credit.

Not yet verified:

- real local NEAR Sandbox receipts and account separation;
- native withdrawal of M3-generated claimables;
- bundle award, provider bonding or recovery-proof settlement;
- public testnet operation.

Next single action: M3-R2-04 multi-party Sandbox reproduction.
