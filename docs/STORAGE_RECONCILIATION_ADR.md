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

## M2/07D/1 — Pure Rust storage ledger model

Base commit: `4eb25a7`.

An isolated Rust arithmetic model has been created in:

- `src/storage_ledger_model.rs`
- `tests/storage_ledger_spec.rs`

Six new tests PASS. The existing 108 Rust unit tests
remain unchanged and PASS.

The model tracks payer, original contribution,
consumed capacity, unused capacity and simulated
released credit for four record categories.

Its accounting invariant is:

total = consumed + unused + released

This model does not modify the NEAR contract state,
WASM interface, withdrawal guard or escrow ledger.

Security limitations:

- Release eligibility is not authenticated.
- Storage deltas are not independently authenticated.
- Shared storage attribution remains unresolved.
- Future storage growth has no proven upper bound.
- Repeated partial simulated credits are not
  protected by a trusted one-time event identity.
- Caller-provided event IDs alone would not
  constitute sufficient replay protection.
- State migration remains unimplemented.

Next: M2/07D/2 — event identity, replay protection,
trusted storage attribution and adversarial tests.

No production funds approved.

## M2/07D/2 — Isolated event replay guard

Base commit: `e123e15`.
Date: 2026-11-03.

New files:

- `src/storage_event_guard.rs`
- `tests/storage_event_guard_spec.rs`

Verified local results:

- Seven event guard tests PASS.
- Thirteen tests in combined event guard target PASS.
- Six original storage ledger tests PASS.
- 108 existing contract unit tests PASS.
- Clippy, formatting and WASM target checks PASS.

Verified model properties:

- An identical event ID cannot be processed twice.
- Reusing an ID against another owner is rejected.
- Payer mismatch is rejected.
- Invalid arithmetic does not mutate the ledger.
- Failed operations do not consume event IDs.
- Processed restore events cannot be replayed.
- Tested balances preserve ledger conservation.

These tests verify an isolated arithmetic and
event bookkeeping model, NOT NEAR authorization.

Remaining security gaps:

1. Event authenticity is not established.
2. Distinct event IDs can describe the same physical
   storage change; global byte uniqueness is unproven.
3. Unused capacity alone does not prove refund
   eligibility or finality of a record.
4. The event source is simulated in unit tests.
5. The in-memory BTreeSet and full Book cloning are
   not approved on-chain persistence/gas strategies.
6. Allocation of shared storage and future mutation
   capacity remains unresolved.
7. Persistent state migration remains unimplemented.

The current contract storage backing and withdrawal
rules must remain unchanged.

Next gate: M2/07D/3 — derive event provenance from
trusted state transitions, measure actual storage
deltas, and prevent double attribution even when
different event IDs are presented.

Production funds remain NOT APPROVED.

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
