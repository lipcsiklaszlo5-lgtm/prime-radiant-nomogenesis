# M2/07C — Storage capital reconciliation

Status: DESIGN ONLY — NOT IMPLEMENTED
Base checkpoint: 53ca3a9
Date: 2026-11-03

## Observed local evidence

- 23 successful mixed-lifecycle shadow observations.
- Final recorded storage reserve: 0.24394 NEAR.
- Measured incremental storage stake: 0.02339 NEAR.
- Hypothetical unused reserve: 0.22055 NEAR.
- Existing conservative free capital: 0.09748195 NEAR.
- Hypothetical shadow free capital: 0.12087195 NEAR.

The shadow model changes no on-chain balances.

The identity shadow_free = conservative_free +
candidate_consumed is algebraic. It is not an
independent proof of solvency.

## Required distinction

For each authenticated storage contribution:

- payer: original funding account
- object: task, offer or funding record
- total: original storage contribution
- consumed: attributed persistent storage backing
- unused: retained prepaid capacity
- released: amount validly transferred to claimables

The proposed record identity is:

total = consumed + unused + released

All values must use checked integer arithmetic.

Consumed storage cannot also be recorded as an
immediately refundable liability.

Unused capacity must remain protected until no
future object transition can require it.

## Global backing invariant

Let:

B = contract balance
S = actual storage usage
Q = protocol storage byte cost
H = payout and transition storage buffer
E = economic escrow
C = collateral escrow
L = claimable balances
P = pending withdrawals
U = aggregate unused storage obligations

Required:

B >= (S + H) * Q + E + C + L + P + U

Storage backing and financial liabilities must
not count the same deposit twice.

The invariant must be checked at all relevant
state transitions, not only at withdrawal.

## Implementation gates

1. Establish authenticated owner attribution
   for every persistent allocation.
2. Measure storage deltas after flushing all
   affected persistent collections.
3. Specify ownership for shared storage growth,
   temporary records and audit-retained data.
4. Prevent underfunded allocation and ensure
   future mutation capacity remains available.
5. Release unused balances only when storage
   and future mutation obligations permit.
6. Preserve escrow and claimable conservation.
7. Test zero/low-capital deployments.
8. Test release ordering and repeated callbacks.
9. Verify state migration before changing
   existing persistent Rust structures.
10. Require independent review before production.

## Explicitly unproven

- Per-owner consumed storage attribution.
- Refund eligibility of the unused reserve.
- Complete storage lifetime and cleanup policy.
- Universal maximum future storage growth.
- Solvency under adversarial interleavings.
- General migration correctness.
- Production deployment safety.

No current withdrawal or storage backing guard
may be relaxed solely on shadow evidence.
