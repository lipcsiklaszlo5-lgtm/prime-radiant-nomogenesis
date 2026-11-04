# NOMOGENESIS — M3 NORTH STAR

**Status:** approved M3 product direction
**Decision date:** 2026-11-04
**Product:** The Rescue Market for Agent Economies

## Product statement

Nomogenesis lets affected agents jointly fund and settle recovery work that none of them would buy alone.

When a shared dependency fails, several independently funded jobs may stop. Each buyer authorizes only a bounded rescue contribution. Nomogenesis combines those mandates with complementary, collateralized recovery offers and accepts a complete bundle atomically.

The product creates a fundable recovery transaction. It does not create money, guarantee supplier availability or prove universal economic superiority.

## Critical distinction

A pre-funded rescue mandate is not reserved supplier capacity.

A binding RecoveryRight is created only when a complete bundle is awarded and buyer funds, provider bonds, slots and deadlines are locked.

## Bounded MVP

- at most six sponsoring jobs;
- exactly two recovery components;
- at most six open offers;
- distinct selected providers;
- deterministic capped-equal cost sharing;
- full provider bonds;
- no shared-collateral reuse;
- no token, lending, mainnet funds or paid API;
- no physical capacity attestation or general DAG optimizer.

## Mandatory demo

1. Three funded jobs are blocked by a missed dependency deadline.
2. Individual rescue attempts fail their caps.
3. Two complementary offers form a funded bundle.
4. Actual data bytes and Merkle proofs are delivered.
5. Three final jobs complete.
6. Settlement is reconstructed from chain state.
7. Duplicate funding, overspending, occupied slots and invalid proofs are rejected.
8. A partial-failure run settles without unfunded liability.

## Financial example

- buyers: 3 × 30 = 90;
- worker rewards: 3 × 25 = 75;
- rescue caps: 3 × 5 = 15;
- recovery fees: 6 + 6 = 12;
- buyer allocations: 4 + 4 + 4 = 12;
- unused rescue caps: 3;
- provider bonds: 12 + 12 = 24;
- total deposits: 114.

Successful cycle:

114 = 75 worker rewards + 12 recovery fees + 3 buyer refunds + 24 returned bonds.

These are test units, not prices, revenue or saved profit.

## Preserve the M2 kernel

Keep the existing task lifecycle, funded escrow, slot locking, Merkle verification, claimable ledger, withdrawals and callback recovery.

M2 storage research remains feature-frozen unless a reproducible defect blocks M3. M3 introduces a separate rescue liability that must be included in withdrawal backing.

## Build order

1. M3-R1: pure Rust allocation, clearing and settlement model.
2. M3-R2: funded jobs, mandates and rescue escrow.
3. M3-R3: atomic clearing and M2/M3 cross-slot guards.
4. M3-R4: proof submission and terminal settlement.
5. M3-R5: signer processes and actual data workflow.
6. M3-R6: demo, testnet receipts and clean reproduction.

## Claim boundary

Joint funding, auctions, escrow and conditional rights have prior art. The proposed difference is their integration around already-funded jobs, bounded per-job rescue authority, complementary recovery award and funded partial-failure settlement.

Grand prize is the ambition, not a guarantee.
