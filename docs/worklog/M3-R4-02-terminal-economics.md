# M3-R4-02 — pure terminal economics

Base: `0392d17`
Branch: `feat/m2-escrow`
Ticket state: verified pure Rust economic implementation

## Purpose

Produce an immutable, deterministic terminal settlement
plan for two providers and at most six positive sponsors.
Require exact Q provider bonds and 3Q conservation.

## Modified files

- `src/rescue_settlement.rs`
- `src/lib.rs`
- `docs/HANDOFF.md`
- `docs/worklog/M3-R4-02-terminal-economics.md`

## Verification commands

- `cargo fmt --all -- --check`
- `cargo test --locked --lib rescue_settlement::tests`
- `cargo test --locked --quiet`
- `cargo clippy --locked --all-targets -- -D warnings`
- `git diff --check`

## Observed verification — 2026-11-04

- Focused economic tests: 10 passed, 0 failed, exit 0.
- Full Rust suite: 187 + 11 + 17 + 6 = 221 PASS,
  exit 0.
- `cargo fmt --all -- --check`: PASS, exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`:
  PASS, exit 0.
- `npm run wasm:build`: PASS, exit 0.
- Compatible WASM SHA-256: `6d3affd31a7cf271de959d1affa112b3166321a3c7aca351445c5ce2c6d07f71`.
- `git diff --check`: checked at checkpoint.
- No R4-02 Sandbox was performed.
- Current on-chain settlement status: NOT IMPLEMENTED.

## Limitations

Pure model only. R4-03 must independently authenticate
offers, mandates, buyers, typed capacity owners, time,
escrow backing and grouped claimable overflow before
performing any persistent writes.

## Next action

M3-R4-03: implement atomic authenticated on-chain settlement.
