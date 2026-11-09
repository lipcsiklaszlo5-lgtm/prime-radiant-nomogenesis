# R7-13H/05 — Sustained RPC polling gate

## Production broker changes

1. Priority selection now happens after the
   inter-request spacing interval.
2. Signed sends can preempt queued reads
   during that interval.
3. Read-only retries have a shared time budget.
4. Each upstream fetch timeout is limited by
   the remaining read budget.
5. Signed broadcasts are never retried.

## Offline evaluation

- Ten independently polling simulated actors.
- Eight polling rounds per actor.
- 900 ms idle interval after each cycle.
- Shared rescue-case queries.
- Buyer, provider and worker-specific queries.
- Injected primary-endpoint HTTP 429 bursts.
- Read-only secondary RPC failover.
- One simulated, signed-write priority test.
- Queue depth, read failures, coalescing and
  read latency recorded.

## Limits

These are synthetic actors using mocked RPC.
They do not execute a full economic lifecycle.

This evaluation is not evidence of public
on-chain award, settlement or completion.

The live coordinator remains guarded and
RUN04 must not be started by these tests.

The original RUN03 journals stay private
and untouched.

## Next

R7-13V:

- Independent live-run preflight.
- Verify contract, actor balances and RPC.
- Fresh RUN04 directory and case identity.
- Explicit authorization of Testnet writes.
- Full V2 lifecycle with finalized evidence.
