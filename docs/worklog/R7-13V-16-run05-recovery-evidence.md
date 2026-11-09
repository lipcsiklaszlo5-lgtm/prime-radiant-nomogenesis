# R7-13V/16 — RUN05 public recovery evidence

Finalized audit block: `FMTD6t22ZpAiXAFxNhcsHRRkGnvADupYwdhRAvJ8pmC4`

RUN05 stopped after eight finalized transactions due to an RPC read error.
A separate seven-transaction recovery released all 52 UNIT.

- Original RUN05: 8/8 finalized Testnet transactions
- Recovery: 7/7 finalized Testnet transactions
- Initial escrow / claimable: 52 / 114 UNIT
- Final escrow / claimable: 0 / 166 UNIT
- Storage reserve drift: 0

## Recovery transactions

- `release-offer-7` (12 UNIT): `HuKjZLW2MkN6c2xsS21naYtBN2vpRszG91EkSqnJnRPa`
- `release-offer-8` (12 UNIT): `9orWz4gkNnogSMVZMcrps9bc13wbcbofNhhP9QJkHEiG`
- `release-offer-9` (12 UNIT): `5H5RNsMgFK5kCZftDjiTDJFNjnXWzCxPp1PppRUAoPat`
- `release-mandate-6` (7 UNIT): `DSgdxYbMAQyD5jBz87L8QRvCFcRu8xXMmtUdrkYnexjS`
- `release-mandate-7` (7 UNIT): `t53DQAdc4sNJfZhDPYSjhpaB4Rg78FPFKkbyyEb7HCs`
- `expire-job-6` (1 UNIT): `13vn9wZKHFdWGUQgFvomiYsMs9RidHsEhyhhViSQMEx2`
- `expire-job-7` (1 UNIT): `593S8LmztY1RHTr2bhKL553Fi6Cu9sjT69aXeLnbQbu`

## Limitations

RUN05 does not prove atomic award, settlement or worker completion.
All private journals remain unchanged.
Only their SHA-256 fingerprints are published.
