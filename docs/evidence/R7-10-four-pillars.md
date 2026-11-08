# R7-10 — Integrated Four-Pillar Rescue

Date: 2026-11-08
Environment: local NEAR Sandbox
Contract: verified public V2 Testnet WASM

## Verified execution

- Real source process terminated with SIGTERM
- Independent watchdog detected the failure
- Two autonomous buyer agents funded rescue jobs
- Third buyer rejected an uneconomic commitment
- Three providers submitted bonded offers
- Fourth provider declined
- Python AgentShield evaluated buyer economics
- Two independently signed buyer consents accepted
- Atomic coalition award succeeded
- Backup data retrieved after award
- Two Merkle proofs accepted by Rust contract
- Keeper completed terminal settlement
- Two workers reconstructed result 632
- Financial conservation: 52 = 0 + 52 UNIT

## Measurements

Watchdog time since last healthy observation: 515 ms
Outage-to-terminal-completion wall time: 19,361 ms
Recovered quantity-price result: 632

## Evidence

Log: R7-10-four-pillars-sandbox.log

SHA-256:
f367cdb09bf43e595bfb45d2753f6edd646a9fd1c6a44c2ebe651ed89ed8ed84

Verified V2 WASM SHA-256:
2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e

## Limitations

- Local Sandbox, not a new public Testnet execution
- Synthetic same-host backup providers
- One operator controls the demonstration environment
- Local event relay
- Python SDK supplies economic policy, not signing
- This run does not demonstrate slashing or native withdrawals
- No independent security audit or production SLA

The listed transaction hashes belong to the local Sandbox.
They must not be presented as public Testnet receipts.
