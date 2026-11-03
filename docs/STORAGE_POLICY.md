# M2/05 — Storage accounting policy

Status: M2/06C SCOPED REFUNDS TESTED; GENERAL REFUNDS PENDING.
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

## Historical security gap — addressed in M2/05C

create_task and post_offer currently accept calls
without attached storage deposits.

Both can increase persistent storage.

An attacker can repeatedly allocate contract storage
without funding the corresponding storage liability.

Task and offer creation now require prepaid storage bonds. The description above records the pre-M2/05C behavior.

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


## M2/05C — New measured admission accounting

Local NEAR Sandbox measurement after storage-bond
ownership records were added:

- First task creation: +513 bytes.
- Second task creation: +256 bytes.
- Offer creation, 64-character slot: +262 bytes.
- Persistent net growth after full measured lifecycle:
  1930 bytes.
- Eight 2048-byte provisional storage contributions:
  16384 byte-equivalent.
- Reserve minus measured incremental storage stake:
  14454 byte-equivalent = 0.14454 NEAR.

The surplus difference is NOT an approved refund.

The creation methods now require exact attached
storage deposits and persist payer/amount ownership.

These additions do not implement refundable storage
credits, refunds, storage release attribution or
state migration.

Local sandbox deployment starts with substantial
pre-funded contract balance. Positive measured
solvency is not proof of self-financing operation.

The measured deltas are not universal upper bounds.
The previous measurement in this document describes
the earlier contract version and is retained as history.


## M2/05D — Independently measured contract capitalization

Local NEAR Sandbox, 2026-11-03.

Baseline contract storage: 314430 bytes.
Storage byte cost: 10000000000000000000 yoctoNEAR.
Baseline stake: 3.1443 NEAR.

Two separately deployed contracts were tested.

Scenario A:
- Starting balance: 3.2043 NEAR.
- Starting balance above code stake: 0.06 NEAR.
- A 0.5 NEAR withdrawal succeeded after funding and
  terminal settlement.

Scenario B:
- Starting balance: 3.1593 NEAR.
- Starting balance above code stake: 0.015 NEAR.
- A 0.5 NEAR withdrawal was rejected by the
  native backing guard.
- The beneficiary's original 1.2 NEAR claim survived.

Both scenarios passed under the local Sandbox protocol
configuration and the tested contract workload.

### Open capitalization and refund issue

Current withdrawal backing calculation includes:

economic_escrow + collateral_escrow + claimable_total
+ pending_total + storage_reserves
+ (storage_usage + 2048) * storage_byte_cost

This intentionally protects the entire recorded storage
reserve as a liability in addition to the actual stake.

As a result, customer storage prepayments do not by
themselves replace the contract's initial storage capital.

A refund implementation must define which storage
contributions remain refundable, which are consumed
by retained data, and how the actual locked storage
stake is financed without double counting.

The test does NOT establish general self-financing
operation, exact refund eligibility, or safe deployment
on a public network.


## M2/06B — Scoped collateral storage rebate

A narrowly scoped rebate is implemented for release
of a funded, unselected reserve offer.

The release procedure:

1. Synchronizes the affected lazy LookupMaps.
2. Records actual storage usage.
3. Credits the original reserve provider's collateral.
4. Deletes the collateral funding record.
5. Flushes the affected LookupMaps again.
6. Measures net storage reduction.
7. Caps rebate at that record's storage contribution.
8. Moves exactly the rebate amount from storage_reserves
   to the same provider's claimable balance.

Measured on local NEAR Sandbox:

| Operation | Net storage | Rebate |
|---|---:|---:|
| First funded offer release | -5 bytes | 0.00005 NEAR |
| Second funded offer release | -88 bytes | 0.00088 NEAR |
| Unfunded offer release | 0 bytes | 0 |

The original offer record and creation bond remain
persisted. Selected offer settlement does not currently
refund its storage contribution.

Refund conservation identity for this transition:

storage_reserves_before + claimable_before
= storage_reserves_after + claimable_after
  - collateral_returned

This is a scoped accounting result, not a complete
storage ownership or production solvency proof.

The general refund lifecycle, permanent record costs,
state migration and security review remain unresolved.


## M2/06C — Multiple owners and release ordering

Local NEAR Sandbox verified two buyers, two reserve
providers, four funded offers and one unrelated caller.

After buyers cancelled unmatched tasks, the unrelated
caller released offers in five tested orderings.

Every release conserved total recorded liabilities:
economic escrow + collateral escrow + storage reserves
+ claimables + pending withdrawals.

The collateral and storage rebate belonged to the
original offer provider, regardless of release caller.

Five of 24 possible orders passed. Provider totals were
stable in those five tests; not a universal theorem.

The audit used explicitly capitalized sandbox
deployments and also demonstrated a real NEAR withdrawal
of a storage rebate.

Not yet proven: global storage ownership attribution,
all transaction orders, adversarial concurrency, or
universal solvency under minimal contract funding.

No public testnet or independent security review.

## M2/07A — Capital drift measurement

Local NEAR Sandbox, 2026-11-03.

