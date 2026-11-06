# R7-DEMO-03 — Actual source-process failure

Date: 2026-11-06.
Branch: `feat/r7-demo-03-process-outage`.
Base: `dd1e02d6e8a0b8e9eab21a1d92da8d7a9be9106e`.

## Objective

Replace the single-process HTTP 503 simulation with
an actual, separately running source process that exits
while an independent observer process remains alive.

Preserve the previously verified V2 economic contract.

## Implemented

- Separate child-process CSV source server.
- Separate HTTP observer with its own PID.
- Source process stopped using SIGTERM.
- Observer receives ECONNREFUSED after process exit.
- Integration bridge with child-process cleanup.
- Full V2 Sandbox lifecycle using this real outage.
- Monotonic wall-clock and separate Sandbox chain-time events.

## Executed checks

- JavaScript syntax validation: PASS.
- Separate-process integration test: PASS.
- Full V2 Sandbox economic lifecycle: PASS.
- Two buyer consents, one refusal.
- Exact authorized award: 6 + 6 UNIT.
- Two provider Merkle proofs accepted.
- Two selected worker jobs completed.
- Excluded worker reward expiry: PASS.
- Final financial liabilities: 48 UNIT.

Observed local wall-clock duration from immediately
before SIGTERM to acceptance of both provider proofs:
`25773` milliseconds.

Observed connection-refusal detection interval:
`8` milliseconds.

Sandbox accelerated chain-time result:
286 seconds.

Full original Sandbox log SHA-256:
`2ae1c2b1e25801ff2b4b9af6624ced76f067ccab4017444534f995f02c852b4b`.

The log is retained in the Codespaces environment;
its complete bytes are not committed to Git.

## Limitations

The source process really exits, but the observer is
asked to probe by the test controller; continuous
autonomous monitoring is not implemented.

The recovery CSV components and Merkle proofs are
still prepared from local files before the outage.
Providers do not yet retrieve data from independently
running backup services.

This is local NEAR Sandbox, not a public Testnet run.
There is no proven native withdrawal, external operator,
production SLA or independent security audit.

## Next single action

R7-DEMO-03/04: introduce two separately running backup
data providers, each with its own isolated data directory.
Provider payloads must be obtained after the source
failure, not reused from precomputed demo-controller data.
Retain the existing on-chain proof, authorization and
economic accounting checks.
