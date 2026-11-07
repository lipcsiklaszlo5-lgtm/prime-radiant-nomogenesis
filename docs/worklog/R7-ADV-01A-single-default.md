# R7-ADV-01A — Single-provider default

Baseline: `9c17c0b`.
Environment: AWS Ubuntu, NEAR local Sandbox.
Contract: exact public V2 Testnet WASM.

## Fault and recovery

Provider-beta withheld its component proof.
Provider-gamma supplied a valid Merkle proof.
The keeper performed deadline-based default
settlement and released the unselected bond.
Both worker jobs expired without false success.

## Terminal balances

- Buyer 1: 11 UNIT
- Buyer 2: 11 UNIT
- Provider alpha: 12 UNIT
- Provider gamma: 17 UNIT
- Provider beta: 1 UNIT
- Workers: 0 UNIT

Total: 52 UNIT.
Rescue escrow: 0 UNIT.
Claimable: 52 UNIT.
Storage reserves tracked separately.

## Limitations

Synthetic provider fault and source data.
One operator controls same-host processes.
Local event relay; simulated chain clock.
Native withdrawals not tested.
No public Testnet transactions.

Evidence SHA-256: `f472f3a80fe84bc67ea09620b2dea4cae6ca6b0db5faa3ffdc3e1d5ed8487626`.
Log: `docs/evidence/R7-ADV-01A-single-default.log`.
