# prime-radiant-nomogenesis

Nomogenesis is a NEAR rescue market for agent economies.

When one failed dependency blocks several independently funded jobs, affected buyers can combine bounded rescue mandates and atomically purchase recovery work that none would fund alone.

## Current product direction

- [M3 North Star](docs/M3_NORTH_STAR.md)
- [M3 Rescue Market specification](docs/M3_RESCUE_MARKET_SPEC.md)
- [Verified development status](docs/STATUS.md)

The M2 Rust/NEAR kernel provides funded tasks, collateral, slot locks, Merkle verification, settlement and native withdrawal recovery. The bounded M3 rescue market now implements funded mandates,
bonded recovery offers, deterministic bundle awards, authenticated
component proofs, terminal settlement, worker-result validation,
reward refunds and native withdrawals.

M3-R4-05: 242 Rust tests and 29 regression gates verified,
including two corrected storage-audit expectations.
This is a local Sandbox prototype, not an independently audited
or public-testnet-verified production system.

M3-R5-02: signed local Sandbox demo using two CSV
components, three funded buyers, two providers and three
worker completions. A native withdrawal is verified from
its Transfer and callback receipts.

M3-R5-03: twelve local child-process signers completed
the same economic lifecycle with role-specific signatures,
independent CSV checks and receipt-verified withdrawal.
The legacy single-process demo also passed regression.

Next: M3-R6 — public testnet evidence and submission demo.
Public testnet evidence is not yet available.
