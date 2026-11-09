# R7-13V/11 — RUN05 isolated preflight

The RUN04 recovery is complete and immutable.

RUN05 uses a separate one-shot launcher, run directory,
launch intent, log and specific live approval.

The live coordinator accepts RUN05 only through the
guarded launcher. RUN03 and RUN04 cannot restart.

The broker uses FastNear Testnet as primary and the
FastNear archival endpoint as read-only fallback.

No automatic signed broadcast retries or failover.

This checkpoint verifies offline safety gates and
public Testnet read-only connectivity.

No new public Testnet transaction is authorized here.
