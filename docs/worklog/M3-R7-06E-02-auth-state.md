# R7-06E/02 — Authorization State Machine

Base: `ca9e354`
Branch: `feat/r7-genesis-certificate`

## Implementation

Pure Rust, isolated from deployed `src/lib.rs`.
Consent registration, withdrawal and atomic
modelled subset award using original M3 allocation.

The plan commitment binds case, contract, network,
selected participants and exact provider offers.

Adversarial cases cover incorrect buyer, expiry,
duplicate nonces, altered price, missing buyer,
failed economic allocation, overflow, replay and
changes to funding after authorization.

## Limitations

Simulated caller, not authenticated NEAR predecessor.
In-memory state, not persistent contract storage.
No NEAR Sandbox execution or new Testnet transaction.
No deployed M3 modifications.
No proof against non-excludable free riding.

## Next

R7-06E/03: versioned contract adapter, storage
funding, real authorization and Sandbox tests.
