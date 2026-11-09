# R7-13H/03 — Queue deadlines and priority

## Scope

- Offline stress simulation of ten agents:
  12 waves of 10 read requests.
- Serialized upstream RPC.
- Read coalescing with distinct JSON-RPC response IDs.
- Already-signed sends prioritized ahead of queued reads.
- An active RPC request is never interrupted.
- Queue limits: 5 seconds for reads, 7 for sends.
- Stale queued calls fail without reaching an upstream.
- Bounded queue size and HTTP 429 read-only fallback.
- Broadcasts remain one-shot, with no write retry.

## Verification

Seven focused offline stress tests, seven previous
broker tests, twelve signing/finality Node tests,
55 Python Shield tests and a public read-only dry-run.

## Limitations

Priority is not an on-chain finality guarantee.
Queue deadlines do not bound upstream response time.

The transaction journal remains durable.
Broker duplicate detection is still in memory only.

This is not a completed live Testnet rescue lifecycle.
No private signer files or journals are modified.

## Next milestone

R7-13H/04:

- Fresh isolated live-run identity and directory.
- Explicit live-mode safeguards.
- Sustained end-to-end agent lifecycle simulation.
- Separately authorized public V2 execution.
