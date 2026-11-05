# R7-05C/03 — Public Keyless Verification

Base: 242c4e7
Branch: feat/r7-genesis-certificate

## Verified

- 17 signed public NEAR Testnet transactions
- Signer, contract, method and attached deposit
- SHA-256 of original signed transaction arguments
- Successful transaction execution and receipts
- Two independent CSV component recomputations
- Three worker result recomputations
- Genesis Certificate reconstructed from signed calls
- Full final case, jobs and provider state
- Final escrow and claimable accounting
- Native 20 UNIT transfer and callback receipts
- Negative transaction and certificate tamper tests

## Precision correction

The initial attempt passed large JSON integers
through JavaScript JSON.parse/JSON.stringify.

That changed monetary uint128 values to floating
point values in the Python reconstruction process.

The corrected implementation reads the recorded
Genesis Certificate directly in Python.

A regression test checks exact uint128 retention
and full deterministic certificate regeneration.

## Reproduction

node scripts/m3/r7_05c_public_verify.cjs

No wallet, private keys or signing required.

## Limitations

- External public RPC data is trusted
- No local historical Merkle state proof
- Off-chain Genesis certificate, not on-chain selection
- Provider ready_at is a documented bid-close surrogate
- Demonstration accounts operated by one controller
- Eight prior SDK nonce-retry hashes remain inconclusive

## Next

Integrate both public Testnet cases into the jury
experience and review the final submission.
