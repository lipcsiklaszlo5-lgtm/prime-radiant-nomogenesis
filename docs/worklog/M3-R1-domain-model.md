# M3-R1 — Pure rescue-market domain model

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `eb81676`
**State:** scaffold created; verification pending

## Scope

Implement deterministic capped-equal buyer allocation, bounded two-component offer clearing, full-bond admissibility and conservation-checked bundle settlement.

The model is imported only by `tests/rescue_market_model_spec.rs`. It is not declared in `src/lib.rs`; this step does not add persistent contract state or NEAR entry points.

## Verification

Commands run for this checkpoint:

- `cargo fmt --all -- --check`
- `cargo test --locked --test rescue_market_model_spec`
- `cargo test --locked`
- `cargo clippy --locked --all-targets -- -D warnings`
- `git diff --check`

Record their actual results before committing.

## Exactly one next action

If every verification command passes, update `docs/STATUS.md` and `docs/HANDOFF.md` with the observed results.

## Focused test finding

The first focused run had 6 passing tests and 1 failing test. The clearing test's
cheap offers inherited a bond of 12 from its helper, so the model correctly
accepted their combined price of 2. The fixture now gives those offers a bond
of 1, below the required full-bundle bond.

A fixture-javítás utáni fordítás egy hibás függvénynevet jelzett: a teszt
`clear`-t hívott, miközben a scaffold meglévő API-ja `clear_bundle`. A hívás
most az API nevéhez igazodik.

## Final verification

- Focused M3-R1 tests: 7 passed, 0 failed.
- Full `cargo test --locked`: passed.
- `cargo clippy --locked --all-targets -- -D warnings`: passed.
- `git diff --check`: passed.
- The first focused failure was caused by an over-collateralized test fixture; after correcting its bond and matching the existing `clear_bundle` API, all focused tests passed.

## Pushed checkpoint

- Commit: `14dc877` (`feat(m3): add rescue market domain model`)
- Push: `origin/feat/m2-escrow` succeeded.
- Next: M3-R2 storage design for funded jobs, rescue mandates and separate M3 liability.
