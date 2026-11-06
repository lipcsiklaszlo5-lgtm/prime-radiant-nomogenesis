# R7-06E/03A — NEAR Authorization Registry

Date: 2026-11-06
Branch: `feat/r7-06e-03-auth`
Base: `fdb7098`

## Scope

A separate V2 NEAR contract with predecessor-authenticated
buyer consent, case/contract/domain scope, exact payment,
expiry, persistent nonce consumption and owner revocation.

The existing M2/M3 contract remains unchanged.

## Implementation

- `contracts/r7-auth-v2/Cargo.toml`
- `contracts/r7-auth-v2/Cargo.lock`
- `contracts/r7-auth-v2/src/lib.rs`
- `contracts/r7-auth-v2/tests/authorization.rs`
- `sandbox/r7_06e_auth_registry.cjs`

Dependencies retain the compatible M3 near-sdk 5.30.0
family, including near-sdk-env 0.1.8 and near-sys 0.4.0.

## Observed checks

- V2 Rust authorization: 8 tests PASS.
- Strict Clippy: PASS.
- Original M3 library regression: 210 tests PASS.
- WASM release build and wasm-opt: PASS.
- Optimized WASM SHA-256:
  `1384f645cfbde3801d9af11e8b8c9b20c41463374421e90aeab315f189d6fd46`
- Local NEAR Sandbox: PASS.
- Separate buyer transactions: PASS.
- Persistent consent and nonce queries: PASS.
- Forged buyer and unauthorized revocation: rejected.
- Underfunded write and consumed nonce replay: rejected.
- Observed state snapshot unchanged after rejections.
- Three registrations, one revocation.
- Observed net storage increase: 689 bytes.
- Retained storage bonds: 0.12288 NEAR.
- Measured growth covered by retained bonds.

The local Sandbox test uses accounts controlled by
its test harness, not independent real-world operators.

## Reproduction

```bash
CARGO_TARGET_DIR="$PWD/target" cargo test \
  --locked --manifest-path contracts/r7-auth-v2/Cargo.toml

CARGO_TARGET_DIR="$PWD/target" cargo clippy \
  --locked --manifest-path contracts/r7-auth-v2/Cargo.toml \
  --all-targets -- -D warnings

NOMOGENESIS_V2_WASM="$PWD/target/r7_auth_v2_compatible.wasm" \
  node sandbox/r7_06e_auth_registry.cjs

cargo test --locked --lib
```

The V2 WASM must be built separately from the pinned
manifest using `RUSTFLAGS="--cfg near"` and the project's
compatible wasm-opt configuration.

## Security boundaries

- No linkage to actual funded M3 job ownership.
- No recomputation of the plan hash on-chain.
- No provider bond, pair or capacity validation.
- No atomic selected-coalition award.
- No legacy award bypass protection.
- No full M2/M3 global liability reconciliation.
- Storage refund policy remains undefined.
- No Testnet deployment or independent audit.
- No proof of incentive compatibility or physical
  benefit exclusion.

## Next single ticket

R7-06E/03B: integrate selected-buyer authorization
with actual funded M3 state and synchronous atomic
award. Test failure rollback, excluded buyers,
provider selection and global ledger conservation.
