# R7-13V/23 — RUN06 economic recovery preparation

RUN06 finalized eight original Testnet transactions.

Two buyer consent transactions remain journaled as
`signed_not_confirmed` after the shared RPC broker
returned HTTP 503 caused by upstream HTTP 429.

The read-only reconciliation observed:

- Case: Open
- Jobs: 8, 9 (Accepted)
- Offers: 10, 11, 12 (Open)
- Awarded bundle: null
- Consents: absent in the audited finalized block
- Escrow: 52 UNIT
- Claimable: 166 UNIT

This recovery is isolated from RUN03–RUN05.

Seven conditional on-chain steps are planned:

1. Release offer 10 bond: 12 UNIT
2. Release offer 11 bond: 12 UNIT
3. Release offer 12 bond: 12 UNIT
4. Release job 8 mandate: 7 UNIT
5. Release job 9 mandate: 7 UNIT
6. Expire accepted job 8: 1 UNIT
7. Expire accepted job 9: 1 UNIT

Expected terminal state:

- Rescue escrow: 0 UNIT
- Claimable: 218 UNIT
- Storage reserve drift: zero

The recovery checks finalized contract state, case
identity, original journals, deployed WASM, storage
reserves and actual contract deadlines.

The two uncertain consent hashes must never be
automatically re-broadcast.

This checkpoint prepares and checks recovery only.
No public transaction is authorized or sent.
