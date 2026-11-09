# R7-13V/34 — RUN08 Finality Lane scaffold

Base: 4f80478c4f78ea9a34201eac77d37fa9aed0db2e

Branch: feat/r7-13v-34-run08-scaffold

## Routes

- FastNear: ordinary reads.
- dRPC: send route designated, disabled.
- NEAR RPC: finality primary.
- dRPC: finality read fallback.

The existing /33 broker remains responsible for:
- Max finality concurrency: 2
- Queue limit: 24
- Minimum spacing: 300 ms
- Budget: 30 seconds
- HTTP 429 read failover

The new dispatcher accepts broker adapters. It does
not independently implement broker rate limits.

## Baseline

270 UNIT is the recorded reference baseline.
It is not a new on-chain balance measurement.

## Safety

RUN07 rerun: NO
RUN08 started: NO
New signed transaction: NO
Signed retry: NO
Broadcast enabled: NO

## Remaining

- Bind actual /33 broker adapters.
- Verify full end-to-end read-only behavior.
- Authorize live RUN08 separately.
