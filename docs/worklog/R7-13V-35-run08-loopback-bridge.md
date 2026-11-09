# R7-13V/35

RUN08 Loopback Broker Bridge

Parent: R7-13V/34 at 03b8c96.

Branch: feat/r7-13v-34-run08-scaffold.

No additional Git branch or worktree.

## Architecture

Ordinary reads -> local broker -> FastNear

Finality reads -> local broker -> NEAR RPC / dRPC

The existing /33 broker owns:
- concurrency: 2
- queue limit: 24
- spacing: 300 ms
- HTTP 429 failover
- finality upstream selection

## Safety

Only numeric loopback HTTP endpoints are allowed.

Write and broadcast methods are prohibited.

No signing or transaction retry.

No RUN07 rerun.

No RUN08 live execution.

## Evidence

Eight isolated offline HTTP tests.

Existing regression tests must pass.

Real broker connectivity remains unverified.

## Next step

Read-only runtime preflight against
the actual /33 broker.

No live transaction authorization
is granted by this checkpoint.
