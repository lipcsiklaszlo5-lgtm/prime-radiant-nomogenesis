# M3-R3-03B-01 — capped-equal sponsor allocation

**Branch/base:** `feat/m2-escrow` / `2854d2f`.
**Starting worktree:** only `sandbox/real_low_margin_audit.cjs` untracked.
**Status:** locally verified; atomic award not yet implemented.

## Purpose

Prepare the bounded, deterministic buyer-allocation part of atomic bundle
award. Input is the eligible `(job_id, held_cap)` list derived by R3-03A and
the selected bundle price. Output contains every eligible job in ascending
ID order, including zero allocations that must be released at award.
Reject empty/duplicate/zero caps, more than six sponsors, insufficient
funding and arithmetic overflow before state mutation.

## Exact reproduction

`python3 -B scripts/m3/m3_r3_03b_01_allocation.py`
`cargo fmt --all`
`cargo test --locked --lib rescue_allocation_tests`
`git diff --check`

Verified: 6 focused tests; 197 full Rust tests; rustfmt, Clippy, WASM and existing M3 pair-preview Sandbox PASS. This step creates no bundle,
credit, capacity lock or RecoveryRight. The local audit file stays untouched.

## Changed files and next action

`src/rescue_clearing.rs`, `src/lib.rs`, `src/rescue_allocation_tests.rs`,
`docs/HANDOFF.md`, this worklog and the Python scaffold.
WASM SHA-256: `652c1bd8d79748f6ea6e25ebc96214d25ec0b4a8f928dc9698b8823a8c6bdec3`. Existing Sandbox verifies preview only, not award.
Next: M3-R3-03B-02 atomic award integration.
