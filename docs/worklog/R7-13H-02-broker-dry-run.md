# R7-13H/02 — Ten-agent RPC broker integration

## Scope

The coordinator and ten agent processes use a
shared loopback RPC endpoint during --dry-run.

The original RUN03 journal directory is preserved.
Its existence continues to block legacy live mode.

The dry-run launcher refuses actual transaction
broadcasts at the upstream transport boundary.

## Verification

- Seven broker offline tests.
- Twelve existing signing and finality Node tests.
- Fifty-five Python Shield tests.
- Public Testnet read-only ten-agent dry-run.
- Zero transaction broadcasts.
- Broker network traffic counter checked.

## Limitations

This does not authorize a new live Testnet run.

The current broker still needs sustained-load,
429 burst, deadline and queue stress testing.

In-memory duplicate detection does not replace
durable signing journals.

## Next

R7-13H/03:

- Ten-agent sustained polling load test.
- 429 burst and transport failure recovery.
- Deadline-aware queue admission.
- Fresh isolated live-run identity and directory.
