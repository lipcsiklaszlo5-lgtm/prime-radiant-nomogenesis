# Hackathon reviewer route

Nomogenesis addresses a shared failure: independently funded agents cannot
each justify paying the full restoration price, while all depend on the same
resource. The protocol binds limited buyer consents to funded jobs, selects
a feasible bonded provider pair, and settles after component proofs and
worker results pass on-chain checks.

## Two independent ways to inspect it

1. Reproduce the full lifecycle from a fresh checkout with `npm ci` and
   `npm run verify`. This uses NEAR Sandbox and synthetic local accounts.
2. Inspect `docs/evidence/technical-closure-testnet-2026-11-12/` and run
   `npm run verify:evidence`. Its 19 transaction hashes identify the public
   Testnet lifecycle and can be checked against public RPCs.

The local run injects a lost acknowledgement after a transaction is sent;
the signed transaction is reconciled without a second economic send.
Its Python SDK audit checks final case state, roots, reconstructed worker
result, liabilities and deployed WASM identity. The public run also records
the native withdrawals and callback receipts. See the README for exact
commands, expected markers, limitations and source locations.

This project file is a reviewer guide, not a reproduction of any organizer
instructions or judging criteria. The UI and short video are presentation
layers; the executable protocol and SDK evidence are above.
