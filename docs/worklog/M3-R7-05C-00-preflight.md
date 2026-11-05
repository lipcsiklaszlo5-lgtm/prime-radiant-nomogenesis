# R7-05C/00 — Second Testnet Market Preflight

Base: 78ae6a0

## Scenario

Three buyers each authorize 7 UNIT.
Two providers each quote 6 UNIT.
Each provider separately bonds 12 UNIT.
Worker reward is 25 UNIT per job.

The Genesis model finds three minimal
two-buyer coalitions.

The deployed M3 contract still enrolls all
three eligible buyers and allocates 4+4+4.

## Read-only verification

- Public Testnet contract code hash checked.
- Nine local signer keys matched public access keys.
- Conservative balances checked.
- Provider capacity slots checked.
- Previous escrow and claimable balances checked.
- Fresh journal path checked.
- No signed transactions submitted.

## Local secrets

Existing R6 identity files are read in place.
Private keys never enter the public repository.

## Next

Create and fund a separate R7-05C Testnet case
with an append-only transaction journal and
no automatic rebroadcast after uncertain outcomes.
