# M3-R4-01 — authenticated component proof

Date: 2026-11-04
Branch: feat/m2-escrow
Base commit: 10338cf
Status: local unit, integration and Sandbox PASS

## Purpose

Accept committed recovery components exclusively from
the immutable selected provider before recovery deadline.
Persist proof state without moving economic principal,
releasing capacity or paying worker rewards.

## Files

- src/rescue_proof.rs
- src/rescue_clearing_tests.rs
- src/lib.rs
- sandbox/m3_component_proof.cjs
- scripts/m3/safe_shell.sh
- package.json
- AGENTS.md
- docs/STATUS.md
- docs/HANDOFF.md
- docs/worklog/M3-R4-01-proof.md

## Commands and observed evidence

- `cargo test --locked --quiet`:
  177 library + 11 + 17 + 6 = 211 PASS.
- `cargo clippy --locked --all-targets -- -D warnings`:
  PASS.
- `cargo fmt --all -- --check`: PASS.
- `npm run wasm:build`: PASS.
- WASM SHA-256:
  51466911e11d2c4df741d0aa86823e69d9fc472b113b8eb94a3bcef671f2055a
- `NOMOGENESIS_WASM=$PWD/target/nomogenesis_compatible.wasm node sandbox/m3_component_proof.cjs`:
  SANDBOX/M3-R4-01 RESULT: PASS.
- Sandbox evidence: two valid provider submissions,
  unauthorized and forged proofs rejected, duplicate
  rejected, payloads persisted, locks and funds unchanged.
- Safe shell runner reports the child exit code without
  terminating the interactive terminal.

## Known boundaries

Expected failed on-chain receipts are intentional tests.
Merkle proof authenticates committed bytes, not physical work.
Public testnet and independent security audit not performed.
Terminal settlement and worker completion not implemented.
Actual post-proof storage growth not independently measured.

## Next action

M3-R4-02: pure deterministic success and default
settlement model; preserve exactly 3Q including integer
remainder handling and positive-sponsor eligibility.
