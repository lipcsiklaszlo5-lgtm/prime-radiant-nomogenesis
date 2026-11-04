# M3-R6-04 — Public funded Testnet smoke

Date: 2026-11-04
Base: `5d4750a`
Branch: `feat/m2-escrow`
Status: PASS

## Public evidence

- Case creation: `HgafqAgqCPuZKM2ezUtuzDndmdHjNavHMwVR9nub81cd`
- Job funding: `31WXAMbRKJC838893AKpwYeAQfYAGYq7ixM1PphCWmnc`
- Worker acceptance: `GvoVxPnMwZoyMSNmZhgvfZvEuSTes6tA6yJBhnj9Ubht`
- Case ID: `7db84312296a1a8ce366f881bd9a399c9a60d5fb62b0534494f3356f8d6c0c63`
- Job ID: 0
- Three distinct funded Testnet accounts
- Rescue escrow: 30 UNIT = 0.03 testNEAR
- Worker reward held: 25 UNIT
- Rescue mandate principal: 5 UNIT
- Finalized state verified by FastNear and dRPC

## Execution

`node scripts/m3/r6_funded_smoke.cjs`

Persistent identities and transaction journal are stored
outside the Git repository and must not be published.

The initial read hit a finality visibility delay;
read-only retries resolved it without resubmission.

Evidence files:
- `/workspaces/nomogenesis-r6-04-evidence.log`
- `/workspaces/nomogenesis-r6-04-public-verification.log`

## Limits

- No Testnet provider offer or bundle award yet
- No public terminal settlement or native withdrawal
- Same Testnet process, separate account identities
- Synthetic economic workload; no real-world capacity
- No independent security audit

## Next

R6-05: full public Testnet rescue lifecycle.
