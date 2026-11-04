# M3-R2 — Funded jobs, rescue mandates and liability boundary

**Status:** approved implementation design
**Base checkpoint:** `d531cbc`
**Date:** 2026-11-04

## Product event

Several separately funded jobs depend on the same two data components.
Each buyer pre-authorizes a bounded rescue contribution. After the original
dependency deadline, complementary funded offers may form one complete
recovery transaction without another required buyer approval.

The measurable result is one newly fundable recovery purchase and the
resulting completed jobs. Pre-funded demand does not guarantee available
providers, profit, adoption or universal economic superiority.

## Bounded case

One `RescueCase` contains:

- one immutable, versioned descriptor;
- original provider identity;
- exactly two ordered component commitments;
- dependency, bid-close, award-close and recovery deadlines;
- at most six registered job IDs;
- original-delivery state;
- later, at most one awarded bundle.

The canonical order is:

`now < dependency_deadline < bid_close < award_close < recovery_deadline`

Every job final deadline must be later than the recovery deadline.

Offers and open mandates remain award-eligible until `award_close`.
Award is permitted only while `bid_close <= now < award_close`.

## Persistent records

### RescueJob

A job stores:

- case ID;
- buyer from `predecessor_account_id`;
- designated worker;
- worker reward and still-held reward;
- result profile and optional threshold;
- final deadline;
- `Funded`, `Accepted`, `Completed`, `Expired` or `Cancelled` phase.

### RescueMandate

The mandate uses the job ID as its public identifier and stores:

- original rescue cap;
- still-held rescue principal;
- `Open`, `Locked` or `Released` phase;
- locked bundle and allocation when awarded;
- terminal release reason.

Buyer ownership is derived from the immutable job. A second owner field is
not stored.

### RescueCase

The case stores bounded identifiers and state. Large global vectors and
iteration over every case are forbidden. A transition reads at most six jobs.

## Funding transaction

`create_funded_rescue_job` creates the job and its mandate in one payable
receipt.

Required attached value is exactly:

`worker_reward + rescue_cap + quoted_job_storage`

Both economic principals must be positive. Storage funding remains separate
from economic principal. A rejected call creates no record and consumes no ID.

The worker must accept before the dependency deadline. An unaccepted job
cannot sponsor recovery.

## Independent lifecycles

The worker reward and rescue mandate are separate authorities.

- Cancelling an unaccepted job credits reward and open cap to its buyer.
- Revoking an open mandate credits only its cap; the accepted worker job stays.
- A locked mandate cannot be revoked or released by award expiry.
- Job expiry credits any still-held worker reward to the buyer.
- Every terminal credit is replay-protected.

A job may fund at most one accepted recovery bundle.

## Sponsor selection

The award calculation uses every eligible accepted job with an open mandate.
The caller cannot choose a sponsor subset or submit allocations.

Capped-equal allocation remains deterministic. Only positive allocations
become bundle contributors. A zero allocation releases the whole cap and
receives no default-bond distribution.

## M3 liability

`rescue_escrow` equals every uncredited M3 economic principal:

- still-held worker rewards;
- open or locked mandate principal;
- later, open or locked M3 provider bonds.

After three buyers deposit worker reward 25 and cap 5:

`rescue_escrow = 3 * (25 + 5) = 90`

Internal locking does not change aggregate liability. Moving amount `z` from
M3 escrow to claimable must atomically perform:

`rescue_escrow -= z`
`claimable_total += z`
`claimable[owner] += z`

The same amount cannot appear in M2 collateral and M3 rescue escrow.

## Withdrawal backing

Before any M3 funding endpoint is enabled, withdrawal backing must include:

`economic_escrow`
`+ collateral_escrow`
`+ rescue_escrow`
`+ claimable_total`
`+ pending_total`
`+ storage_reserves`
`+ guarded physical storage stake`

Existing conservative M2 storage protection is preserved. M3-R2 does not
authorize a general storage refund.

## Storage responsibility

- Case creator: case descriptor, six job references, future bounded bundle and
  two bounded payloads.
- Job buyer: job, mandate and their largest valid lifecycle representation.
- Provider in R3: offer, bond record, slot lock and bounded payout state.
- Deployment treasury: WASM baseline and measured operating margin.

Quotes must be derived from bounded record sizes and checked with real Sandbox
storage measurements. The UI must display economic principal and storage
payment separately.

## Fresh state boundary

Adding root contract fields changes serialized state. M3 development and
testnet evidence use a fresh deployment. Replacing WASM over existing state is
not treated as migration.

## R2 implementation sequence

1. **R2-00:** lock this design and align active project documentation.
2. **R2-01:** add required R1 boundary regressions, root M3 schema with zero
   liability, withdrawal backing and storage measurement.
3. **R2-02:** add atomic funded job plus mandate, worker acceptance and views.
4. **R2-03:** add cancellation, revoke and expiry with one-time escrow credits.
5. **R2-04:** reproduce three independent buyers and workers in Sandbox.

## Required R2 evidence

- authenticated buyer and worker actions;
- exact attached deposit and storage admission;
- zero, overflow and aggregate-liability boundaries;
- six jobs accepted, seventh rejected;
- duplicate buyer and duplicate funding rejected;
- accept/cancel ordering has one valid outcome;
- open-cap revoke and replay protection;
- expiry boundary and permissionless trigger;
- M2 withdrawal cannot spend active M3 principal;
- multiple pending withdrawals preserve all liabilities;
- payout failure restores the original credit once;
- state reload preserves records and aggregates;
- Sandbox deposits and native refunds match the internal ledger;
- longest permitted identifiers stay within measured backing.

R2 does not claim bundle award, proof settlement, testnet operation or full
R01–R20 completion.
