# M3-R6-05B — Public Testnet economic lifecycle

Date: 2026-11-04
Base commit: `b471895`
Branch: `feat/m2-escrow`
Status: PASS

## Observed result

- 9 consortium transactions: PASS
- 8 award/proof/settlement/payout transactions: PASS
- Atomic award: `67c1G5C49tKZPjjjehJ9xs1qa9GYtbrW7C2igMjzsybT`
- Terminal settlement: `7wFv9zQWkKcUMSjxMSCMDA4jQM9J9BkpZTryNa4ixgsA`
- Native withdrawal: `AiDr3cP7BWF38k49VsnrKULjcSNU2fXuSKgRHm9GDPWs`
- Full 114 UNIT new-consortium conservation: PASS
- 36 UNIT provider credits
- 75 UNIT worker rewards
- 3 UNIT buyer refunds
- 20 UNIT native Transfer and callback receipts: PASS
- Final claimable: 94 UNIT
- Remaining prior R6-04 rescue escrow: 30 UNIT

## Reproduction

```bash
node scripts/m3/r6_verify_public.cjs
```

The verifier reads only public Testnet RPCs and the checked-in
public evidence manifest. It does not require signer keys.
The program validates all 17 transactions, contract bytecode,
two CSV components, job/provider states and payment receipts.

Public manifest: `docs/evidence/R6-05-public.json`

## Limits

All roles are synthetic demonstration identities run by one
operator. Testnet NEAR is not mainnet NEAR. The economic
mechanism is implemented and publicly executed, but no
independent audit, production safety or real market advantage
is claimed.

## Next

M3-R6-06: submission-ready demonstration and independent review.
