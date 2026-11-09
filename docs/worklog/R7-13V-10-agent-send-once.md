# R7-13V/10 — One-shot signed agent transport

## Problem

The previous signed transaction guard used the
near-api-js provider.sendTransaction method.

The provider could internally resubmit the same
signed payload. The shared broker intentionally
rejects duplicate broadcast submissions.

This produced the -32092 collision in RUN04,
despite some transactions reaching finality.

## Change

- Preserve the exclusive durable step journal.
- Generate and validate exactly one signature.
- Verify serialized transaction SHA-256.
- Persist the transaction hash before sending.
- Use one send_tx request with wait_until NONE.
- Use read-only tx queries for FINAL status.
- Retry status queries, never signed broadcasts.
- Require the local loopback RPC broker.
- Keep final transaction and receipt validation.
- Preserve the existing return-value decoding.

## Safety evidence

Tests cover confirmed success, uncertain send,
transient read-only status failure and terminal
execution failure.

Historical RUN03/RUN04 journals are not touched.
No live Testnet transactions are executed.

## Still required

Check broker upstream configuration and test
the whole orchestration under simulated fault
injection before a fresh full-lifecycle run.
