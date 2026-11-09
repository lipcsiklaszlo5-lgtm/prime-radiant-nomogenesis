# R7-13H/04 — Fresh isolated public-run guard

## Previous evidence

- R7-13 RUN03: eight confirmed Testnet TX,
  incomplete lifecycle.
- R7-13R: seven further finalized recovery TX.
- All 52 UNIT released from rescue escrow.
- Old RUN03 and recovery journals stay private.

## New live-run identity

Proposed next identity: `live-v2-once-04`.

The coordinator only permits this identity for
future live execution. RUN03 cannot be selected.

A new live run requires all of:

1. Exact RUN04 identifier.
2. Explicit public-Testnet enable flag.
3. Separate new-run approval flag.
4. Loopback-only shared RPC broker.
5. Fresh, unused journal directory.
6. Existing Testnet contract identity checks.

No fresh live run is executed by this checkpoint.

## Verification

- Six negative live-guard tests.
- Previous broker stress, signing, finality tests.
- Python Shield SDK tests.
- Real read-only ten-agent dry-run.

## Remaining limitations

This is a guarded execution path, not proof that
ten agents can complete a new public lifecycle.

The shared RPC broker remains process-local,
and signed transaction idempotency relies on
the durable per-agent transaction journals.

The broker does not guarantee available RPC
capacity or a particular Testnet finality delay.

## Next

Run a realistic burst-and-polling admission
gate against a local simulated upstream.
Only then explicitly authorize RUN04 Testnet.
