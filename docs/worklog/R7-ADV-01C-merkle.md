# R7-ADV-01C — Merkle-proof negative controls

Base: `5b03682`.
Environment: local NEAR Sandbox.
Bytecode: exact public V2 Testnet WASM.

Both selected providers attempted three
adversarial operations using their own signing keys:
1. Modified payload with unchanged Merkle proof.
2. Noncanonical metadata sibling.
3. Replay of an already accepted proof.

The malformed proofs were rejected without
changing the selected offer or component state.
Correct original proofs were subsequently accepted.
Replay attempts were also rejected.

Keeper settlement and worker completion passed.
Terminal economic accounting: 52 = 0 + 52 UNIT.

This test does not prove signer impersonation
resistance independently of account ownership.
Actors remain same-host synthetic processes.
No public Testnet transactions occurred.

Evidence SHA-256: `0244f73bccf60716931b1c63d5a7c1d11e7520f9cfa5277949c6e764c700381e`.
Evidence file: `docs/evidence/R7-ADV-01C-proof-rejections.log`.
