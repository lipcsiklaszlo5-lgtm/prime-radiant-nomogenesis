# NEAR Sandbox

Requirements: Rust 1.99.1, wasm32 target, Node.js and npm.

Run `npm ci` then `npm run test:sandbox`.

Tests cover primary success, reserve success, reserve failure, keeper activation, replay rejection and slot release on local NEAR Sandbox.

Internal escrow, terminal claims and native NEAR withdrawals are implemented. Withdrawal success and callback recovery have been tested locally.

## M2 funding sandbox

`npm run test:sandbox` includes the authenticated buyer deposit and reserve collateral tests.

The funding tests run on an isolated local NEAR Sandbox using test accounts and valueless tokens.

Known limitations: exact storage accounting, storage-reserve refund policy, public testnet deployment and production security review are not implemented or verified.


## M2 terminal settlement sandbox

`npm run test:sandbox` runs eleven independent local suites.

The settlement suite tests four funded tasks in one sandbox:

- Primary success
- Reserve success
- Reserve default with collateral forfeiture
- Expiry without keeper activation

Aggregate economic deposits: 192 yoctoNEAR.
All 192 are accounted for as escrow or internal credits.
Storage reserves are excluded from that economic total.

The suite verifies keeper credit timing, slot release and
terminal replay rejection. Withdrawal tests are separate suites.


## M2 native withdrawal sandbox

Sandbox/05 (`sandbox/withdrawal.cjs`) verifies:

- Real transfers of 0.5, 0.8 and 0.6 NEAR
- Recipient balance increases
- Completed asynchronous payout callbacks
- No residual pending withdrawal
- Exact internal claimable accounting
- Unauthorized withdrawal and callback rejection

The recipient's total account balance can also change through
transaction gas fees and refunds. Exact amounts are audited in
the contract ledger; external account deltas use a tolerance.

Sandbox/06 (`sandbox/withdrawal_failure.cjs`) verifies:

- A native transfer receipt fails for a nonexistent receiver
- The callback restores the owner's claimable balance
- Other claimants are unchanged
- No withdrawal remains pending

This failure case uses an intentionally fault-injected WASM
variant. `scripts/test-withdrawal-failure.sh` restores the
original Rust source and normal WASM artifact after execution.

Neither suite establishes production safety. Storage obligations
are still provisionally reserved, and no public testnet or
independent security audit has been performed.


## M2/05 measured storage audit

Sandbox/07 measures 15 chain-observed storage checkpoints:
task and offer creation, deposits, selection, settlement,
withdrawal, offer release and cancellation.

Measured growth: 1535 bytes.
Provisional reserve: 8192 bytes.
The difference is not automatically refundable.

See `docs/STORAGE_POLICY.md`.

Historical limitation: unpaid task and offer creation
was addressed in M2/05C. Exact storage refunds remain pending.


## M2/05C — Storage admission sandbox

Sandbox/08 verifies:

- Zero, insufficient and excessive storage deposits rejected.
- Two independent callers tested for both creation endpoints.
- Twelve rejected attempts leave contract storage unchanged.
- Task and offer storage-bond owners persisted on-chain.
- Storage liabilities kept separate from economic escrow.
- Measured storage growth remains within each 2048-byte
  provisional creation contribution in the tested cases.

Sandbox/07 remains a measured lifecycle regression.
Its earlier 1535-byte figure belongs to the pre-admission
implementation; the updated lifecycle measures 1930 bytes.

No independent security audit or public testnet validation.


## M2/05D — Capital solvency sandbox

Sandbox/09 (`sandbox/capital_audit.cjs`) tests
two deployments with explicitly limited initial NEAR balances.

Both deployments include the storage stake necessary to
hold the deployed WASM. The available operating capital is
then independently limited:

- 0.06 NEAR: real withdrawal succeeds
- 0.015 NEAR: backing guard rejects withdrawal
- Rejected payout leaves the customer's claim unchanged

The test does not establish a universally sufficient
minimum capitalization.

The current withdrawal guard reserves funding for both
the entire storage-reserve ledger and the actual byte stake.
This conservative design requires additional operating
capital and must be revisited before storage refunds.


