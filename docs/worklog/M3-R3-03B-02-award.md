# M3-R3-03B-02 — Atomic RecoveryRight award

Date: 2026-11-04
Branch: feat/m2-escrow
Base: af9c518
Status: LOCAL PASS

## Implemented

- Permissionless award by rescue case ID.
- Deterministic funded provider pair.
- Capped-equal buyer cost allocation.
- Mandate locking and unused-cap refunds.
- Provider bond locking and excess-bond refunds.
- Two exclusive typed M2/M3 capacity locks.
- Persistent bundle and case award.
- Replay and arithmetic overflow protections.

## Verification

- Rust: 172 library + 11 market + 17 event + 6 ledger = 206 PASS.
- Focused award tests: 9 PASS.
- Clippy with -D warnings: PASS.
- Compatible WASM build: PASS.
- M2 primary, backup and settlement Sandbox: PASS.
- M3-R2 lifecycle Sandbox: PASS.
- M3-R3 offer release Sandbox: PASS.
- M3-R3 atomic award Sandbox: PASS.
- git diff --check: PASS.

WASM SHA-256: d77817ae80f14bfdb1845f1151069e168dbcc107cc8bf0cc89e518499e25e8fc

## Economic result

Three accepted jobs, four provider offers, winning pair [2, 3].
Bundle price: 12 units; buyer allocations: 4, 4, 4.
Following release of unselected offers:
111 escrow + 5 claimable = 116 original principal.
Storage reserves unchanged in this scenario.

## Limitations

Component proofs and terminal settlement are not implemented.
Public testnet and independent audit have not been performed.
No production-funds approval.
Other historical Sandbox suites were not rerun.

## Next action

M3-R4-00: specify authenticated component proofs and
success/default settlement economics.
