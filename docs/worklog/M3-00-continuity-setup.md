# M3-00 — Reproducible checkpoints

- Date: 2026-11-04
- Branch: feat/m2-escrow
- Base commit: 5a1b6ff68402fcc43c500cec0c0be60969dae459
- Tracked worktree: clean
- Preserved untracked file: sandbox/real_low_margin_audit.cjs

## Observed state

- Existing Rust/NEAR M2 implementation is preserved.
- No scripts/m3 directory or M3 Python scaffold existed.
- No m3/clearing scaffold existed.
- Current M3 strategy documents still require reconciliation with the approved collective recovery-market plan.

## Decision

From M3 onward, every Python builder or scenario tool lives under scripts/m3/ and has a matching append-only worklog entry. A new session resumes only from the newest recorded next action.

## Next action

M3-R0: reconcile the strategy documents and executable M3 specification. Do not create a Python scaffold before that checkpoint is committed.