## M2/06B — Scoped storage refund integration

Sandbox/10 (`sandbox/refund_integration.cjs`) verifies:

- Net storage measurement on two funded offer releases
- Different storage effects for first and repeated credits
- Exact transfer from storage reserve to internal claimable
- Original reserve provider receives the storage credit
- Replayed release cannot claim a second refund
- Unfunded releases do not refund creation bonds
- Global economic and storage-ledger conservation

Refund amounts are observations of this workload,
not universal fixed refund rates.

The historical pre-refund measurement is archived under
`docs/audit-archive/` and is not an active regression.

General refund eligibility, storage-account ownership
attribution and adversarial concurrency remain open.


## M2/06C — Cross-owner audit

Sandbox/11 (`sandbox/refund_ownership_audit.cjs`) tests:

- Two buyers, two reserve providers and an outsider
- Rejection of unauthorized early release
- Third-party release after cancellation
- Storage rebate attributed to the original provider
- Unaffected balances of other parties
- Per-offer replay rejection
- Exact aggregate ledger conservation
- Native payout of credited storage rebate

Default release order: [2,0,1,3].

Four additional independently deployed scenarios were
validated locally:

- [0,2,3,1]
- [1,3,0,2]
- [2,1,0,3]
- [3,0,1,2]

Run those four scenarios again with:

`npm run sandbox:ownership-orders`

The observed aggregate rebate remained 0.00091 NEAR
per provider in each tested scenario.

Five of the 24 possible orders were tested.
This is not exhaustive concurrency or security proof.

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

## M2/07E/1 — Raw NEAR storage key attribution

Base commit: `8e3a580`.
Local NEAR Sandbox, 2026-11-03.

Four funded, unselected offers were released.
Raw persisted key/value differences were inspected
through NEAR Sandbox view_state.

Measured results:

- Four offer funding records deleted.
- Each deleted record occupied 88 bytes.
- Total deleted storage: 352 bytes.
- First claimable creation for each provider:
  85 bytes.
- Two new claimable records: 170 bytes.
- Existing claimable updates added zero bytes.
- Net storage released: 182 bytes.
- Storage rebates: 0.00182 NEAR.
- Raw KV deltas matched storage_usage changes.
- Four cross-caller replay attempts rejected.
- Original reserve providers received the credits.
- Native refund withdrawal PASS.

Specific release deltas: 3, 3, 88, 88 bytes.

The 85-byte claimable allocation depends on the
tested account identifiers and storage encoding.
It is not a universal constant.

The observed 40-byte per-key overhead was checked
against the measured NEAR storage_usage delta.

This is read-only external storage inspection.
The contract does not expose raw storage keys.

The audit proves exact attribution of the inspected
key changes in this local scenario, not ownership
of all shared or future storage allocations.

Rust contract, persistent state and WASM unchanged.

Optional regression:

`npm run sandbox:storage-keys`

Next: M2/07E/2 — per-transition storage cost
attribution, including retained records, shared
writes and future mutation capacity.

The isolated storage ledger is not on-chain.
General storage refunds are not approved.
Production funds remain NOT APPROVED.

## M2/07E/2A — Complete storage transition matrix

Base commit: `387dff9`.
Local NEAR Sandbox, 2026-11-03.

### Verified physical measurements

- 21 successful state transitions instrumented.
- Each raw KV delta reconciled against storage_usage.
- Total persistent growth: 2339 bytes.
- Difference between reconstructed and actual
  storage usage: zero bytes.
- Four funded offer records deleted.
- Four cross-caller replay attempts rejected.
- Native refund withdrawal PASS.
- Existing contract WASM unchanged.

### Retained storage after lifecycle

| Category | Records | Bytes |
|---|---:|---:|
| Tasks | 2 | 334 |
| Task creation bonds | 2 | 186 |
| Task funding | 2 | 270 |
| Offers | 4 | 460 |
| Offer creation bonds | 4 | 384 |
| Settlement markers | 2 | 112 |
| Claimable balances | 4 | 336 |
| Shared or unknown | 1 | 257 |
| TOTAL | 21 | 2339 |

