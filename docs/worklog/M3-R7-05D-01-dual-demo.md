# R7-05D/01 — Dual Testnet Jury Demo

Base: 8a62989

## Result

The existing white standalone jury demo now
presents two completed public Testnet scenarios.

Case 1:
- Caps: 5+5+5 UNIT.
- 12 UNIT recovery.
- One minimal coalition.
- 17 signed transactions.

Case 2:
- Caps: 7+7+7 UNIT.
- 12 UNIT recovery.
- Three minimal pair coalitions.
- 17 signed transactions.

Both deployed contract executions allocated
4+4+4 UNIT across three eligible buyers.

## Reproduction

node scripts/m3/r6_build_demo.cjs

Open:
demo/nomogenesis_jury_demo.html

## Boundaries

The demo sliders are local simulations.
The Genesis coalition enumeration is off-chain.
The deployed contract did not choose a two-buyer
minimal coalition in the second scenario.

External Testnet RPC evidence is used.
One operator controlled all synthetic roles.
Eight earlier SDK retries remain inconclusive.

## Next

Clean-checkout jury review and hackathon
submission readiness audit.
