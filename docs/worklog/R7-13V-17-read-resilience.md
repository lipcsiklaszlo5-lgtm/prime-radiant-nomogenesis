# R7-13V/17 — Read-only RPC resilience

RUN05 finalized eight original public transactions
but the coordinator exited on one RPC HTTP 503.

This checkpoint introduces a bounded read-only retry
helper for coordinator and agent RPC views.

Transient 429/502/503/504, timeouts and broker queue
failures may be retried. Contract and validation
failures still fail closed.

Agent polling is reduced from 900ms to 1800ms.

**No signed transaction retry is introduced.**

Offline fault injection tests verify recovery from
temporary read failures and refusal to retry
deterministic contract errors.

RUN03, RUN04, RUN05 and their recovery journals remain
immutable. No new public Testnet transactions.

Before another live attempt, a fresh one-shot
launcher and a full lifecycle fault-injection
gate are still required.
