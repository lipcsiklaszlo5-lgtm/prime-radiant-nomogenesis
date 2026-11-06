# R7-06E/03B-07C — Consent Storage Refund Policy

Status: DESIGN GATE — not implemented
Base commit: ee53dce
Date: 2026-11-06

## Verified behavior

- One registration reserves 4096 storage bytes.
- Two registrations increased storage by 524 bytes.
- Revocation deletes the active consent.
- A consumed nonce is never reusable.
- Re-registration with a new nonce succeeds.
- The measured net additional growth was 74 bytes.
- Three successful registrations retain three bonds.
- Only two active consents remain.
- No storage bond refund is implemented.

Evidence:
docs/evidence/R7-06E-03B-07.json

## Proposed refund design

1. Preserve irreversible nonce consumption.
2. Keep sufficient permanent storage backing for
   each persistent nonce and associated metadata.
3. Do not treat measured 74-byte growth as a
   universal upper storage bound.
4. Establish a worst-case bound using maximum
   valid AccountId, nonce and serialized state.
5. Define an explicit refundable portion only
   after that bound is validated.
6. Credit refunds to the original consent buyer.
7. Reject unauthorized and duplicate refunds.
8. Maintain atomic accounting:
   storage_reserves decreases only when the
   corresponding liability is accounted for.
9. Check native NEAR backing, including actual
   storage stake and withdrawal buffer.
10. Test low-margin solvency, not only the
    generously funded development Sandbox.

## Lifecycle requirements

- Revocation must preserve the consumed nonce.
- Expired authorization must not enable award.
- Post-award cleanup must not invalidate
  historical authorization evidence.
- Failed refund attempts must roll back.
- Previously refunded bonds cannot be reused.
- Withdrawal callbacks must preserve liabilities.

## Decision gate

No fixed refund fraction or amount is approved.
Do not implement refunds until storage bounds
and low-margin backing are verified.

## Next single ticket

R7-06E/03B-07D — bound persistent nonce storage
and calculate the minimum retained reserve.
