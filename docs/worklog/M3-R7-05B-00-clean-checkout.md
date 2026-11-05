# R7-05B/00 — Public Clean Checkout

Base commit: 0020c0f
Branch: feat/r7-genesis-certificate

## Verified

A fresh public GitHub checkout reproduced:

1. Deterministic demo and evidence artifacts.
2. Python Genesis test suite.
3. Rust contract library tests.
4. Independent Rust Genesis Certificate tests.
5. JavaScript jury UI and economic tests.
6. Offline recorded evidence integrity.
7. Live R7 public transaction and archive replay.
8. R6 public 17-transaction lifecycle verification.

The R6 recheck used one public FastNear endpoint.
The R7 transaction replay separately compared
two public RPC endpoints and archival state.

## Reproduce

bash scripts/m3/r7_clean_checkout_audit.sh

## Important limitations

No new Testnet market was created.
No wallet or signer was used.
Genesis Certificate generation is off-chain.
The public archive is externally trusted.
No independent agent operators or security audit.

## Next

New Testnet scenario with alternative coalition
structure, after separate funding/signer review.
Then final hackathon submission audit.
