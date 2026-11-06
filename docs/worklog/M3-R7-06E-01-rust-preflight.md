# R7-06E/01 — Pure Rust Subset Preflight

Starting commit: a4551a6
Branch: feat/r7-genesis-certificate

## New implementation

`src/r7_06e_subset_model.rs`

Deliberately isolated from `src/lib.rs`.
The deployed NEAR contract and its ABI are unchanged.

The new pure Rust model:
- Accepts an explicitly chosen buyer subset.
- Validates consent record scope and expiry.
- Checks buyer ownership fields and payment limits.
- Rejects repeated or previously consumed model nonces.
- Reuses the pre-existing M3 pure Rust allocation model.
- Requires exact buyer-approved allocations.
- Validates two distinct bonded providers.
- Computes selected and excluded buyer refunds.
- Computes excess provider-bond refunds.
- Checks total modelled liability conservation.
- Checks escrow backing and claimable overflow.
- Explicitly marks the result NOT chain-executable.

## Critical security boundary

Consent objects are MODEL INPUTS, not signatures
authenticated by NEAR.

No actual buyer key, public chain identity,
transaction nonce, signed message or contract
predecessor has been cryptographically verified.

The present M3 contract is NOT changed to
accept this output or to award an arbitrary subset.

The snapshot does NOT prove its own completeness.
Provider choice is a supplied pair, not a fresh
on-chain market selection.

Other M2/M3 outstanding liabilities remain
outside the isolated modelled-liability equation.
Production integration must check the full ledger.

Excluded jobs may still receive common recovery
benefits. Worker completion rules require separate
explicit treatment.

Do not interpret these tests as a deployed contract
audit, incentive compatibility or free-rider solution.

## Verification

`cargo test --locked --test r7_06e_subset_preflight`

`cargo test --locked --lib`

`cargo test --locked --test r7_genesis_certificate`

## Next ticket

R7-06E/02: real NEAR-authority binding design,
subset-aware contract API, and atomic settlement
invariants in Sandbox before any deployment.
