# R7-02A/02 — Genesis input hardening

Base commit: 32a3392
Branch: feat/r7-genesis-certificate

## Scope

- Strict schema validation and canonical sorting.
- Checked uint64 identifiers and uint128 amounts.
- Rejection of malformed, duplicated and unknown fields.
- Full negative coverage of incomplete offer pairs.
- Rehashed certificate forgery tests.
- Strict JSON equality for proof fields.

## Reproduction

python3 -B -m unittest discover -s scripts/m3 -p 'test_r7_genesis*.py' -v
node --test scripts/m3/r7_emergence_benchmark.test.cjs

## Observed expected output

- 16 Python tests PASS.
- 9 Node.js benchmark tests PASS.
- Reference certificate accepted.
- Modified proof rejected after rehash.

## Limitations

- Input snapshot is synthetic and unauthenticated.
- No public NEAR state anchoring.
- No production security audit.
- No strategic coalition stability proof.
- No full Rust/Python differential validation.
- No independent operator network.

## Next single action

R7-02B: authoritative public Testnet snapshot extraction,
block-height binding and contract-state reconciliation.
