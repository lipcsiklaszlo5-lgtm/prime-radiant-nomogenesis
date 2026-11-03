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
