# M3-R3-02A — funded provider offers

**Base:** `314d44b` on `feat/m2-escrow`.
**Status:** verified locally; checkpoint SHA in Git history.

## Purpose

Create individually funded provider offers with bounded slot declarations.
Posting adds the provider's full bond capacity to `rescue_escrow`; the storage
deposit stays in `storage_reserves`. The shared capacity registry is unchanged
until a complete bundle is awarded.

## Inputs and outputs

Input: case ID, component index, slot ID, fee and bond capacity. The contract
derives the provider from the predecessor. Output: one persistent offer ID,
one case offer reference and two separate liability increments.

## Commands and observed results

- `python3 -B scripts/m3/m3_r3_02a_offer_admission.py`: exit 0.
- `cargo test --locked --lib rescue_offer_tests`: 6 passed, exit 0.
- `cargo test --locked`: 145 unit + 11 model + 17 event + 6 ledger = 179 passed, exit 0.
- `cargo fmt --all -- --check`: exit 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit 0.
- `npm run wasm:build`: exit 0, SHA-256 `a82f0c54d1e1d24d92d2a745a4882ac7e381c6c27b7094e4aee09f0291b367c5`.
- `python3 -B scripts/m3/m3_r3_02a_sandbox.py`: exit 0.
- `node --check sandbox/m3_provider_offer_admission.cjs`: exit 0.
- `npm run sandbox:m3-r3-offer`: PASS, exit 0. Two independent bonds,
  exact storage and no capacity lock; underpayment and duplicate rejected.
- `npm run sandbox:primary`, `sandbox:backup`, `sandbox:settlement`,
  `sandbox:m3-r2`: each PASS, exit 0 on the same WASM.
- `git diff --check`: exit 0. Audit file remains untracked and untouched.
- Precommit review found six whitespace-only patch context lines in the
  Python builder. These are escaped without changing the applied Rust diff.

## Changed files

`src/rescue.rs`, `src/lib.rs`, `src/rescue_offer_tests.rs`,
`sandbox/m3_provider_offer_admission.cjs`, `package.json`,
`docs/HANDOFF.md`, `docs/STATUS.md`, `AGENTS.md`, this worklog and
the three Python step scripts.

## Limitations and next action

Posting does not reserve a slot or bind a RecoveryRight. Provider bond
release and bundle award remain absent. Next: R3-02B terminal offer
release with authenticated claimable credit and replay protection.
