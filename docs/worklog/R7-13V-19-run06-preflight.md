# R7-13V/19 — RUN06 isolated preflight

RUN05 was permanently stopped and independently recovered.

Verified baseline:
- Prior RUN05 recovery: PASS
- Rescue escrow: 0 UNIT
- Claimable: 166 UNIT
- Seven recovery transactions finalized

RUN06 receives a unique one-shot run directory,
durable launch intent, log, and live approval.

RUN03, RUN04, and RUN05 cannot be restarted in live mode.

The launcher performs bounded read-only RPC retries.
The shared agent transaction transport remains one-shot:
no signed retry, re-signing, or broadcast failover.

This checkpoint performs offline security regressions,
fault injection, SDK tests, and RUN06 read-only preflight.

**No new public transactions are permitted here.**

Before RUN06 live mode:
- Complete full-lifecycle fault and load checks
- Independently verify contract and accounts
- Authorize a fresh one-time live execution
