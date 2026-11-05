# R7-02B/00 — Public transaction preflight

Base commit: 1a705ed
Branch: feat/r7-genesis-certificate

## Verification

Read-only extraction of 10 historical NEAR Testnet
transactions from the R6 public evidence manifest.

The first attempt failed because the dRPC endpoint
returned HTTP 403 Forbidden.

The retry used FastNear and the legacy NEAR Testnet
public endpoint. Both returned matching decoded
transaction arguments.

No private keys and no blockchain writes.

## Reproduction

python3 -B scripts/m3/r7_chain_probe.py

## Evidence

/workspaces/nomogenesis-r7-chain-preflight.json

The generated evidence is local and not committed.

## Limitations

- No historical complete-market snapshot yet.
- No independent operator guarantee for RPC endpoints.
- No full historical contract-state reconstruction.
- No Genesis Certificate bound to chain state.
- No new economic superiority claim.

## Next

R7-02B/01: historical eligibility and award
reconciliation against the actual contract rules.
