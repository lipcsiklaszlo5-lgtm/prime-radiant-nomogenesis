# NEAR Sandbox

Requirements: Rust 1.99.1, wasm32 target, Node.js and npm.

Run `npm ci` then `npm run test:sandbox`.

Tests cover primary success, reserve success, reserve failure, keeper activation, replay rejection and slot release on local NEAR Sandbox.

No economic escrow or real payouts are implemented.