Named record categories account for 2082 bytes.
The remaining 257 bytes were classified as
shared_or_unknown, not assigned to a customer.

### Transaction groups

- Task creation: +777 bytes, including 257 bytes
  classified as shared_or_unknown.
- Task funding: +270 bytes.
- Primary acceptance: 0 net bytes.
- Offer posting: +844 bytes.
- Offer funding: +352 bytes.
- Task cancellation: +278 bytes.
- Offer release: -182 bytes.
- Native withdrawal: 0 net bytes.

Total: +2339 bytes.

All amounts above describe the tested workload.

### Attribution boundary

Physical storage ownership and contractual
cost-bearing responsibility are different.

The presence of a payer's creation bond does
not establish that all subsequent storage for
that task or offer is refundable.

The claimable record's beneficiary does not
automatically establish who finances its
persistent storage.

The 257-byte shared_or_unknown allocation
must not be arbitrarily assigned to the first
task creator merely because that transaction
first created the record.

Retained audit, terminal, funding and bond
records may require long-term storage backing.

The model does not establish future mutation
bounds, migration safety, universal storage
costs or general refund eligibility.

### Regression

`npm run sandbox:transition-matrix`

Next: M2/07E/2B — explicitly define funding
responsibility by record category and prove
that refundable capacity remains protected
against future storage obligations.

The current contract remains unchanged.
No general refund authorization is granted.
Production funds remain NOT APPROVED.

## M2/07E/2B/1 — Isolated storage cost policy

Base commit: `0c16b18`.
Date: 2026-11-03.

### Evidence

A fresh 21-transition NEAR Sandbox matrix was
processed by the isolated cost-policy model.

Verified results:

- 12 independently tracked storage contributions.
- Each contribution preserves:
  total = consumed + unused + released.
- Five manipulated scenarios rejected.
- Physical storage reconciliation PASS.
- Rust contract and WASM unchanged.

### Model totals

| Component | Byte-equivalent |
|---|---:|
| Original storage contributions | 24576 |
| Attributed persistent customer storage | 2082 |
| Hypothetical unused capacity | 22312 |
| Previously released credit | 182 |
| Separate shared storage | 257 |

Accounting:

24576 = 2082 + 22312 + 182

2339 = 2082 + 257

Existing on-chain storage reserve after the
tested rebates is 24394 byte-equivalent.

The proposed accounting split is:

24394 = 2082 + 22312

### Proposed cost-bearing assumptions

- Task creation bond covers task record
  and task creation bond storage.
- Task funding bond covers task funding,
  settlement marker and buyer claimable creation
  in this tested unmatched lifecycle.
- Offer creation bond covers offer record
  and offer creation bond storage.
- Offer funding bond covers its original
  funding record until deletion.
- The first provider claimable creation is
  provisionally charged to the corresponding
  offer funding bond.
- Shared storage remains separately backed.

These are design assumptions, not established
refund entitlements.

### Security limitations

- Future storage obligations are not bounded.
- Different lifecycle outcomes may have
  different storage requirements.
- Storage costs can depend on account and slot
  identifier lengths.
- Claimable ownership does not automatically
  establish storage cost responsibility.
- The model parses Sandbox evidence and uses
  expected fixture values; it is not itself
  an authenticated on-chain ledger.
- Adversarial tests demonstrate rejection of
  the tested mutations, not exhaustive security.
- General refunds and migration remain unproven.
- No new withdrawal or payout rights are enabled.

Optional regression:

1. npm run sandbox:transition-matrix
2. npm run sandbox:cost-policy -- /path/to/log

Next: M2/07E/2B/2 — future mutation reserve,
global backing invariants and zero-capital stress.

Production funds remain NOT APPROVED.

## M2/07E/2B/2A — Global backing stress model

Base commit: `5149b76`.
Date: 2026-11-03.

### Verified evidence

- 21 successful Sandbox storage transitions.
- 22 backing samples, including baseline.
- Actual account balances and physical storage.
- Current economic, collateral, claimable,
  pending and storage reserve liabilities.
