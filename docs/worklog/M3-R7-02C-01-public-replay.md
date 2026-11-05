# R7-02C/01 — Public Genesis Replay

Base: f8336b9

## Verified

- Reproduced signed public transaction arguments.
- Reconstructed Genesis Certificate.
- Queried archival pre-award state.
- Reconciled historical atomic award.
- Matched freshly generated evidence to committed JSON.
- Offline tamper tests PASS.
- Python/Rust allocation parity retained.

## Operational recovery

A previous replay failed on archive HTTP 429.
The archival client now uses bounded retries,
Retry-After handling and paced requests shared
between replay stages.

## Reproduction

python3 -B scripts/m3/r7_public_replay.py
python3 -B scripts/m3/r7_public_replay.py --offline

## Limitations

- Archival RPC provider remains an external dependency.
- 429 may persist if provider quotas are exhausted.
- No locally verified Merkle state proof.
- No independent economic actors demonstrated.
- Full Rust certificate verification remains pending.
