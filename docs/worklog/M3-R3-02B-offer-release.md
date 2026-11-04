# M3-R3-02B — terminal offer release

**Branch/base:** `feat/m2-escrow` / `71a1350`.
**Worktree:** only `sandbox/real_low_margin_audit.cjs` was untracked at start.
**Status:** verified locally; checkpoint SHA in Git history.

## Purpose and contract

An open offer's provider may cancel before bid close. After award close,
anyone may release it. Once a case is awarded, anyone may release an
unselected open offer. A selected or locked offer stays inaccessible to
these paths. The provider's held bond becomes claimable exactly once;
storage reserves and capacity locks do not change.

## Inputs and outputs

Inputs: offer ID, authenticated predecessor and chain timestamp. Output:
terminal phase/reason, zero held bond, matching `rescue_escrow` decrement
and provider claimable increment. The caller cannot supply a recipient.

## Reproduction and observed output

`python3 -B scripts/m3/m3_r3_02b_offer_release.py`

Execution results and exit codes are recorded below.

## Files and next action

`src/lib.rs`, `src/rescue_offer_release_tests.rs`, `docs/HANDOFF.md`, this
worklog and the Python builder. The existing local audit file is preserved.
Next: run the focused Rust release tests; inspect any failure before
proceeding to the Sandbox release lifecycle.

## Focused execution — 2026-11-04

- `python3 -B scripts/m3/m3_r3_02b_offer_release.py`: scaffold exit 0.
- `cargo fmt --all`: exit 0.
- `cargo test --locked --lib rescue_offer_release_tests`: 5 passed, 0 failed, exit 0.
- `git diff --check`: exit 0.
- Status: expected edits plus preserved untracked audit file.

## Sandbox step

`python3 -B scripts/m3/m3_r3_02b_sandbox.py` creates the focused Sandbox
test and package command. Run the full Rust regression, Clippy, WASM build
and `npm run sandbox:m3-r3-release`; record actual exit codes. The Sandbox
checks two independent bonds, unauthorized cancellation, replay, keeper
expiry, storage invariance, claimable totals and native withdrawal.

The post-award unselected path currently has only a unit test with a
constructed bundle. A real award does not exist until R3-03.

## Verified execution

- `python3 -B scripts/m3/m3_r3_02b_sandbox.py`: exit 0.
- `node --check sandbox/m3_offer_release.cjs`: exit 0.
- `cargo test --locked`: 150 unit + 11 model + 17 event + 6 ledger = 184 passed; exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; SHA-256 `f67b157ebba28f48b7096c43e10d3322c7b5f4f3e2e6d3bff9d84bcbfa088221`.
- `npm run sandbox:m3-r3-release`: PASS, exit 0 on fresh local state.
- `git diff --check`: exit 0.

Sandbox rejected keeper cancellation (receipt `CapwoFn3gCNBxt9EcUMfky3qAZgk9GWoEQzRjF5PscLh`),
early expiry (`48BuNjsEC2coUBoEkfMPUig5k5HRU8wWim5FtSaBrbjs`) and both
replays. After award close it credited both providers once, retained storage
reserves, left capacity slots free and completed a withdrawal callback.
It did not compare native receiving-account balances. Earlier lifecycle
Sandboxes were not rerun on this WASM. Post-award unselected release still
needs an actual awarded bundle in R3-03.

## Checkpoint and next action

Changed files: `AGENTS.md`, `docs/HANDOFF.md`, `docs/STATUS.md`, this worklog,
`package.json`, `sandbox/m3_offer_release.cjs`, `src/lib.rs`,
`src/rescue_offer_release_tests.rs`, and three R3-02B Python builders.
The commit command prints the resulting SHA. Preserve the local audit file.
Next: M3-R3-03A deterministic candidate selection preflight.
