# R7-DEMO-01 — Separate buyer processes and V2 atomic award

Date: 2026-11-06. Branch: `feat/r7-demo-01-buyers`.
Base: `b98068287ebb2b4e6308294c91d6b41b8d457444`.

## Change

Three previously untracked JavaScript files are brought onto a separate
branch: the Sandbox harness, buyer process and coordinator bridge.
Each buyer has a separate process and local Ed25519 key. The coordinator
verifies the off-chain decision signature; two buyers approve 6 UNIT
each, while the third declines. The approved buyers submit V2 consent
from their own Sandbox accounts.

The initial agent rejected legitimate job funding because it assumed
the storage bond was below 1 UNIT. It now checks the exact on-chain
`m3_storage_quote` in addition to the fixed 7 UNIT rescue cap and
1 UNIT worker reward. The original source worktree and its other
untracked experiments were preserved.

## Observed verification

- Three JS files: `node --check` succeeded in Codespaces.
- Compatible V2 WASM SHA-256:
  `2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e`.
- Local NEAR Sandbox on this branch: exit 0. Three distinct agent keys
  and signed decisions; two accepted and one rejected. Forged consent,
  insufficient storage deposit, missing consent, altered plan, legacy
  award, replay and expiry replay were rejected with checked rollback.
- The rejected buyer received 7 UNIT of unused rescue principal; its
  remaining 1 UNIT worker reward was released on expiry.
- Economic liabilities: `48 = 39 + 9 = 38 + 10` UNIT.
- Complete Codespaces log:
  `/workspaces/nomogenesis-r7-buyers-b980682.log`;
  SHA-256:
  `4b83b674ef1ddf814e7c3f628a86295839d72e0d7b800e3617053774df8c0649`.
  Sandbox transaction IDs in that log are local and are not public
  Testnet receipts.

## Reproduction and limits

Build compatible WASM with `RUSTFLAGS="--cfg near"`,
`cargo build --locked --release --target wasm32-unknown-unknown
--features r7-v2`, then apply the flags in `scripts/build-wasm.sh`
to that feature build. Set `NOMOGENESIS_V2_WASM` to the resulting
compatible file and run `node sandbox/r7_v2_autonomous_buyers.cjs`.

The Sandbox root creates and funds all accounts; process/key separation
does not prove independent production operators. This run has no
observed service outage, replacement data work, terminal provider
settlement, consent storage refund or V2 public Testnet transaction.
The older `real_low_margin_audit.cjs`, allocation helper and UI ZIP
are not included in this checkpoint.

Next single ticket: `R7-DEMO-02`, one measurable failure-to-recovery
run with actual component work, selected buyer consent, provider proofs,
worker completion, settlement and negative outcomes.
