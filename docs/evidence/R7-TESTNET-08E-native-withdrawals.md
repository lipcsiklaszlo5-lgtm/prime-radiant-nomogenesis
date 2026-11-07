# Nomogenesis R7 V2 — Public Testnet Native Withdrawals

## Independently inspectable evidence

- Network: NEAR Testnet
- Contract: `nmg-r7v2-0b9a0eff20.testnet`
- Recovery case: `b8c0d0ed9f80a399cba96c4c9ac688e548e500cb4705ecbfdbdcedd0a2b9bf12`
- Both Merkle-authenticated recovery components succeeded
- Reconstructed worker result: 632
- Both workers completed before the native payout tests
- Native withdrawals verified: 18 UNIT
- Remaining contract claimables: 34 UNIT
- Pending withdrawals: 0 UNIT
- Rescue escrow: 0 UNIT
- Economic reconciliation: **18 + 34 = 52 UNIT**

## Native payout transactions

| Recipient | UNIT | Transaction | Transfer receipt | Callback receipt |
|---|---:|---|---|---|
| worker0 | 1 | [`6EfrsywrqboecjciDJSFsqGs3bMTWDSkKkCQYYxWbfHU`](https://testnet.nearblocks.io/txns/6EfrsywrqboecjciDJSFsqGs3bMTWDSkKkCQYYxWbfHU) | `BChsf5UieY1Xd9tWgRRxYpKkqnSNdGruqoeMEMPMxCR` | `5KPtwN4KYqWf4EFvuHVbGDrfgWLEqM3mLXoxD5CETj3o` |
| gamma | 17 | [`EvcNXD3yk7tu9NHYWqC4nSbhUbVus95dtjf2s7tDR1mr`](https://testnet.nearblocks.io/txns/EvcNXD3yk7tu9NHYWqC4nSbhUbVus95dtjf2s7tDR1mr) | `FHpTja3p7wg4VYpjgjEicBa1AWkN48TiPZNCJj48tfzP` | `ETo9UiFyGrGNT2RyhE1T14PfbXvfzxwUqQ1qJiZdDo2G` |

## Verification

Both withdrawals were verified using signed transaction
arguments, successful native Transfer receipts, successful
contract callbacks, and finalized claimable/pending balances.

The remaining 34 UNIT are claimable credits, not verified
native withdrawals. They belong to Buyer 1 (1.5 UNIT),
Buyer 2 (1.5 UNIT), Provider Alpha (12 UNIT),
Provider Beta (18 UNIT), and Worker 1 (1 UNIT).

The market uses synthetic CSV data and operator-controlled
Testnet identities. No real-world outage verification or
production security audit is claimed.

Related evidence:
[Full R7 V2 market lifecycle](R7-TESTNET-08D-live-market-01.md).
