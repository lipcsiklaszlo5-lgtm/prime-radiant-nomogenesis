# R7-13V/01 — Isolated RUN04 launcher

## Purpose

Control the shared RPC broker and ten-agent
coordinator as one execution group.

## Safety

- Original RUN03 and recovery journals preserved.
- RUN04 directory must not exist.
- Independent explicit approvals for live mode.
- An exclusive, durable launch-intent marker.
- Private live output log with 0600 permissions.
- Process-group signal handling.
- No automatic retry or restart.
- The existing single-signature journal is unchanged.
- The loopback broker is required for live mode.

## Read-only validation

`--check` runs the actual public Testnet
verification and ten-agent dry-run.

Every broadcast is blocked before upstream
dispatch. No launch-intent or RUN04 directory
is created in check mode.

## Limits

The live execution path is prepared but
has not been authorized or exercised.

Broker failover and finality do not guarantee
a successful end-to-end Testnet lifecycle.

After a failed live run, the durable journals
and finalized chain state must be reconciled.
