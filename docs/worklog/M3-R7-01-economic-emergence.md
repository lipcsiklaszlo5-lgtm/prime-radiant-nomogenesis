# M3-R7-01 — Economic emergence

Date: 2026-11-05
Base: `9baaee9`
Branch: `feat/r7-economic-emergence`

## Objective

Compare jointly funded rescue with:
1. unilateral buyer funding;
2. prebooked standby;
3. reactive jointly funded spot replacement.

## Implementation

- Node.js, CPU-only, no new dependencies.
- Bounded integer cost allocation.
- Two-component bonded pair filtering.
- Synthetic individual budget and value constraints.
- Deadline-constrained availability.
- Deterministic output.
- No on-chain transactions.

## Observed checks

- 9 automated tests PASS.
- Joint funding can outperform the baselines.
- Cheaper standby can outperform joint funding.
- Faster cheaper spot procurement can win.
- Insufficient total funding prevents all purchases.
- Underbonding and duplicate providers are rejected.

Commands:

`node --test scripts/m3/r7_emergence_benchmark.test.cjs`

`node scripts/m3/r7_emergence_benchmark.cjs`

## Important limitations

Scenarios are explicitly constructed and synthetic.
Values are modelled willingness-to-pay proxies.
All examples assume a failed shared dependency.
Standby capital timing, spot counterparty risk,
provider incentives, service failure probability
and general-equilibrium feedback are not yet modelled.

This is a sanity-checked first reference model,
NOT empirical evidence of economic superiority.

## Next single action

R7-01B: systematic parameter sensitivity and fairness
review, retaining all losing scenarios.
