# R7-13V/20 — Bounded concurrent Testnet RPC reads

Root risk: the historical broker serialized upstream
operations. On high-latency Testnet nodes this could
accumulate ten-agent polling requests and exhaust
the read queue or deadline budget.

RUN06 explicitly enables four parallel read slots.

Other broker callers remain serialized by default,
preserving historical queue tests and behavior.

Signed sends have priority over pending reads.
At most one signed send runs at a time.
All signed submissions retain one-shot journal
protection and no retry or upstream failover.

A local 380-ms upstream-latency test exercises
50 distinct agent requests, one injected 503,
one signed send, and one prohibited duplicate.

No public transactions are sent in this checkpoint.
RUN03–RUN05 and recovery evidence remain untouched.

This reduces transport risk but does not replace
a complete public RUN06 lifecycle.
