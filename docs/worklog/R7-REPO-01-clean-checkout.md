# R7-REPO-01 — Reproducible V2 recovery entrypoint

Date: 2026-11-06.
Branch: `chore/r7-repo-01-entrypoint`.
Implementation commit: `6604fb3c44bab81d050db40996f110d9878a05d5`.

## Purpose

Verify that the committed V2 source independently reconstructs
the local rescue lifecycle from a clean, tracked-source checkout.

Entry point:

```bash
bash scripts/m3/r7_v2_clean_checkout_gate.sh
```

The gate uses a separate temporary clone, installs dependencies
from the npm lockfile, builds the feature-gated Rust V2 contract,
checks artifact parity, and executes local NEAR Sandbox.

## Observed Codespaces result

- Clean tracked checkout: PASS.
- Node.js: 24.22.2; npm: 11.19.1.
- Rust/Cargo: 1.99.1.
- CSV tests: 5/5 PASS.
- Base Rust library tests: 210/210 PASS.
- Targeted V2 Rust tests: 21/21 PASS.
- WASM SHA-256: `2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e` — byte parity PASS.
- Full controlled HTTP 503 rescue lifecycle: PASS.
- Three separate local buyer processes: two approve, one rejects.
- Two selected provider components pass Merkle verification.
- Two selected worker jobs complete.
- Financial liability conservation:
  `48 = 39 + 9 = 3 + 45 = 1 + 47 = 0 + 48` UNIT.
- Temporary checkout has no tracked or untracked drift.
- Final gate exit: 0.

Full local gate log:
`/tmp/nomogenesis-r7-gate-2RziwmO2.log`

Log SHA-256:
`ea11620f08c70dd5fa6af48fe5bb28be6a3ac00643dfd39c591c065ff7c47d4c`

## Evidence limitations

The test uses the existing Codespaces toolchain, not an
independently provisioned machine. The outage is a controlled
HTTP 503 in the same demo process, not yet a separately
terminated source service. Agent policies are preset, and
Sandbox accounts are created by the test controller.

The reported 286 seconds are accelerated Sandbox chain time.
There is no public V2 Testnet transaction, proven native
withdrawal, independent operator or security audit.
The npm installer also reported lifecycle-script warnings.

No Rust business logic or economic contract code was changed
in this ticket. The original feature worktree and its
untracked experiments were preserved.

## Next single action

Review the final branch and fast-forward `main` only after
checking ancestry, diff and source cleanliness.

After repository integration, start `R7-DEMO-03`:
separate source-service process termination, independent
backup processes and an observable event-driven recovery.