- Conservative backing guard reconstructed.
- Hypothetical consumed/unused backing model.
- Five adversarial input mutations rejected.
- Rust contract and WASM unchanged.

### Final accounting

Measured physical storage growth: 2339 bytes.

Attributed consumed storage: 2082 bytes.
Shared storage: 257 bytes.
Unused contribution capacity: 22312 bytes.
Previously credited storage refunds: 182 bytes.

Recorded remaining storage reserve:
24394 byte-equivalent.

The observed accounting identities hold:

2339 = 2082 + 257

24394 = 2082 + 22312

### Treasury margin scenarios

All margins below are counterfactual.
They reduce the starting treasury balance while
preserving observed transaction balance changes.

| Margin | Conservative | Shadow |
|---|---|---|
| 0 NEAR | FAIL | FAIL |
| 0.015 NEAR | FAIL | FAIL |
| 0.060 NEAR | PASS | PASS |
| 0.120 NEAR | PASS | PASS |

Approximate implied minimum initial margins
for the sampled transition trace:

Conservative: 0.04514410 NEAR.
Shadow: 0.02302421 NEAR.

These are conditional model thresholds,
NOT proven safe funding requirements.

### Future capacity test

The model tested incremental consumption of
unused capacity without new storage deposits.

The following requests were algebraically
covered within the simulated reserve:

0, 2048, 4096, 8192 and 22312 bytes.

A 22313-byte request exceeded the modeled
22312-byte unused capacity and was rejected.

The assumed future minimum was 2048 bytes.
This is a test parameter, not a proven upper
bound for future legitimate state changes.

Converting unused storage reserves to an
equal claimable liability does not by itself
create free capital.

### Unresolved security boundaries

- Actual low-margin Sandbox deployments
  have not been run for these scenarios.
- No universal future storage growth bound.
- No proof of every lifecycle and callback.
- The shadow split is not persisted on-chain.
- Model calculations use a fixed verified
  transaction trace and known fixture categories.
- Storage ownership and refund entitlement
  remain separate questions.
- No migration safety proof.
- No permission to relax withdrawal backing.
- No general refund authorization.

### Regression

1. npm run sandbox:backing-probe
2. npm run sandbox:backing-stress -- /path/to/log

Next: M2/07E/2B/2B — actual low-margin
Sandbox deployments, native payout checks
and alternative lifecycle stress.

Production funds remain NOT APPROVED.

## M3-R2 multi-party rescue lifecycle

Local NEAR Sandbox, 2026-11-04.

Command:

`npm run wasm:build && npm run sandbox:m3-r2`

Compatible WASM SHA-256:

`ab129cc27fa133a29412e6198bc550e6bc81cf4ff24b37790362727d120e1a03`

Scenario:

- one fresh contract deployment;
- one canonical rescue case;
- three independent buyers;
- three independent workers;
- one keeper and one outsider;
- 0.025 NEAR worker reward per job;
- 0.005 NEAR rescue cap per job;
- 0.09 NEAR aggregate economic principal.

Verified:

- 893-byte case quote and 576-byte job quote read from the contract;
- case-storage underpayment rejected before state creation;
- job-funding underpayment rejected before ID or liability mutation;
- three funded jobs persisted under one case;
- outsider worker acceptance rejected;
- all designated workers accepted independently;
- one buyer-controlled cap revocation;
- two permissionless cap expiries at award close;
- three permissionless worker-reward expiries;
- terminal replay rejection;
- `rescue_escrow` reached zero;
- claimables reached 0.09 NEAR;
- one 0.02 NEAR native withdrawal completed;
- withdrawal callback left zero pending liability;
- remaining claimables were exactly 0.07 NEAR;
- storage reserves remained separate;
- aggregate M3 economic value was conserved.

The recipient's observed balance increase was
0.010718153802558651764660 NEAR after transaction costs.
The internal transfer amount and callback accounting were exact.

The Sandbox client retried transactions after two expired block hashes during
time advancement. The final on-chain state contained each intended transition
once, and explicit replay calls were rejected.

This is bounded local evidence. It does not establish public testnet operation,
production solvency, provider supply, bundle clearing, proof settlement,
security audit or adoption.
