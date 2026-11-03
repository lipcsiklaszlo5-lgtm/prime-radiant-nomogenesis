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
