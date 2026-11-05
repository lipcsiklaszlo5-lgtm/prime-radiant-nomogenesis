# R7-02C/00 — Python/Rust allocation parity

Base: 6d997a0

## Scope

Cross-language differential verification of the
bounded capped-equal sponsor allocation.

185 deterministic vectors:
- Historical NEAR Testnet allocation.
- Explicit saturated and remainder examples.
- Single buyer and large u128 case.
- 180 generated bounded economic cases.

Rust executes the existing contract allocator
and compares exact amounts and job ordering.

## Commands

python3 -B scripts/m3/r7_build_diff_vectors.py
cargo test --locked --lib r7_genesis_differential_tests
python3 -B -m unittest discover -s scripts/m3 -p 'test_r7_*.py' -q

## Limitations

This proves allocation parity on the fixture set,
not equivalence of every contract state transition.
The complete Rust Genesis Certificate verifier
and independently reproducible archival state
validation are separate milestones.
