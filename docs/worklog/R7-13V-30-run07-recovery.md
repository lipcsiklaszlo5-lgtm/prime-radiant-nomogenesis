# R7-13V/30 — RUN07 recovery preparation

Original RUN07 public Testnet evidence:

- Eight successful original economic transactions
- Two uncertain consent transactions
- Case remains Open in the audited finalized block
- Jobs 10 and 11 Accepted
- Offers 13, 14 and 15 Open
- Neither buyer consent present in audited state
- Escrow: 52 UNIT
- Claimable: 218 UNIT

The recovery program has a fresh one-shot identity.

Conditional releases, only after contract deadlines:

- Three provider bonds: 36 UNIT
- Two buyer mandates: 14 UNIT
- Two expired worker rewards: 2 UNIT

Expected final state:

- Escrow: 0 UNIT
- Claimable: 270 UNIT
- Storage reserve drift: zero

Recovery preflight verifies original signed journals,
chain identity, contract WASM, case IDs, deadlines,
consents, job ownership and escrow invariants.

No uncertain consent transaction may be resent.

The preparation checkpoint contains no live invocation.
