# R7-ADV-01B — Dual-provider default

Baseline: `e0c75b5`.
Network: local NEAR Sandbox.
WASM: exact previously deployed V2 Testnet bytes.

Both winning provider agents deliberately withheld
their component proofs. The keeper rejected premature
settlement without economic state changes, then
settled after recovery_deadline. The two worker
jobs expired after final_deadline.

Terminal claimables (abstract UNIT):
- Buyer 1: 19
- Buyer 2: 19
- Losing provider alpha: 12
- Defaulted provider gamma: 1
- Defaulted provider beta: 1
- Workers: 0

Rescue escrow: 0 UNIT.
Claimable liabilities: 52 UNIT.
Storage reserves separately conserved.

Both selected providers forfeited their
11 UNIT locked bonds. The 1 UNIT remainder
of each original bond had already been credited
back at atomic award.

Limits: fault-injected synthetic market,
same-host actors, localhost event relay,
controller-advanced Sandbox time.
No native withdrawals or public Testnet txs.

Evidence SHA-256: `ffa482abab5eb7cc6902ed32da4d2ed2b2b10e0e48c373de57b4a13e086a41c7`.
Evidence: `docs/evidence/R7-ADV-01B-dual-default.log`.
