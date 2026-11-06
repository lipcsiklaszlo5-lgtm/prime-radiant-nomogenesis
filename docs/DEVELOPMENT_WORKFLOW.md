# Development workflow

New-chat entry: `docs/CURRENT_STATE.md`. Check the current Git HEAD and the top `docs/HANDOFF.md` entry before following historical plans.

M3 and later work uses small, committed checkpoints.

## Layout

- scripts/m3/: deterministic off-chain Python tools
- docs/worklog/: append-only engineering step records
- docs/HANDOFF.md: current verified state and one next action
- docs/STATUS.md: verified project facts
- docs/DECISIONS.md: append-only architecture decisions

## Every Python scaffold

Each new or changed Python scaffold must have a matching worklog entry containing:

1. ticket and step;
2. branch, commit and worktree state;
3. purpose, inputs and outputs;
4. exact command;
5. observed output and exit code;
6. tests and changed files;
7. limitations and exactly one next action.

Use deterministic fixtures, stable output ordering and no secrets or local paths. Python remains off-chain support; Rust/NEAR remains the settlement source of truth.

## Checkpoint rule

Only one ticket is active. A failed check is recorded, not patched indefinitely. After two repair attempts on the same failure, stop and record the blocker.

Before every mutation:

    git status -sb
    git log --oneline -8
    git diff --stat

When a session ends, update the worklog and HANDOFF, commit the completed checkpoint, and push it if the next session will read GitHub.
