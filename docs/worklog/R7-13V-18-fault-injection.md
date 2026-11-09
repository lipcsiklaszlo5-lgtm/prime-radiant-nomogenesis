# R7-13V/18 — Fault-injected real coordinator dry-run

The real ten-agent coordinator is run in read-only
mode through a local loopback fault proxy.

The proxy deliberately returns one HTTP 503 for
the first `status` request and one for the first
`query` request.

The coordinator must recover through bounded
read-only retries, connect ten agents, and complete
the dry-run.

A separate local RPC broker forwards legitimate
reads to NEAR Testnet and forbids all signed writes.

This test does not execute the actual award or
settlement lifecycle and does not replace the
full V2 Sandbox integration gate.

The next stage requires a fresh RUN06 launcher,
unique identity, and a separate live approval.
