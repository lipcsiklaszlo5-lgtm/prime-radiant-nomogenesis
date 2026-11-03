# NEAR Sandbox

Requirements: Rust 1.99.1, wasm32 target, Node.js and npm.

Run `npm ci` then `npm run test:sandbox`.

Tests cover primary success, reserve success, reserve failure, keeper activation, replay rejection and slot release on local NEAR Sandbox.

No economic escrow or real payouts are implemented.

## M2 funding sandbox

`npm run test:sandbox` includes the authenticated buyer deposit and reserve collateral tests.

The funding tests run on an isolated local NEAR Sandbox using test accounts and valueless tokens.

Known limitations: terminal economic settlement, withdrawals, callback recovery, exact storage accounting and public testnet deployment are not implemented or verified.