- Starting commit: `dd93929`.
- Rust and compatible WASM unchanged.
- Six sequential task creation transactions PASS.
- Initial free capital: 0.08000000 NEAR.
- Six creation bonds: 0.12288000 NEAR.
- Persistent storage growth: 1883 bytes.
- Actual storage stake growth: 0.01883000 NEAR.
- Additional contract balance inflow: approximately
  0.00018419 NEAR.
- Net free capital reduction: approximately
  0.01864580 NEAR.
- Remaining free capital: 0.06135419 NEAR.
- Remaining capital after payout buffer:
  0.04087419 NEAR.

The entire creation bond remains recorded as a
storage reserve liability while actual allocated
storage separately increases the backing requirement.

This causes measured free-capital consumption despite
the user's storage prepayment.

The test accounts for additional observed contract
balance inflows rather than assuming exact equality
between attached deposits and balance changes.

This is one measured workload, not a universal
capital bound or proof of insolvency.

The audit is optional and is not yet part of the
eleven-suite default Sandbox regression.

Run independently:

`npm run sandbox:capital-drift`

Next: classify permanently consumed storage capital,
refundable balances and retained-record ownership
across mixed terminal and withdrawal lifecycles.

Production funds remain NOT APPROVED.

## M2/07B — Mixed lifecycle capital audit

Local NEAR Sandbox, 2026-11-03.

- Base commit: `650983c`.
- Original M2/06C ownership audit preserved.
- Rust contract and WASM unchanged.
- 23 state snapshots collected.
- Two buyers, two reserve providers, outsider caller.
- Unauthorized early releases rejected.
- Two funded tasks cancelled.
- Four collateralized offers released.
- Replay protection PASS.
- Ownership and financial conservation PASS.
- Native storage rebate withdrawal PASS.
- Initial free capital: 0.12000000 NEAR.
- Net storage growth: 2339 bytes.
- Storage stake growth: 0.02339000 NEAR.
- Net capital reduction: approximately 0.02251805 NEAR.
- Final free capital: approximately 0.09748195 NEAR.
- Final guarded capital: approximately 0.07700195 NEAR.
- Remaining recorded storage reserve: 0.24394000 NEAR.

The observed financial ledger remained conserved
through the tested releases and native withdrawal.

Recorded storage reserves remain protected as
liabilities in addition to actual storage stake.

All sampled states maintained nonnegative surplus.

Intermediate funding transitions were not all
sampled individually.

This is a bounded local lifecycle experiment,
not an exhaustive solvency or concurrency proof.

Optional regression:

`npm run sandbox:capital-lifecycle`

Next: classify consumed versus refundable storage
capital and model minimal-capital operation.

No production funds approved.

## M2/07C — Shadow storage reconciliation

- Base: `53ca3a9`.
- Local Sandbox shadow reconciliation PASS.
- 23 observed states.
- Hypothetical consumed storage: 0.02339 NEAR.
- Hypothetical unused reserve: 0.22055 NEAR.
- Conservative free capital: 0.09748195 NEAR.
- Shadow free capital: 0.12087195 NEAR.
- No on-chain economic or storage logic changed.
- No per-owner refund eligibility established.
- Shadow identity is algebraic, not a
  standalone security or solvency proof.

Optional regression:

`npm run sandbox:capital-shadow`

Proposed implementation requirements:

`docs/STORAGE_RECONCILIATION_ADR.md`

General storage refunds, migration and
production solvency remain unverified.

## M2/07D/3 — Canonical offer finality and provenance

Base commit: `8730a6c`.
Date: 2026-11-03.

### Isolated Rust model — M2/07D/3A

- Canonical key: OfferFunding(offer_id).
- The first successful simulated credit finalizes
  that funding record in the isolated model.
- Further allocation, restoration or credit against
  that record is rejected, even with another event ID.
- Failed credit does not finalize the record.
- Other offer funding records remain independent.
- TaskFunding finality is NOT defined by this gate.
- 17 tests PASS in the event-guard test target.

The in-memory model is not connected to NEAR state.
Its terminal credit does not independently establish
the entitlement or completeness of a real refund.

### Real NEAR Sandbox — M2/07D/3B

- Two buyers, two reserve providers, one outsider.
- Four funded offers released after task cancellation.
- Four distinct-account replay attempts rejected.
- Original provider receives collateral and rebate,
  regardless of which eligible actor triggers release.
- Four released offer collateral records are absent.
- Unreleased offers remain available and funded.
- Measured net storage reductions: 3, 3, 88, 88 bytes.
- Total measured release reduction: 182 bytes.
- Total storage rebate: 0.00182 NEAR.
- Cross-owner financial accounting PASS.
- Native rebate withdrawal PASS.

The Sandbox checks the CURRENT contract's existing
offer state machine, not integration of the new ledger.

### Limitations

- Source and destination of every shared storage byte
  are not yet independently attributed.
- The physical storage delta cannot be submitted as
  an arbitrary caller-provided credit entitlement.
- An event ID is not evidence of storage release.
- Other record categories have no general finality
  and refund policy.
- New persistent structures, gas costs, contract
  state migration and minimal-capital operation
  remain unverified.

No changes to the contract's withdrawal backing
rule or persistent NEAR state were made.

Optional Sandbox regression:

`npm run sandbox:provenance`

Next: design the trusted transition-to-ledger bridge,
including exact allocation boundaries and persistent
storage cost attribution.

Production funds remain NOT APPROVED.
