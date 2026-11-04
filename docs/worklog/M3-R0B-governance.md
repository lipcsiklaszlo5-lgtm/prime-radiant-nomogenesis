# M3-R0B — Governance alignment

- Date: 2026-11-04
- Branch: feat/m2-escrow
- Base commit: aceae9b
- Scope: documentation only

## Result

- Replaced the stale PROJECT_MASTER with the current rescue-market master.
- Replaced the stale current STATUS section while preserving M1/M2 history.
- Updated AGENTS scope, read order and M3 milestones.
- Updated HANDOFF and README to point to M3-R1.
- No Rust/NEAR source was changed.

## Verification

- Exact source markers checked before mutation.
- git diff --check executed.
- No Rust, Sandbox or testnet test was run.

## Next action

Review and commit M3-R0, then implement M3-R1 without persistent NEAR state changes.
