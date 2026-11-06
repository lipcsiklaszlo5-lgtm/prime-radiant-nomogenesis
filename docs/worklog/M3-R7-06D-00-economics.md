# R7-06D/00 — Economic Counterfactuals

Base: `0179cbe`
Branch: `feat/r7-genesis-certificate`

## Experimental evidence

- Verified archived signed market as source.
- Same declared beneficiaries and recovered service.
- Joint reference: buyer net 9, provider margin 4,
  declared total incremental surplus 13 UNIT.
- Individually unaffordable at price 11 UNIT.
- Hypothetical standby can win at lower resource cost.
- Hypothetical in-time spot can also win.
- Late spot is ineligible.
- Capital carry charge can reverse comparison.
- Sensitivity and unilateral exits reconstructed.

## Major research finding

A non-excludable shared recovery can create
a profitable free-riding deviation even when
all paying participants have positive utility.
This is a synthetic incentive counterexample,
not proof that the deployed contract is unstable.

## Evidence digest

`1ed5284bfd70af0724f8e4e886668306ca24bcaa15f55b6a4d7835b76819e8a1`

## Model limits

No real economic measurements. Counterfactual
supplier costs, availability and capital charges
are hypothetical, not signed agent declarations.
Locked-capital opportunity cost is not calibrated.
No comprehensive core, Nash, mechanism-design
or coalition-proofness theorem is claimed.
No new NEAR contract or Testnet operations.

## Reproduction

`python3 -B scripts/m3/r7_06d_economics.py --verify`

## Next

R7-06E: determine on-chain sponsor authorization
and whether recovery benefits can be excluded
from nonpaying buyers without invalidating M3.
