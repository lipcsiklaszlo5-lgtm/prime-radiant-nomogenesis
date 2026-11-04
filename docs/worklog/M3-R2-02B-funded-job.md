# M3-R2-02B — Atomic funded rescue job and mandate

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `df44175`
**Status:** verified

## Purpose

Enable the first M3 economic transaction: a buyer atomically creates one
worker job and one bounded rescue mandate with fully attached principal.

## Funding identity

Required attached value is exactly:

`worker_reward + rescue_cap + job_storage_quote`

The economic principal enters `rescue_escrow`. Storage payment enters
`storage_reserves`. Worker acceptance changes authority state but does not
create, release or reclassify money.

## Enforced boundaries

- authenticated buyer from `predecessor_account_id`;
- distinct buyer and worker;
- existing open case before dependency deadline;
- final job deadline after recovery deadline;
- positive reward and rescue cap;
- exact result commitment and profile/threshold pairing;
- one buyer per case;
- at most six jobs per case;
- checked principal, escrow, storage and ID arithmetic;
- rejected calls consume no ID and create no partial record.

## Builder command

`python3 scripts/m3/m3_r2_02b_funded_job.py`

## Intended verification

- exact deposit and atomic dual-record creation;
- liability and storage separation;
- buyer duplication and six-job boundary;
- worker authorization, deadline and replay;
- malformed and overflow rejection;
- state reload;
- full Rust regression, Clippy, WASM and diff checks.

## Claim boundary

This checkpoint does not release principal, award bundles, accept recovery
proofs or perform native payout. Sandbox deposit evidence remains pending.

## Exactly one next action

Verify R2-02B before commit.

## First verification finding

The first focused compilation stopped before running tests because three
negative-test closures returned the funding endpoint's `u64` result while the
shared rejection helper accepted only unit-returning closures. The helper is
now generic over the ignored return type. No contract logic changed.

## Verified checkpoint

Base commit: `df44175`.

The first focused compile exposed a test-helper type restriction: three
rejection closures returned the funded job ID while the helper accepted only
unit-returning closures. The helper and the reproducible builder now accept a
generic return type. No contract logic changed in that repair.

Commands and observed results:

- `cargo test --locked rescue_funding_tests -- --nocapture`
  - 6 passed, 0 failed; exit code 0.
  - `M3_JOB_STORAGE measured=307 quoted=576`.
- `cargo test --locked`
  - 121 unit tests, 11 rescue-model tests, 17 storage-event tests and
    6 storage-ledger tests passed; 155 total, 0 failed; exit code 0.
- `cargo clippy --locked --all-targets -- -D warnings`
  - passed; exit code 0.
- `cargo check --locked --target wasm32-unknown-unknown`
  - passed; exit code 0.
- `git diff --check`
  - passed; exit code 0.

Verified behavior:

- funded job and rescue mandate creation is atomic;
- the exact deposit is worker reward plus rescue cap plus storage funding;
- rejected funding does not consume IDs or mutate collections and totals;
- one buyer cannot create two jobs in the same case;
- one case cannot exceed six jobs;
- only the designated worker can accept before the dependency deadline;
- acceptance does not alter `rescue_escrow` or storage reserves;
- funded records and totals survive state reload;
- the separate M3 withdrawal-liability boundary remains active.

Not yet verified:

- cancellation, mandate revocation or deadline expiry;
- one-time conversion from `rescue_escrow` to claimable balances;
- bundle award, provider bonds or recovery-proof settlement;
- local NEAR Sandbox or public testnet execution.

Next single action: M3-R2-03 terminal release paths for pre-award liabilities.
