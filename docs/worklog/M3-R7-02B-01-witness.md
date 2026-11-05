# R7-02B/01 — Transaction-derived Genesis Witness

Branch: feat/r7-genesis-certificate
Base: 83a18e3

## Goal

Derive a bounded Genesis Certificate from actual
public Testnet funding and offer transaction inputs.

## Implemented

- Transaction-to-Genesis input reconstruction.
- Buyer/worker/case identity reconciliation.
- Original funded caps, provider fees and bonds.
- Deterministic minimal coalition certificate.
- Public transaction references and witness digest.
- Five new focused negative/positive tests.

## Commands

python3 -B -m unittest discover -s scripts/m3 -p 'test_r7_*.py' -v
node --test scripts/m3/r7_emergence_benchmark.test.cjs
python3 -B scripts/m3/r7_chain_probe.py
python3 -B scripts/m3/r7_chain_reconcile.py

## Evidence

docs/evidence/R7-02B-01-transaction-witness.json

## Limitations

Transaction inputs are historical and cross-RPC checked.
The ready-at field is a model surrogate.
Provider availability is inferred retrospectively.
Full pre-award state is not authenticated.
Additional offers or slot states are not ruled out
by transaction arguments alone.

This is not yet a complete on-chain Genesis Proof.

## Next single action

R7-02B/02 — Establish award-state completeness
and reconcile the full contract award result.
