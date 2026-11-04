# M3-R2-04 — multi-party NEAR Sandbox reproduction

**Status:** verified
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `3bfb9cb`

## Purpose

Move the completed native Rust R2 liability lifecycle onto an actual local
NEAR runtime with independent accounts and real receipts.

The scenario uses:

- one canonical rescue case;
- three independent buyers;
- three independent designated workers;
- one permissionless keeper;
- one outsider used for authorization rejection;
- exact attached deposits;
- one buyer-controlled mandate release;
- two permissionless mandate expiries;
- three permissionless worker-job expiries;
- one native withdrawal sourced entirely from M3 claimables.

## Economic scenario

Each buyer deposits:

- worker reward: 0.025 NEAR;
- rescue cap: 0.005 NEAR;
- separately quoted job storage.

Total M3 economic principal:

`3 × (0.025 + 0.005) = 0.09 NEAR`

Expected terminal identity:

`native payout + remaining claimables + rescue_escrow = 0.09 NEAR`

Storage reserves remain outside this economic identity.

## Required evidence

- real compatible WASM build;
- local deployment succeeds;
- case and job storage quotes are read from the contract;
- underpayment is rejected before IDs or liability change;
- three funded jobs persist under one case;
- three different workers accept;
- outsider acceptance is rejected;
- manual cap revocation returns value only to its buyer;
- keeper-triggered expiry cannot redirect value;
- terminal replays are rejected;
- `rescue_escrow` reaches zero exactly;
- storage reserves remain separately accounted;
- M3-generated claimable balance produces a native transfer and callback;
- aggregate economic value is conserved.

## Files

- `package.json`
- `sandbox/m3_rescue_lifecycle.cjs`
- `scripts/m3/m3_r2_04_sandbox.py`
- `docs/worklog/M3-R2-04-sandbox.md`

## Next single action

Build the compatible WASM and run `npm run sandbox:m3-r2`. Do not commit until
the exact Sandbox output and final ledger identity are recorded.

## Final verification

Base commit: `3bfb9cb`.

Commands and results:

- `npm run wasm:build`
  - passed; exit code 0.
  - compatible WASM SHA-256:
    `ab129cc27fa133a29412e6198bc550e6bc81cf4ff24b37790362727d120e1a03`.
- `npm run sandbox:m3-r2`
  - passed; exit code 0.
  - final marker: `SANDBOX/M3-R2 RESULT: PASS`.
- `git diff --check`
  - passed; exit code 0.

Observed on-chain values:

- case storage quote:
  `8930000000000000000000` yoctoNEAR;
- job storage quote:
  `5760000000000000000000` yoctoNEAR;
- economic principal:
  `90000000000000000000000` yoctoNEAR;
- native withdrawal request:
  `20000000000000000000000` yoctoNEAR;
- observed recipient balance increase:
  `10718153802558651764660` yoctoNEAR;
- transaction-cost difference:
  `-9281846197441348235340` yoctoNEAR;
- remaining claimables:
  `70000000000000000000000` yoctoNEAR;
- final `rescue_escrow`: zero;
- final pending withdrawals: zero.

Economic identity:

`0.02 NEAR native payout + 0.07 NEAR claimable + 0 escrow = 0.09 NEAR`

Expected rejected receipts were observed for:

- case-storage underpayment;
- duplicate canonical case;
- funded-job underpayment;
- outsider worker acceptance;
- replayed job expiry;
- replayed mandate expiry.

The award-close fast-forward required two steps. Near Workspaces retried two
calls after expired block hashes; final state and explicit replay checks showed
one application per intended transition.

Inherited verified native base:

- 168 Rust tests passed at `3bfb9cb`;
- Clippy passed;
- WASM target check passed.

Not yet verified:

- public testnet deployment;
- provider offer and bond admission;
- two-component bundle clearing;
- locked-mandate settlement;
- objective recovery proofs;
- production solvency or independent audit.

Next single action: M3-R3-00 provider-market and atomic-award design.
