# NEAR Sandbox

Requirements: Rust 1.99.1, wasm32 target, Node.js and npm.

Run `npm ci` then `npm run test:sandbox`.

Tests cover primary success, reserve success, reserve failure, keeper activation, replay rejection and slot release on local NEAR Sandbox.

Internal escrow and terminal claimable accounting are implemented. External token payouts are not implemented.

## M2 funding sandbox

`npm run test:sandbox` includes the authenticated buyer deposit and reserve collateral tests.

The funding tests run on an isolated local NEAR Sandbox using test accounts and valueless tokens.

Known limitations: withdrawals, callback recovery, exact storage accounting and public testnet deployment are not implemented or verified.


## M2 terminal settlement sandbox

`npm run test:sandbox` now runs four independent local suites.

The settlement suite tests four funded tasks in one sandbox:

- Primary success
- Reserve success
- Reserve default with collateral forfeiture
- Expiry without keeper activation

Aggregate economic deposits: 192 yoctoNEAR.
All 192 are accounted for as escrow or internal credits.
Storage reserves are excluded from that economic total.

The suite verifies keeper credit timing, slot release and
terminal replay rejection. It does not perform token withdrawals.
