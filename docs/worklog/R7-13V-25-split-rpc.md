# R7-13V/25 — Dedicated signed RPC channel

RUN06 was recovered completely:
- Escrow: 0 UNIT
- Claimable: 218 UNIT
- Recovery transactions: 7 finalized

RUN06 failed because buyer consent send_tx requests
encountered upstream HTTP 429 rate limiting.

The RPC broker now supports optional `sendUpstream`.

- Reads continue through configured read endpoints.
- Signed transactions use the selected send endpoint.
- Historical callers preserve their original behavior.
- No automatic signed retry or broadcast failover.
- Duplicate signed submissions remain blocked.

Offline tests prove routing separation and safe
behavior under simulated HTTP 429.

No new public Testnet transactions.
RUN07 is not yet authorized.
