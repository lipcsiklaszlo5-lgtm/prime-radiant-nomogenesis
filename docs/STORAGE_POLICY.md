# M2/05 — Storage accounting policy

Status: DESIGN / MEASUREMENT CHECKPOINT.
Not approved for production funds.

## Verified local measurement

NEAR Sandbox, 2026-11-03.

Storage byte price: 10000000000000000000 yoctoNEAR.

Measured checkpoints: 15.

Selected deltas:

| Operation | Bytes |
|---|---:|
| First task creation | +397 |
| Second task creation | +165 |
| Task funding | +135 |
| Offer creation, 64-char slot | +168 |
| Offer funding | +88 |
| Selecting an offer | +147 |
| First terminal settlement | +76 |
| Releasing an unused collateralized offer | -88 |
| Cancelling an unmatched task | +56 |

Total persistent growth in the measured lifecycle:
1535 bytes.

Measured storage stake increase:
15350000000000000000000 yoctoNEAR.

Four provisional storage deposits:
81920000000000000000000 yoctoNEAR.

Difference:
66570000000000000000000 yoctoNEAR.

This difference is NOT an approved refund amount.

These are measurements from one workload, not upper
bounds for arbitrary workloads or account identifiers.

The deployed WASM and initial contract state consume
additional storage outside this lifecycle's net delta.

## Existing security gap — unpaid persistent writes

create_task and post_offer currently accept calls
without attached storage deposits.

Both can increase persistent storage.

An attacker can repeatedly allocate contract storage
without funding the corresponding storage liability.

This must be fixed before public deployment.

## Required accounting model

Each persistent allocation must have:

1. An authenticated payer.
2. A storage funding source.
3. An accountable object or account owner.
4. A tracked amount of allocated storage.
5. A well-defined release or retention policy.

Creation of tasks and offers must be funded at the
time storage is allocated, not only at later funding.

Records retained for audit may remain permanently
storage-backed. Terminal settlement alone does not
imply that their storage has been released.

## Withdrawal and solvency invariants

Define:

E = task economic escrow
C = reserve collateral escrow
L = internal claimable balances
P = pending external payouts
S = actual contract storage usage in bytes
B = actual contract NEAR account balance
Q = current protocol storage byte price

Economic conservation before final external payout:

Deposits = E + C + L + P + completed payouts

where this identity excludes separately collected
storage contributions and gas costs.

The contract must maintain sufficient backing for
all economic liabilities plus required storage stake
and any independently refundable storage balances.

Required storage stake = S * Q.

Never count the same storage contribution twice as
both immediately refundable money and freely
spendable storage capital.

Future exact refund calculation must also account
for permanent storage retained for audit.

## Implementation order

1. Block unpaid persistent task creation.
2. Block unpaid persistent offer creation.
3. Track authenticated storage funding ownership.
4. Measure and attribute persistent usage.
5. Define record cleanup versus permanent audit data.
6. Implement storage credit availability and refund.
7. Verify withdrawal solvency without relying on the
   artificially funded sandbox deployment treasury.
8. Run adversarial, concurrent and overflow tests.
9. Independent security review before production use.

## Current boundaries

No public testnet proof.
No independently verified storage refunds.
No contract-state migration mechanism.
No permission to deploy with real customer funds.
