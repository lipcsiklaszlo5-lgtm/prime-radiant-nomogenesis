# M3-R3-03A — deterministic pair preflight

**Branch/base:** `feat/m2-escrow` / `46c0080`.
**Starting worktree:** only `sandbox/real_low_margin_audit.cjs` untracked.
**Status:** verified locally; checkpoint SHA in Git history.

## Purpose

Derive the cheapest admissible two-component pair from stored case jobs,
mandates, offers, deadlines and the unified M2/M3 slot registry. The
permissionless read-only preview accepts only a case ID. It exposes the
eligible job IDs and cap total, but creates no bundle, lock, claimable or
RecoveryRight.

## Inputs and outputs

Input: canonical case ID and chain timestamp. Output: optional pair in
component order, price, eligible job IDs and cap total. Reject corrupt
case indexes. Skip released, under-bonded, same-provider, occupied-slot
and overflowing-fee pairs. Ties use ascending offer IDs.

## Reproduction

`python3 -B scripts/m3/m3_r3_03a_pair_preflight.py`

Execution results and exit codes are recorded below. The focused command is
`cargo test --locked --lib rescue_clearing_tests`.

## Changed files and limitation

`src/rescue_clearing.rs`, `src/rescue.rs`, `src/lib.rs`,
`src/rescue_clearing_tests.rs`, `docs/HANDOFF.md`, this worklog and the
Python builder. The local audit file remains untouched.

No capped-equal allocation, credits, bundle creation or provider slot lock
occurs in R3-03A. Next: run focused preflight tests and inspect the result.

## Focused execution — 2026-11-04

- `python3 -B scripts/m3/m3_r3_03a_pair_preflight.py`: exit 0.
- `cargo fmt --all`: exit 0.
- `cargo test --locked --lib rescue_clearing_tests`: 7 passed, 0 failed; exit 0.
- `git diff --check`: exit 0.
- Worktree contained only expected edits and the preserved audit file.

## Sandbox step

`python3 -B scripts/m3/m3_r3_03a_sandbox.py` adds a fresh-state NEAR Sandbox
scenario with three funded jobs, four offers, under-bonded cheap bids, a
read-only winner preview, and a revoked mandate eliminating that candidate.
The full Rust suite, Clippy, compatible WASM and Sandbox results are
recorded below.


## Sandbox timing finding — 2026-11-04

- Full `cargo test --locked --quiet`: 157 + 11 + 17 + 6 passed; exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; WASM SHA-256 `59c1cd29cd54f1c4e5985e8ff4193d558f41985b61e26144ed08556d9d7d968c`.
- Initial `npm run sandbox:m3-r3-preview`: exit 1. The helper jumped 2960
  blocks in one step, past `award_close`; the contract rejected the preview
  with `outside award window`. No Rust contract change is indicated.
- Repair: cap each fast-forward step at 100 blocks and allow up to 100
  measured iterations. The same on-chain scenario passed on rerun.


## Verified execution

- `python3 -B scripts/m3/m3_r3_03a_sandbox.py`: exit 0.
- `node --check sandbox/m3_pair_preview.cjs`: exit 0.
- `python3 -B scripts/m3/m3_r3_03a_timing_repair.py`: exit 0.
- `cargo test --locked --quiet`: 157 unit + 11 model + 17 event + 6 ledger = 191 passed; exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; SHA-256 `59c1cd29cd54f1c4e5985e8ff4193d558f41985b61e26144ed08556d9d7d968c`.
- `npm run sandbox:m3-r3-preview`: first run exit 1 (timing overshoot),
  bounded rerun PASS, exit 0. `git diff --check`: exit 0.

The local Sandbox observed the pre-bid rejection, selected offers `[2, 3]`
with price 12, three eligible jobs and aggregate cap 15; it observed zero
bundles, an open case, open offers and free slots. Revoking the third cap
made the preview return no candidate, while escrow moved from 116 to 111.
Successful transaction receipt IDs were not printed by the Sandbox command.

Files: `AGENTS.md`, `docs/HANDOFF.md`, `docs/STATUS.md`, this worklog,
`package.json`, `sandbox/m3_pair_preview.cjs`, `src/lib.rs`, `src/rescue.rs`,
`src/rescue_clearing.rs`, `src/rescue_clearing_tests.rs`, and four R3-03A
Python builders. Preserve the untracked audit file.

Limit: the preview grants no RecoveryRight and changes no buyer allocation,
provider bond or capacity slot. Earlier M2 and M3-R2 Sandboxes were not
rerun; public testnet and production funds remain unverified.
Next single action: M3-R3-03B capped-equal allocation and atomic award.
