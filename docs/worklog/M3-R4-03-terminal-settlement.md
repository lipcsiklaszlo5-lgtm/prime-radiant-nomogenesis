# M3-R4-03 — atomic terminal settlement

Base: `0866b77`
Branch: `feat/m2-escrow`
State: Rust and deployed local NEAR Sandbox verified

## Goal

Permissionless terminal settlement using the verified
R4-02 3Q allocation engine and existing claimable ledger.
Validate deadline, proof, selected provider, sponsor,
typed slot and accounting preconditions before writes.

## Changed files

- src/rescue_terminal.rs
- src/rescue_terminal_tests.rs
- src/lib.rs
- docs/HANDOFF.md
- docs/worklog/M3-R4-03-terminal-settlement.md

## Validation commands

- cargo fmt --all -- --check
- cargo test --locked --lib rescue_terminal_tests
- cargo test --locked --quiet
- cargo clippy --locked --all-targets -- -D warnings
- git diff --check

## Actual evidence — 2026-11-04

- Focused settlement integration: 7 PASS, exit 0.
- Full Rust regression: 194 + 11 + 17 + 6 = 228 PASS.
- Strict Clippy and rustfmt: PASS.
- Fresh compatible WASM: PASS.
- SHA-256: `ae3c6f8e9742004d89b8b08c74ebf2f732b72a40879eb8ce0174b1eab02191b9`.
- `node sandbox/m3_terminal_settlement.cjs`:
  SANDBOX/M3-R4-03 RESULT: PASS, exit 0.
- Four independent rescue cases, all terminal paths PASS.
- Early/default replay rejection PASS.
- Proof persistence, typed slots, mandate releases PASS.
- Economic conservation: 300 + 156 = 456 before payout.
- Native withdrawal 20, callback finalized:
  300 + 136 + 20 = 456 afterward.
- Contract storage delta over settlement sequence: -791 bytes.
- Initial Sandbox attempt failed the payout-net-balance
  assertion because 0.001 NEAR was smaller than transaction
  costs. Raising withdrawal to 0.020 NEAR fixed the test.
- No on-chain financial model changes during test repair.
- Public testnet and independent audit not performed.
- No claims about physical delivery verification.

## Boundaries

Rust integration does not prove local Sandbox operation.
Actual native withdrawals and storage deltas require
separate R4-03 Sandbox verification.

## Next action

M3-R4-04: authenticated worker result and reward lifecycle.
