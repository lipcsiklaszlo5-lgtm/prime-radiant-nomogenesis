# R7-13H/01 — Local RPC broker

Status: initial independently tested component.

## Problem

R7-13 RUN03 stopped after HTTP 429 responses
caused by concurrent public Testnet polling.

The coordinator and agent processes used
the public FastNear RPC independently.

## Implementation

- Loopback-only Node.js JSON-RPC broker.
- One upstream request in flight.
- Configurable request spacing and queue limit.
- In-flight coalescing of identical safe reads.
- Bounded read-only retry and endpoint failover.
- Chain-ID verification on status.
- Signed transaction forwarding only once.
- No automatic write retry or write failover.
- Duplicate signed submissions refused in memory.
- No keys or signed payloads printed.

## Tests

Seven offline tests verify:

1. Read coalescing and request-ID preservation.
2. HTTP 429 retry and read-only failover.
3. No write retry after uncertain broadcast.
4. Distinct signed transactions.
5. Duplicate payload rejection.
6. RPC method allowlist.
7. Wrong-network refusal.

## Boundaries

This component is NOT yet integrated into the
ten-agent live coordinator.

No public Testnet transaction was performed.

The broker's in-memory duplicate guard does
not replace the existing durable signing journal.

The old coordinator must not be run with
--live because its RUN03 path is already used.

## Next

R7-13H/02:

- Wire all agents and coordinator to one broker.
- Verify near-api-js RPC compatibility.
- Confirm signing isolation and finality behavior.
- Test the complete dry-run.
- Prepare a new isolated live-run directory.
