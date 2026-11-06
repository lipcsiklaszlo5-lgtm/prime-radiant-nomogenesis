# R7-06E/03B-06 — Integrated V2 checkpoint

Date: 2026-11-06
Branch: feat/r7-06e-03b-m3-atomic
Base commit: 3901662

## Implemented

- Buyer-authenticated consent against funded M3 jobs.
- Deterministic coalition planning and SHA-256 plan hash.
- Exact-payment, expiry and nonce verification.
- Atomic subset award using shared M3 accounting.
- Excluded buyer mandate refunds.
- Legacy award disabled under feature r7-v2.
- Existing provider and worker settlement paths reused.

## Verification

- V2 award and plan tests: 14 PASS.
- V2 funded consent tests: 5 PASS.
- Legacy guard tests: 2 PASS.
- Default M3 regression: 210 PASS.
- Strict Clippy: normal and V2 builds PASS.
- NEAR-compatible V2 WASM and ABI: PASS.
- Earlier local Sandbox success settlement: PASS.
- Three fresh local Sandbox default scenarios: PASS.
- Transaction rejection and state rollback checked.
- Economic conservation: 48 UNIT.

Machine-readable evidence index:
docs/evidence/R7-06E-03B-06.json

Full fresh Sandbox logs were retained locally during
checkpoint verification; their SHA-256 digests are
recorded in the evidence index.

## Compatible WASM SHA-256

2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e

Build with RUSTFLAGS="--cfg near", --features r7-v2,
and the compatibility passes in scripts/build-wasm.sh.
The compiled artifact is not part of this commit.

## Reproduction

Set NOMOGENESIS_V2_WASM to the compatible V2 WASM.

Run:

- node sandbox/r7_v2_abi_smoke.cjs
- node sandbox/r7_v2_atomic_economic.cjs
- node sandbox/r7_v2_terminal_economic.cjs

Run sandbox/r7_v2_provider_defaults.cjs with each:
R7_DEFAULT_SCENARIO=first-default,
second-default and both-default.

## Limitations

- Consent storage refunds are not implemented.
- No independent security audit.
- No V2 public Testnet transaction.
- No state migration validation.
- Benefit exclusion/free-rider economics unresolved.
- Explicit valid-sibling, altered-payload attack
  remains a separate regression requirement.

## Next ticket

R7-06E/03B-07: consent storage bond accounting
and release lifecycle, with NEAR backing checks.
