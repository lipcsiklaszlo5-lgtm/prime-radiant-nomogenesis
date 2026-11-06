# R7-06E/03B-07D — Persistent nonce storage bound

Date: 2026-11-06
Base commit: 97a0a40
Network: local NEAR Sandbox

## Verified

- 64-character account ID accepted.
- Large 16-digit nonce values accepted.
- Revocation preserves consumed nonce.
- Old nonce replay rejected.
- New nonce registration succeeds.
- Atomic coalition award still succeeds.
- Economic conservation still holds.
- Three successful bonds, two active consents.

## Storage model

- Persistent nonce map entry: 139 bytes.
- Active consent entry: 236 bytes.
- Combined modeled maximum: 375 bytes.
- Quoted registration capacity: 4096 bytes.
- Measured net extra lifecycle storage: 135 bytes.

The modeled maximum assumes 40 bytes of overhead
per storage entry and the current Borsh layout.
It is NOT a formally proven protocol bound.

The Sandbox test uses exactly representable
16-digit JavaScript numbers. The static model
also covers the 20-digit u64 decimal maximum.

## Security and financial limitations

- No refundable amount is approved.
- Nonce storage remains persistent.
- Refund bookkeeping costs are not modeled.
- Low-margin native backing has not been verified.
- No V2 public Testnet transaction is claimed.
- No independent security audit is claimed.

## Evidence

docs/evidence/R7-06E-03B-07D.json

## Decision

Do not implement consent-bond refunds in this
hackathon checkpoint.

Preserve the verified economic contract and
prioritize public reproducibility and demonstration.

## Next single action

Prepare V2 deployment/demo readiness review
without changing the verified settlement logic.
