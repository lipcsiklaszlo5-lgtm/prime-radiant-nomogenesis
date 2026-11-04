# M3-R2-03A — manual pre-award liability release

**Status:** verified
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `f19bad9`

## Purpose

Add the first terminal release paths for funded M3 principal:

- buyer cancellation of an unaccepted rescue job;
- buyer revocation of an open rescue mandate;
- exact one-time movement from `rescue_escrow` to the buyer's
  authenticated claimable balance;
- preservation of independent worker-reward and rescue-cap lifecycles.

This ticket does not add permissionless deadline expiry. That remains R2-03B.

## Economic rules

Cancellation before the dependency deadline releases:

- the still-held worker reward; and
- the rescue cap only when its mandate is still open.

A previously revoked mandate is not credited twice. Its release reason remains
`Revoked`.

Mandate revocation releases only the still-held rescue cap. It does not cancel
or pay the worker job.

Every successful release performs equal and opposite accounting:

`rescue_escrow -= released`
`claimable_total += released`
`claimable[buyer] += released`

## Intended evidence

- only the buyer may cancel or revoke;
- accept/cancel ordering has one valid terminal outcome;
- cancellation releases reward plus an open cap once;
- revocation releases only the cap;
- revoke-then-cancel releases the two principals once each;
- claimable overflow changes no persistent job, mandate or escrow state;
- terminal state and totals survive reload.

## Files

- `src/lib.rs`
- `src/rescue_release_tests.rs`
- `scripts/m3/m3_r2_03a_manual_release.py`
- `docs/worklog/M3-R2-03A-manual-release.md`

## Next single action

Run focused tests. If green, run the full Rust, Clippy, WASM and diff gates before
committing. Then implement R2-03B permissionless deadline expiry.

## Final verification

Base commit: `f19bad9`.

Commands and results:

- `cargo test --locked rescue_release_tests -- --nocapture`
  - 6 passed, 0 failed; exit code 0.
  - Panic output came only from expected rejection assertions.
- `cargo test --locked`
  - 127 unit tests, 11 rescue-model tests, 17 storage-event tests and
    6 storage-ledger tests passed; 161 total, 0 failed; exit code 0.
- `cargo clippy --locked --all-targets -- -D warnings`
  - passed; exit code 0.
- `cargo check --locked --target wasm32-unknown-unknown`
  - passed; exit code 0.
- `git diff --check`
  - passed; exit code 0.

Verified invariants:

- only the immutable buyer can cancel or revoke;
- cancellation is valid only while the job awaits worker acceptance;
- accepted jobs cannot use the cancellation path;
- cancellation releases held reward and only a still-open mandate cap;
- revocation releases only the cap and preserves the worker job;
- revoke-then-cancel credits the cap and reward exactly once each;
- terminal phases reject replay;
- credit overflow mutates no persistent job, mandate or escrow value;
- released value decreases `rescue_escrow` and increases claimables equally;
- terminal records and aggregate totals survive state reload.

Not yet verified:

- permissionless dependency-deadline expiry;
- permissionless award-close release of open mandates;
- accepted-job expiry at its final deadline;
- bundle award, provider bonding or recovery settlement;
- local NEAR Sandbox or public testnet execution.

Next single action: M3-R2-03B permissionless deadline expiry.
