# R7-DEMO-03/04 — Backup-driven V2 recovery

Date: 2026-11-06.
Branch: `feat/r7-demo-03-process-outage`.
Base: `ee1d42b5bbd6e6a6455d53362996b8d422445b75`.

## Objective

Complete a local NEAR V2 economic recovery lifecycle
using two independent operating-system backup processes.

The demo controller must not precompute the recovery
payloads before source failure.

## Verified implementation

- Original CSV source runs in a separate child process.
- A separate observer checks its HTTP endpoint.
- Original source process exits via SIGTERM.
- Observer detects ECONNREFUSED.
- Two backup providers run as separate child processes.
- Backup providers maintain separate local CSV files.
- Original source supplies the committed Merkle roots.
- Backup providers initially expose commitments only.
- Two buyers authorize; one buyer rejects.
- Contract atomically awards the selected coalition.
- Only after the award do backup providers read and
  transmit their own committed CSV payloads.
- Contract verifies both Merkle proofs.
- Two selected worker jobs complete.
- Financial liabilities remain 48 UNIT.

## Measured evidence

Source-process failure observation: 7 ms in this run.
Backup deliveries after award: 18,867 and 18,869 ms
from the pre-termination timestamp.

Two component proofs accepted after 26,122 ms
of local monotonic wall time.

Accelerated Sandbox chain-time recovery: 286 seconds.

Full Sandbox log:
`/tmp/nomogenesis-r7-04b-fix01-I2RtMUmb.log`

SHA-256:
`9160c1041b7d33effb00d16757976ff3ff8d494c4ebc4cb6b6a9a8393de18c1a`

Final outcome:
`R7-DEMO-03/04B BACKUP-DRIVEN V2 RECOVERY: PASS`.

## Negative controls

Missing buyer consent, forged buyer, underfunded
consent, plan tampering, legacy award bypass,
award replay, forged provider, invalid component
Merkle proof, invalid worker result and expiry
replay were rejected in the verified lifecycle.

## Evidence limitations

This is an isolated local NEAR Sandbox run, not a
public Testnet transaction or production execution.

The backup files are synthetic copies on the same
host, not independently operated commercial services.

The observer probes on controller request rather
than continuously monitoring on its own.

Merkle roots are precommitted; payloads are freshly
read from each backup provider only after award.

No native withdrawal is proven by this run.
Consent storage refund is not implemented.
No independent security audit has been performed.

## Next single ticket

R7-TESTNET-01: deploy the precise V2-feature WASM to
public NEAR Testnet and obtain independently verifiable
transaction outcomes for the full funded-consent,
award, proof, worker and settlement lifecycle.

Do not present historical V1 Testnet evidence as V2.
Do not use mainnet or real-value funds.
