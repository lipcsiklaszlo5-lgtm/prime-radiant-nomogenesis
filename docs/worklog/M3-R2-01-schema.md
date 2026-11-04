# M3-R2-01 — Zero-liability persistent schema

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `b3eb084`
**State:** verified; ready for checkpoint commit

## Purpose

Introduce bounded M3 persistent record types before accepting M3 funds.
Protect active M3 principal in the native-withdrawal backing calculation and
close identified R1 arithmetic and admission boundaries.

## Builder command

`python3 scripts/m3/m3_r2_01_schema.py`

## Intended verification

- focused rescue-market boundary tests;
- empty-schema and serialized-record checks;
- withdrawal tests including active M3 liability;
- full Rust regression;
- Clippy with warnings denied;
- WASM target check;
- `git diff --check`.

## Claim boundary

No M3 funding, award, mutation or settlement endpoint is enabled. Serialized
Borsh length is not yet a real Sandbox storage-cost quote.

## Exactly one next action

Run verification and record the observed results before commit.

## First verification finding

- R1 rescue-market tests: 11 passed.
- M3 schema tests: 2 passed.
- Serialized Borsh lengths: case 292, job 266, mandate 68 bytes.
- Full regression passed, but the new withdrawal guard test was accidentally
  nested inside the preceding test and therefore was not registered.
- Clippy correctly rejected the nested test with `unnameable-test-items`.
- The test and the reproducible builder were corrected before commit.

## Final verification

- Focused rescue-market model: 11 passed, 0 failed.
- Empty-schema tests: 2 passed, 0 failed.
- Serialized Borsh lengths: case 292, job 266, mandate 68 bytes.
- Active M3 liability withdrawal guard: 1 passed, 0 failed.
- Full Rust suite: 145 passed, 0 failed.
  - 111 contract unit tests.
  - 11 rescue-market integration tests.
  - 17 storage-event integration tests.
  - 6 storage-ledger integration tests.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- `cargo check --locked --target wasm32-unknown-unknown`: PASS.
- `git diff --check`: PASS.
- Builder reproduction source was corrected and syntax-checked.
- `sandbox/real_low_margin_audit.cjs` remained untouched.

## Verified boundary

The contract now has empty bounded M3 collections, zero initial
`rescue_escrow`, and withdrawal backing that includes active M3 principal.
No M3 funding, award, proof or settlement endpoint is enabled.

## Exactly one next action

M3-R2-02: implement atomic funded rescue-job plus mandate creation with exact
attached deposit, storage admission, worker acceptance and authenticated views.
