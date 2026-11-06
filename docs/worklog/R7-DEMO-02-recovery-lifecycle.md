# R7-DEMO-02 — Local failure and funded recovery lifecycle

Date: 2026-11-06. Branch: `feat/r7-demo-02-recovery`.
Base: `1103b7c56db4c83afcce2416be2ca9004b3c45e0`.
Resulting commit: `git log -1` on this branch.

## What ran

A local HTTP source serves two CSV components, then returns HTTP 503.
Three separately running buyer processes assess a shared rescue.
Two authorize exactly 6 UNIT each; the third refuses. The V2 contract
accepts the two funded consents and atomically awards both provider
offers. The refusing buyer's 7 UNIT rescue principal becomes claimable.

Two selected providers submit CSV component payloads against the
case's Merkle commitments. A forged provider and a structurally valid
but altered payload are rejected without observed persistent mutation.
The latter fails with `invalid component Merkle proof`. The selected
workers compute their results from the payloads read back from the
contract, not from the unavailable HTTP endpoint. One incorrect worker
result is rejected, then both selected jobs complete. The excluded job
expires and its remaining worker reward returns to its buyer.

## Observed verification

- `node --check sandbox/r7_v2_autonomous_buyers.cjs`: exit 0.
- `node --test scripts/m3/r5_data_envelope.test.cjs`:
  5 passed, 0 failed.
- Local NEAR Sandbox lifecycle: exit 0, final
  `R7-DEMO-02 RECOVERY LIFECYCLE: PASS`.
- Simulated chain time from observed HTTP 503 to both accepted
  provider proofs: 286 seconds. This is accelerated Sandbox chain
  time, not a wall-clock recovery SLA.
- Liabilities in UNIT:
  `48 = 39 + 9 = 3 + 45 = 1 + 47 = 0 + 48`.
  Providers have 18 UNIT claimable each; two workers receive 1 UNIT
  each. The refusing buyer receives 8 UNIT after expiry.
- V2 compatible WASM SHA-256:
  `2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e`.
- Full Codespaces Sandbox log:
  `/workspaces/nomogenesis-r7-recovery-merkle-1103b7c.log`;
  SHA-256:
  `db6b29ddac81e3d2ee0a807170154cfc443148be41507f090b3b83d9aaa89e34`.

## Limits and next action

The HTTP 503 is a local controlled failure. The Sandbox root creates
and funds the accounts; real independent operators are not established.
The 286 seconds include accelerated blocks. Provider and worker
amounts are internal claimable credits, not proven native withdrawals.
No new public V2 Testnet transaction, consent storage refund,
non-excludable-benefit incentive solution or independent audit is
claimed. The demo has not been compared with fair economic baselines.

Next single ticket: `R7-REPO-01`. Reconcile the linear branch history,
make the runnable V2 demo the public repository entry point, add a
minimal clean-checkout gate, then plan a reviewed fast-forward of
`main`. Public V2 Testnet evidence follows as a separate gate.
