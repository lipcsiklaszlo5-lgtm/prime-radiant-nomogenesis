# R7-06B/00 — Signed Local Agent Decisions

Base commit: `4573883`
Branch: `feat/r7-genesis-certificate`

## Verified local pipeline

- 3 separately spawned buyer processes.
- 4 separately spawned provider processes.
- 7 independent ephemeral Ed25519 key pairs.
- Authenticated synthetic decision declarations.
- Session-bound nonce and expiry checks.
- Buyer and provider refusal recorded.
- Python Genesis formation independently reconstructed.
- Final synthetic coalition: [1,2].
- Selected supplier offers: [3,2].
- Provider pair price: 11 UNIT.
- Buyer payments: [6,5] UNIT.

## Evidence digest

`2ec281c4d212255fcfa7e080bb5b0b2c942124bb34fa8871f2452dc504266bab`

## Scope

No private signing keys committed. No NEAR writes.
No independent operators or on-chain subset award.
Signed statements declare synthetic public preferences;
the ephemeral keys have no external identity registry.
Historical timestamps are not trusted attestations.
Anti-replay protection is session-scoped.

## Reproduce

`node --test scripts/m3/r7_06_swarm.test.cjs`

`node scripts/m3/r7_06_swarm.cjs --verify docs/evidence/R7-06B-synthetic-signed-decisions.json`

## Next

R7-06C adversarial multi-offer market clearing,
supplier conflicts, eligibility and deviations.
