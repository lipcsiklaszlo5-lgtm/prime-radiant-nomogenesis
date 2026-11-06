# R7-FIX-01 — Provider-scoped slot parity

Date: 2026-11-06. Branch: `fix/r7-fix-01-provider-slot`.
Base: `2778cdd202f549e93740567b994b0b137644794e`.
Resulting commit: `git log -1` on this branch.

## Reproduced problem and change

The on-chain capacity key is `provider|slot_id`. The offline Genesis,
Python/Rust certificate verifiers, JS benchmark and independent Python
competition witness rejected two distinct providers that happened to
use the same slot name. Before the fix, Python returned no winning pair,
JS returned null, and the new positive tests failed.

The offline comparisons now use provider plus slot. Positive tests cover
distinct providers sharing a slot name; negative tests retain the
same-provider rejection. Contract and historical evidence unchanged.
The original feature worktree's untracked files were not included.

## Observed checks

- `python3 -B -m unittest discover -s scripts/m3 -p 'test_r7_*.py' -q`:
  93 tests OK, exit 0 locally and in Codespaces.
- `node --test scripts/m3/*.test.cjs`:
  48 passed, 0 failed, exit 0 locally and in Codespaces.
- `cargo test --locked --test r7_genesis_certificate`:
  Codespaces exit 0; test count was not captured in the pasted output.
- Offline public-artifact replay: PASS in the separate review checkout;
  no live network replay.
- `git diff --check`: exit 0.
- Full Rust suite, Clippy, WASM, Sandbox and public Testnet: not rerun.

## Next single ticket

`R7-REPO-01`: inventory every branch and the untracked buyer/audit
experiments. Then plan a reviewed default-branch update. Preserve
historical refs until their contents are accounted for.
