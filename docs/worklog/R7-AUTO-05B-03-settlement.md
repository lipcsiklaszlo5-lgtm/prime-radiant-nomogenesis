# R7-AUTO-05B/03 — Autonomous settlement

Base commit: `081719f`.
Environment: AWS Ubuntu, local NEAR Sandbox.
Contract: exact public V2 Testnet WASM.

## Verified execution

Ten separate signing processes participated.
Two buyers funded rescue jobs and gave consent.
Three providers offered bonded capacity.
Two designated workers accepted their jobs.
The keeper performed the atomic award.
The winning providers submitted two valid
Merkle proofs with separate transactions.
The losing provider's bond was released.
The keeper completed terminal settlement.
Both workers calculated 632 from verified
on-chain recovery components and completed.

## Economics

Winning rescue price: 11 UNIT.
Buyer allocations: 5.5 + 5.5 UNIT.
Final rescue escrow: 0 UNIT.
Final claimable liabilities: 52 UNIT.
Storage reserves accounted separately.

16 unique transaction hashes were checked
against the captured execution output.

## Evidence

Log: `docs/evidence/R7-AUTO-05B-03-sandbox.log`.
Log SHA-256: `1034f9695fe36f481b1ed0f77d3a6d7b5d9f1b22dc6dc40bf5a55aef766ed1a9`.

## Limitations

All processes run under one operator.
Policies and recovered data are synthetic.
The event relay is local and centralized.
The outage is controller-injected.
Sandbox time is advanced by the harness.
Claimables were not withdrawn to wallets.
No public Testnet transactions were sent.
No general incentive-compatibility proof.

The first execution completed successfully,
but its surrounding evidence script stopped
because it expected an obsolete log marker.
This checkpoint independently revalidated
and archived that original successful run.
