# M3-R5-01 — File-backed data handoff

Base: `7b68ebf`
Branch: `feat/m2-escrow`
Status: Four targeted Node tests PASS; off-chain only.

Inputs:
- demo/data/quantities.csv
- demo/data/prices.csv

Outputs:
- canonical component payloads;
- Merkle siblings and roots;
- checked computed result;
- case/job-bound worker result commitments.

Commands:
- node --test scripts/m3/r5_data_envelope.test.cjs
- node scripts/m3/r5_data_envelope.cjs

Acceptance:
- result calculated from actual file bytes;
- deterministic hashes;
- mismatched or malformed input rejected;
- no new contract or external signer authority.

Limits:
- synthetic sample CSV data, not external live feeds;
- no on-chain R5 execution yet;
- public testnet and independent audit pending.

Next action:
M3-R5-02 distinct-account end-to-end data-work demo.

## Observed results — 2026-11-04

- Node tests: 4 passed, 0 failed.
- Computed total: 632.
- Component payload sizes: 33 and 33 bytes.
- Quantity root:
  c7984c32d4a363564f4f0a0813973f7f520f1a528aa06f9760d388ae14a612ea
- Price root:
  9b217eae2e4eb4d24305d8ed448ef5acc18d604f2116bf8d5186e559eee3f9ed
- No Rust or NEAR contract changes.
- No on-chain R5 execution claimed.
