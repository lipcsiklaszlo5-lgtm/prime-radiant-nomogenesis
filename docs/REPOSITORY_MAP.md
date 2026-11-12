# Repository map

Start at `../README.md`. The shortest reproducible path is `npm ci` and
`npm run verify` on Linux x86-64 with Node 22 and Python 3.

| Area | Purpose |
| --- | --- |
| `src/` | NEAR Rust contract and economic state transitions |
| `artifacts/nomogenesis-v2.wasm` | Exact tested V2 binary, checked by SHA-256 |
| `scripts/verify-submission.sh` | Fast reviewer entry point |
| `scripts/m3/technical_closure.cjs` | Fresh sandbox lifecycle orchestrator |
| `scripts/m3/r7_13_public_coordinator.cjs` | Agent lifecycle and event coordination |
| `sdk/` | JavaScript recovery intent and read-only Python Shield SDK |
| `demo/data/`, `demo/backups/`, `demo/policies/` | Controlled outage, recovery payloads and agent policy inputs |
| `docs/evidence/technical-closure-testnet-2026-11-12/` | Public V2 transaction and SDK audit records |
| `docs/worklog/`, `docs/archive/` | Development history; not reviewer runbooks |

`scripts/m3/` contains historical source generators and run-numbered
launchers alongside the active runtime. The local verification command is
the authoritative runnable path. Do not infer that an older launcher is a
current entry point from its filename, or delete a module merely because
its name contains an older R7 number: active files still import some of
them. Code consolidation is separate work from the frozen submission.
