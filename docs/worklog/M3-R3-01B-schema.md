# M3-R3-01B — bounded offer and bundle schema

**Base:** `97e9178` on `feat/m2-escrow`.
**Status:** verified locally; checkpoint SHA in Git history.

## Purpose

Reserve storage for six offer references, one future bundle, each provider's
offer and claimable, and a typed capacity lock. No offer deposit, bond lock,
award endpoint or economic liability is activated by this step.

## Inputs and output

Input: committed R3-01A schema, R3 design, clean tracked worktree and the
preserved local audit file. Output: persistent zero-liability records,
version-2 storage quote, maximum-size serialization fixtures and updated
case/sandbox quote expectations.

## Exact command

`python3 scripts/m3/m3_r3_01b_schema.py`

## Observed result

- `python3 -B scripts/m3/m3_r3_01b_schema.py`: exit 0.
- `cargo fmt --all` and `cargo fmt --all -- --check`: exit 0.
- `cargo test --locked --lib rescue_schema_tests`: 2 PASS, exit 0.
- `cargo test --locked --lib rescue_case_tests`: 4 PASS, exit 0.
- `cargo test --locked`: 139 unit + 11 model + 17 event + 6 ledger =
  173 PASS, exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0; WASM SHA-256
  `242765bb258020878b957e81507be839ed939459380230c69c85ec58a324c2bf`.
- `npm run sandbox:primary`, `sandbox:backup`, `sandbox:settlement`,
  `sandbox:m3-r2`: each exit 0. M3 case quote 1233 bytes and the three
  independent buyers' principal reconciled.
- `git diff --check`: exit 0.
- Before commit, the six planned tracked files changed; this worklog and
  the scaffold are new; the untracked local audit file is untouched.

## Files

`src/rescue.rs`, `src/lib.rs`, `src/rescue_schema_tests.rs`,
`src/rescue_case_tests.rs`, `sandbox/m3_rescue_lifecycle.cjs`,
`docs/HANDOFF.md`, this worklog and the builder itself.

## Limitations and next action

Fresh deployment only; old serialized contract state is not migrated. Offer
admission and award remain absent. Next: M3-R3-02A payable provider
offer admission, with release in a separate step.
