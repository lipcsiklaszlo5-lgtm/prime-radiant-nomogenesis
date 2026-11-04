# prime-radiant-nomogenesis

Nomogenesis is a NEAR rescue market for agent economies.

When one failed dependency blocks several independently funded jobs, affected buyers can combine bounded rescue mandates and atomically purchase recovery work that none would fund alone.

## Current product direction

- [M3 North Star](docs/M3_NORTH_STAR.md)
- [M3 Rescue Market specification](docs/M3_RESCUE_MARKET_SPEC.md)
- [Verified development status](docs/STATUS.md)

The M2 Rust/NEAR kernel provides funded tasks, collateral, slot locks, Merkle verification, settlement and native withdrawal recovery. The bounded M3 rescue market now implements funded mandates,
bonded recovery offers, deterministic bundle awards, authenticated
component proofs, terminal settlement, worker-result validation,
reward refunds and native withdrawals.

M3-R4-05: 242 Rust tests and 29 regression gates verified,
including two corrected storage-audit expectations.
The contract was validated in local Sandbox and subsequently
deployed to public NEAR Testnet. It is not independently audited
or approved for production.

M3-R5-02: signed local Sandbox demo using two CSV
components, three funded buyers, two providers and three
worker completions. A native withdrawal is verified from
its Transfer and callback receipts.

M3-R5-03: twelve local child-process signers completed
the same economic lifecycle with role-specific signatures,
independent CSV checks and receipt-verified withdrawal.
The legacy single-process demo also passed regression.

M3-R6-03: deployed the verified WASM to public
NEAR Testnet, with byte-for-byte verification via two RPCs.

- Contract: `nomogenesis-70e59593a3.testnet`
- Deployment transaction: `49NZ9qDKmfy42K9A7UKQDrDbQ9FWETFhijWQaUvcR5Qd`
- WASM SHA-256: `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`

M3-R6-04: three public Testnet transactions verified
case creation, buyer funding and worker acceptance.
The contract holds 30 UNIT (0.03 testNEAR) in rescue
escrow. Full public recovery and payout are pending.

M3-R6-05B: full public Testnet rescue lifecycle PASS.

- 3 funded buyers, 2 bonded providers, 3 workers.
- 17 signed public consortium transactions.
- Atomic award, 2 CSV proofs, terminal settlement.
- 114 UNIT economic conservation, 20 UNIT native payout.
- The earlier R6-04 escrow remains separately held.
- Independently rechecked through two public RPCs.

**Public verification without a wallet or private keys:**

```bash
node scripts/m3/r6_verify_public.cjs
```

Public transaction manifest:
[`docs/evidence/R6-05-public.json`](docs/evidence/R6-05-public.json)

Key transactions:
- [Atomic award](https://testnet.nearblocks.io/txns/67c1G5C49tKZPjjjehJ9xs1qa9GYtbrW7C2igMjzsybT)
- [Settlement](https://testnet.nearblocks.io/txns/7wFv9zQWkKcUMSjxMSCMDA4jQM9J9BkpZTryNa4ixgsA)
- [Native payout](https://testnet.nearblocks.io/txns/AiDr3cP7BWF38k49VsnrKULjcSNU2fXuSKgRHm9GDPWs)

Limitations: synthetic data, Testnet only, one demonstration
operator controlling the participating accounts; no independent
security audit, mainnet deployment or proven market advantage.

Next: M3-R6-06 submission demo and review.
