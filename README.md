# prime-radiant-nomogenesis

**Aktuális belépő:** [állapot és következő ticket](docs/CURRENT_STATE.md) · [review](docs/REVIEW_2026-11-06.md) · [handoff](docs/HANDOFF.md). Ellenőrizd a Git HEAD-et.

## NOMOGENESIS — An economic recovery primitive on NEAR

**One dependency fails. Several funded jobs are blocked.
No individual buyer wants to pay for the entire recovery.**

NOMOGENESIS lets buyers pool bounded commitments,
purchase recovery from bonded providers, verify delivery,
and settle the resulting obligations on NEAR.

### The demonstrated innovation

The Genesis Certificate exhaustively enumerates feasible
buyer coalitions (up to six buyers), identifies
inclusion-minimal coalitions, and independently verifies
provider pairing and capped-equal allocations.

The deployed NEAR contract implements the bonded
recovery and economic settlement lifecycle.
Genesis coalition enumeration is currently **off-chain**;
the contract does not select a minimal coalition on-chain.

### Two complete public Testnet experiments

| | Testnet 01 | Testnet 02 |
|---|---|---|
| Buyer caps | 5 + 5 + 5 UNIT | 7 + 7 + 7 UNIT |
| Recovery price | 12 UNIT | 12 UNIT |
| Minimal feasible coalitions | 1 | 3 |
| On-chain allocation | 4 + 4 + 4 | 4 + 4 + 4 |
| Signed transactions | 17 | 17 |
| Native payout verified | Yes | Yes |

**Try the interactive jury demo:**

`demo/nomogenesis_jury_demo.html`

**Reproduce the public evidence without a wallet:**

```bash
python3 -B scripts/m3/r7_public_replay.py
node scripts/m3/r7_05c_public_verify.cjs
```

The first command reconstructs historical Genesis evidence.
The second verifies the full second Testnet lifecycle,
including 17 signed transactions, CSV proofs, worker results,
contract accounting and native payout receipts.

**Public contract:** `nomogenesis-70e59593a3.testnet`

**Hackathon contribution:** the bounded Genesis Certificate,
independent Python/Rust verification, public Testnet replay,
second market experiment and interactive coalition explorer
were developed as part of the November 2026 work.
The underlying rescue contract has earlier development history.

**Limitations:** synthetic Testnet funds; one operator
controlled the demonstration accounts; no local Merkle
state proof or independent security audit; eight earlier
SDK retry hashes remain inconclusive. No production
readiness or world-first claim is made.

---

Nomogenesis is a NEAR rescue market for agent economies.

When one failed dependency blocks several independently funded jobs, affected buyers can combine bounded rescue mandates and atomically purchase recovery work that none would fund alone.

## Current product direction

**Historical R7-06 development plan:**
[Project state and new-chat handoff](docs/NOMOGENESIS_SESSION_STATE.md) ·
[Autonomous formation plan](docs/M3_R7_06_ECONOMIC_FORMATION_PLAN.md).

The formation policy engine is an experimental offline layer.
It is not part of the deployed NEAR Testnet contract.


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
escrow. This historical checkpoint was subsequently
superseded by the completed R6-05B and R7-05C lifecycles.

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

Current continuation: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md).


## Genesis Proof — reproducible public evidence

Run the complete read-only Genesis reconstruction:

```bash
python3 -B scripts/m3/r7_public_replay.py
```

Offline artifact integrity only:

```bash
python3 -B scripts/m3/r7_public_replay.py --offline
```

The Genesis Certificate reconstructs the recorded
three-buyer minimal coalition and the 4+4+4 UNIT
award. Python/Rust allocation parity is checked
against 185 deterministic vectors.

The jury demo below also displays every coalition
and its funding gap. Adjustable inputs are a local
simulation, not new blockchain transactions.

The archived historical state comes from an RPC
provider, not a locally validated Merkle proof.
Demonstration actors were controlled by one operator.

## Second public Testnet lifecycle

The second full NEAR Testnet experiment includes
17 signed transactions, three buyers with 7 UNIT
caps, and a 12 UNIT recovery price.

The Genesis Certificate identifies three alternative
minimal feasible two-buyer coalitions.

The deployed contract uses all three eligible
buyers, allocating 4+4+4 UNIT on-chain.

Public verification:

```bash
node scripts/m3/r7_05c_public_verify.cjs
```

The verifier checks signed transaction arguments,
recomputes the Genesis Certificate, validates
the two CSV components and worker results, and
rechecks final contract state and native payout.

Evidence:
- `docs/evidence/R7-05C-public.json`
- `docs/evidence/R7-05C-genesis-certificate.json`

No private keys or Testnet funds are needed.
Historical RPC data is externally supplied.
Eight previous SDK retry hashes remain inconclusive.

## Interactive jury demo

Open `demo/nomogenesis_jury_demo.html` in a browser.

White, standalone interface with a local funding simulator
and 17 linked public Testnet transactions.

Rebuild:

```bash
node scripts/m3/r6_build_demo.cjs
```

Test:

```bash
node --test scripts/m3/r6_demo.test.cjs
```

The simulator is illustrative, not a live wallet interface.
