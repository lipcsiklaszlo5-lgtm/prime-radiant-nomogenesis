# R7-05C/01 — Full signed public Testnet lifecycle

Base: 17c8263
Network: public NEAR Testnet
Contract: `nomogenesis-70e59593a3.testnet`
Case: `d271fb3d8d9cd1d9559e229efdd1c02cdf053698e9efa9a05e7fa5e1c7619a98`

## Verified economics

- Buyer caps: 7+7+7 UNIT.
- Two bonded offers: 6+6 UNIT fees, 12+12 UNIT bonds.
- Off-chain Genesis minimal coalitions: three two-buyer subsets.
- On-chain award enrolled all three: 4+4+4 UNIT.
- New economic principal: 120 UNIT.
- Buyer refunds: 9 UNIT.
- Provider credits: 36 UNIT.
- Worker credits: 75 UNIT.
- Native payout: 20 UNIT with receipt and callback.
- Before experiment: 30 UNIT escrow / 94 UNIT claimable.
- After experiment: 30 UNIT escrow / 194 UNIT claimable.
- Contract not redeployed. No mainnet funds used.

## Public transactions

- case: `4RDKBA9ZwQcM2exEuar7hMqxBYDVyqCAu7aE95g8HyvZ`
- buyer0-fund: `DD267oHUWq1wyvj5NXbDDYY9Yrci1GxTstazqxxxMmvY`
- worker0-accept: `6WSFXcvX8JXBTW5j7McFTL9HP2QDtkwQ9rQdXjWJ1Zok`
- buyer1-fund: `HCEB7Kj1GK2wax2DWXhw9ZNhCv7B3Z2ZmnAPPJP2fayz`
- worker1-accept: `5ku1u2mnYF5gmZJdGt7Vjey4dcFR9ix4cxvi2zAYVYGB`
- buyer2-fund: `3HxvctQYyrAsh8tsbh8v3FKa9QNFCWajyLoLx5SXVavJ`
- worker2-accept: `G87xWp8NqehZ3qZ7ktatY1cGftYKuH19aGaAaMnQiDfS`
- provider0-offer: `FunThdDECeRbtv6DJEbCTvuR2VsaqnN8bBAgZW7ZUrLy`
- provider1-offer: `HFk3tSjNRBWDkGtU4trnEy2122PYsBDaMMxmH8xYeGYj`
- award: `8xcW4BQutqeokHGpajkSUaMy6F3tMkvFDo7U9hDg3XTG`
- proof0: `4FEY6R9F7DRYkJvScMf7qTUXDBqWpdySUE463KuAA8jc`
- proof1: `5b3HJyEQgPXiCHX2Ek1Lgiu2FEihjX7WKbzxwcKLPrPS`
- settlement: `24mY7RhzYYZHGtZbRAFDoh2j6EUVMuEggiLnpH5GuK9V`
- worker0-complete: `9sGfRxFcx3i5tqcucfEhfg2qTSvCZqCa5GXsL5i7BdoV`
- worker1-complete: `37mxW17ovy19CK6VVeuyvs4TZusgeea6n5Jqc5RvcUFb`
- worker2-complete: `BGZNbG53j941oCqSPMBx3wHzdqYpNv5Ur4NZByYzS8VF`
- withdraw: `AgiakiFWNrg4cA4bB8Zt1Qa4MSUCZeJdG3a6SK4whMdr`

## Scope limitations

The contract allocates to all eligible sponsors; it did not
select a minimal two-buyer coalition. The Genesis Certificate
is a separate off-chain counterfactual computation from
pre-award Testnet data. One operator controls all demonstration
accounts. No independent Merkle state proof or security audit
has been performed.

## Next

Independent public-only verifier and submission audit.
