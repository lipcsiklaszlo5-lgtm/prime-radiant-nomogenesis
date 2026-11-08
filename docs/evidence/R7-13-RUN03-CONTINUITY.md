# NOMOGENESIS — R7-13 public Testnet checkpoint

## Status

PARTIAL SUCCESS — 8 confirmed transaction journal entries.

- Source commit: `13f2adb98510daf3c69c175a0050f288b9b8a9b9`
- Network: NEAR Testnet
- Contract: `nmg-r7v2-0b9a0eff20.testnet`
- Public case ID: `f884628615029609fdd48c43ddcc3c9128c1595c8555545cd9c0b0a302ba68a5`
- Evidence: `R7-13-public-run03-checkpoint.json`

## Successfully demonstrated

1. Public rescue case created and finalized.
2. Real source-process shutdown detected by watchdog.
3. Two independently signed buyer funding operations.
4. Three independently signed provider offers.
5. Two independently signed worker acceptances.
6. Two agent-policy refusals.

## Failure

The free FastNear RPC returned HTTP 429 under concurrent
agent polling. This interrupted the coordinator and agents.

No atomic award, settlement or worker completion was
confirmed by this run.

## Last observed economic position

- 2 accepted jobs: 2 UNIT held worker rewards
- 2 buyer mandates: 14 UNIT held principal
- 3 provider offers: 36 UNIT held bonds
- Total outstanding: **52 UNIT = 0.052 testNEAR**
- Global escrow delta: +52 UNIT
- Claimable delta: 0 UNIT

This is an earlier read-only audit observation,
not a newly queried chain state at checkpoint time.

## Next engineering steps

1. Do not restart run 03 or delete its private journals.
2. Reconcile the case on finalized Testnet state.
3. After award-close, release the three open provider offers
   and two open buyer mandates using guarded one-shot
   transactions.
4. After each worker's final deadline, expire the two
   accepted unfinished jobs, if still eligible.
5. Confirm escrow conservation and claimable credits.
6. Implement shared RPC throttling, caching, 429 backoff,
   and controlled provider failover.
7. Re-run complete public lifecycle with fresh case ID.

## Private recovery material

The original run journal and execution log remain on
the EC2 host under `~/.nomogenesis-r7-13/`.

Do not upload keys, bootstrap credentials, or the
raw private runtime directory to GitHub.

## Integrity

SHA-256 digests of the original private run files are
recorded in the sanitized public evidence JSON.
