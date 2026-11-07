# R7-SDK-02 — External Recovery Intent consumer

Base commit: `a03efa0`.

Environment: AWS Ubuntu, local NEAR Sandbox.

A separate Node.js buyer process generated and held
its own Ed25519 signing key. The Sandbox parent
received only its public key and funded a test
account without installing its private key.

The external buyer rejected an over-cap funding
request and malformed input before signing.
It then used the public RecoveryIntent adapter
to sign and submit a real Sandbox funded-job
transaction, verified against contract state.
The designated worker accepted that job.

Local log: `/tmp/nomogenesis-r7-sdk02-external.log`.
Log SHA-256: `75fd62bce8810c8d3a05ba4f0c492833ba425729d56492b7cadfc7b3c9b2bab4`.

Limits: Sandbox only; same-host processes; parent
administers test account creation and funding;
SDK currently covers funded-job creation only.
No public Testnet transaction or independent
third-party operator is claimed. Historical V2
WASM byte-parity discrepancy remains unresolved.
