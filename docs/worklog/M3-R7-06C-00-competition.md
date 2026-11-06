# R7-06C/00 — Competitive Clearing Audit

Base: `712e4ad`
Branch: `feat/r7-genesis-certificate`

## Recorded signed reference

- 4 complementary offer pairs examined.
- 2 valid complete bonded pairs.
- Winner: offers [3,2], price 11 UNIT.
- More expensive eligible pair: [1,2], 12 UNIT.
- Cheaper pairs 9 and 10 UNIT rejected because
  the participating supplier refuses the fee.
- Selected buyer coalition [1,2].
- Allocations [6,5] UNIT.

## Witness SHA-256

`6a6b022f8a9d15f64357a543b424e0099f968496a62bfe59c899828ecc133bcb`

## Verification

- Signed R7-06B archive reverified by Node.js.
- Existing Genesis provider pair checked against
  an independent full pair enumeration.
- Adversarial tests cover bond shortfall, shared
  provider or slot, expiry, refusal, tie breaking,
  duplicate IDs, overflow and forged witness.
- Deterministic synthetic parameter sweep.
- Historical M2/M3/R6/R7 evidence preserved.

## Reproduction

`python3 -B scripts/m3/r7_06c_competition.py --verify`

## Limitations

No production auction, independent ownership,
private truthful values, on-chain selected subset
or additional Testnet transaction is claimed.

## Next

R7-06D: fair economic counterfactuals and
coalition deviation/stability research.
