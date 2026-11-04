# M3-R4-05 — reproducibility checkpoint

Date: 2026-11-04
Base commit: `6edc066`
Branch: `feat/m2-escrow`

## Observed evidence

- Fresh GitHub clone and locked dependencies: PASS.
- Rust: 242 tests PASS, fmt and strict Clippy PASS.
- Compatible WASM rebuild: byte-identical SHA-256
  `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`.
- 26 existing M2/M3 Sandbox/audit gates: PASS.
- Initial storage cost-policy audit: FAIL because
  measured shared state was 360, not 257 bytes.
- Verified total storage growth: 2442, not 2339 bytes.
- Both corrected offline storage audits: PASS.
- Withdrawal failure injection: PASS; source and WASM restored.
- Overall: 29/29 gates PASS with two corrected audit files.

## Changes

- `sandbox/storage_cost_policy_audit.cjs`
- `sandbox/storage_backing_stress.cjs`
- `docs/STATUS.md`, `docs/HANDOFF.md`, `AGENTS.md`
- `README.md` and this worklog.

The audit changes adjust fixture-specific storage expectations.
They are not an authorization for new on-chain refunds.

## Limits

Public testnet, external audit, production funding and
real-world service verification remain unproven.

## Next action

M3-R5 independent signer and real data-work demo.
