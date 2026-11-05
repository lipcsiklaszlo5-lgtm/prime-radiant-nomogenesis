# R7-02C/02 — Independent Rust Genesis Verifier

Base: 647f31c

## Result

Independent native Rust verification of the
Genesis V1 certificate format.

Verifies:
- Canonical input SHA-256
- Canonical certificate SHA-256
- Cheapest admissible provider pair
- Exhaustive coalition outcomes
- Inclusion-minimal feasible coalitions
- Capped-equal buyer allocations
- Historical Testnet Genesis Certificate
- Six alternative Python-generated certificates
- Rehashed fraudulent outcomes and inputs

## Recovery

Initial Rust compilation failed because the
Serde derive macros could not resolve the
direct serde crate.

Fixed with:
#[serde(crate = "near_sdk::serde")]

No direct serde dependency was added.
Cargo manifest and lockfile remain unchanged.

## Reproduction

cargo test --locked --test r7_genesis_certificate

## Limitations

The verifier checks the Genesis V1 model,
not every NEAR contract transition.

Historical chain replay remains separate.
No locally validated Merkle state proof.
No production security audit.

## Next

Clean-checkout verification and hackathon
submission readiness.
