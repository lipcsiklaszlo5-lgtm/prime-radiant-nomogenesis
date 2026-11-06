# NOMOGENESIS — Project State and New-Chat Handoff

Date: 2026-11-06
Last previously verified commit: `3237164`
Repository: `lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis`
Working branch: `feat/r7-genesis-certificate`

Git HEAD and actual tests are authoritative.
This document preserves the development history,
not an immutable representation of future progress.

## Mission

NOMOGENESIS aims to create an autonomous,
proof-carrying economic formation mechanism.

Independent, self-interested agents should discover
mutually beneficial transactions that individual
participants could not finance independently.

The system must explain:
- Who voluntarily joined or refused.
- Which providers offered viable services.
- Which coalitions were economically feasible.
- What each participant pays and receives.
- Why alternatives succeeded or failed.
- Whether the authorized transaction was actually executed.

The missing innovation is economic FORMATION,
not generic escrow or a static coalition list.

## M2 — Preserved Economic Kernel

Existing Rust/NEAR functionality includes:
- Funded tasks and escrow.
- Claimable liability accounting.
- Provider capacity exclusivity.
- Merkle verification.
- Native payout with callback recovery.
- Storage and capital auditing.
- Adversarial financial invariants.

Do not rewrite or delete this kernel.

## M3 — Preserved Rescue Market

Implemented:
- Funded buyer mandates and worker rewards.
- Two complementary recovery components.
- Bonded provider offers.
- Deterministic provider-pair selection.
- Atomic award and shared capacity locks.
- Capped-equal sponsor allocation.
- Authenticated component payloads.
- Worker result validation.
- Terminal settlement and refunds.
- Native withdrawal and failure handling.

M3 supports at most six sponsoring jobs
and six offers in the bounded reference model.

Primary specification:
`docs/M3_RESCUE_MARKET_SPEC.md`

## R6 — First Complete Public Testnet Lifecycle

Deployed NEAR Testnet contract:
`nomogenesis-70e59593a3.testnet`

Deployment transaction:
`49NZ9qDKmfy42K9A7UKQDrDbQ9FWETFhijWQaUvcR5Qd`

Recorded result:
- 17 confirmed signed public transactions.
- Three funded buyers.
- Two bonded providers.
- Three completed workers.
- Two authenticated CSV components.
- Atomic award and settlement.
- 114 UNIT economic principal.
- 20 UNIT native withdrawal.
- Transfer and callback verified.

Public manifest:
`docs/evidence/R6-05-public.json`

Read-only verifier:
`node scripts/m3/r6_verify_public.cjs`

## R7 — Genesis Certificate V1

Implemented:
- Bounded coalition enumeration.
- Maximum six buyers, up to 63 subsets.
- Cheapest eligible complete provider pair.
- Inclusion-minimal feasible coalitions.
- Deterministic capped-equal allocation.
- Canonical SHA-256 certificate.
- Independent Python recomputation.
- Independent Rust certificate verification.
- Cross-language allocation tests.
- Historical public Testnet replay.

Important sources:
- `scripts/m3/r7_genesis.py`
- `scripts/m3/r7_genesis_verify.py`
- `scripts/m3/r7_genesis_schema.py`
- `tests/r7_genesis_certificate.rs`
- `scripts/m3/r7_public_replay.py`
- `docs/M3_R7_GENESIS_CERTIFICATE_SPEC.md`

The Genesis Certificate is OFF-CHAIN.
It is not a SNARK or an authenticated complete-market
Merkle state proof.

## R7-05C — Second Complete Testnet Lifecycle

Recorded result:
- 17 confirmed signed transactions.
- Buyer caps: 7 + 7 + 7 UNIT.
- Two provider fees: 6 + 6 UNIT.
- Recovery price: 12 UNIT.
- Minimal coalitions: [4,5], [4,6], [5,6].
- Actual on-chain allocation: 4 + 4 + 4 UNIT.
- Two authenticated component proofs.
- Three completed workers.
- Native 20 UNIT payout and callback verified.

New economic principal: 120 UNIT.

Final contract accounting:
- Rescue escrow: 30 UNIT.
- Claimables: 194 UNIT.
- Pending payout: zero.

Evidence:
`docs/evidence/R7-05C-public.json`

Certificate:
`docs/evidence/R7-05C-genesis-certificate.json`

Independent keyless verifier:
`node scripts/m3/r7_05c_public_verify.cjs`

Eight earlier SDK nonce-retry hashes are INCONCLUSIVE.
This does not invalidate the 17 confirmed transactions,
but does not prove the earlier attempts never executed.

The deployed contract enrolled ALL eligible accepted
buyers. It did not select a two-buyer minimal coalition.

## R7-01 — Economic Benchmark

Existing deterministic benchmark:
`scripts/m3/r7_emergence_benchmark.cjs`

It compares:
- Joint rescue.
- Individual funding.
- Full standby reservation.
- Reactive spot procurement.

The benchmark contains positive and negative examples.
Standby and spot can outperform NOMOGENESIS.

These are synthetic comparisons, not empirical ROI.

## R7-05D/E — Jury Interface

Existing standalone interface:
`demo/nomogenesis_jury_demo.html`

Preserved functionality:
- White interactive interface.
- Editable buyer limits and recovery price.
- Capped-equal allocation.
- Coalition enumeration.
- 5+5+5 historical scenario.
- 7+7+7 historical scenario.
- Dynamic coalition metrics.
- Links to real Testnet transactions.

The sliders are local simulations.
They do not submit blockchain transactions.

Previous observed checks include:
- 12/12 UI regression tests.
- 28 Python Genesis tests.
- 5/5 Rust Genesis certificate tests.
- 17/17 R7-05C public transaction verification.
- Offline Genesis artifact integrity PASS.

These are historical observations,
not new test results for the current checkpoint.

## R7-06B — Local Signed Agent Decisions

Checkpoint based on `4573883`.

- Seven separately executed Node.js agent processes.
- Three buyers and four competing supplier policies.
- One buyer voluntarily refused on outside-option grounds.
- One supplier refused a fee below its cost floor.
- Fresh ephemeral Ed25519 signing key per process.
- Signed declarations and recomputed economic verdicts.
- Domain-separated signatures, session expiry, nonces.
- Duplicate actor and in-session replay rejection.
- Reconstructed market fed to existing R7-06A Python engine.
- Buyer coalition [1,2], providers [3,2], price 11 UNIT.
- Buyer cost allocation [6,5], synthetic declared values.
- Archived signed report independently recomputed.
- No NEAR transactions or contract changes.
- All processes remain controlled by one operator.
- Public keys are NOT bound to independent NEAR identities.
- Historical timestamps are operator-recorded.
- No persistent cross-session replay ledger.
- No deployed M3 subset selection.

Evidence:
`docs/evidence/R7-06B-synthetic-signed-decisions.json`

Reproduction:
`node scripts/m3/r7_06_swarm.test.cjs`

Archived signature and formation verification:
`node scripts/m3/r7_06_swarm.cjs --verify docs/evidence/R7-06B-synthetic-signed-decisions.json`

Next bounded ticket:
**R7-06C — adversarial competitive clearing and
independently verified seller selection.**

## R7-06C/00 — Competitive Clearing Audit

Base: `712e4ad`.

- Existing R7-06B signed market independently verified.
- Four complete supplier pairs evaluated.
- Two economically and technically admissible.
- Cheapest nominal 9 UNIT pair rejected:
  supplier Delta refuses below declared cost floor.
- Valid 11 UNIT Gamma+Beta pair wins over 12 UNIT.
- Exact pair eligibility and rejection reasons retained.
- Buyer coalition [1,2] with 6+5 UNIT allocation.
- Provider bond, deadline, same-provider and
  capacity-slot adversarial tests.
- Six-offer bounded search, price ties and overflow.
- Falsifiable negative cases and deterministic sweep.
- Result independently reproduced from source report.

Evidence:
`docs/evidence/R7-06C-competition-audit.json`

Source:
`docs/evidence/R7-06B-synthetic-signed-decisions.json`

Verify:
`python3 -B scripts/m3/r7_06c_competition.py --verify`

No new on-chain award occurred.
This is synthetic, declared-cost competitive clearing.
No trusted real-world agent identity is established.
No private-market truthfulness or coalition stability
is proven.

Next: R7-06D economic counterfactuals, deviations,
and conditions where NOMOGENESIS loses.

## R7-06D/00 — Economic Counterfactuals and Exits

Base: `0179cbe`.

- Reused verified R7-06B signed decision source.
- Independently checked R7-06C supplier competition.
- Same beneficiary set and declared recovery benefits.
- NOMOGENESIS, individual, standby and spot comparisons.
- Separate supplier fee, real-resource-cost assumption
  and hypothetical capital charge.
- Positive and negative synthetic market scenarios.
- Eleven-point standby price/cost sensitivity.
- Buyer exit and residual funding examination.
- Explicit non-excludable shared-recovery assumption.
- Three-buyer synthetic free-riding counterexample.
- Evidence independently reconstructed and hashed.

Evidence:
`docs/evidence/R7-06D-economic-counterfactuals.json`

Verify:
`python3 -B scripts/m3/r7_06d_economics.py --verify`

CRITICAL FINDING:
A three-buyer shared-dependency recovery may
create an incentive to exit if the nonpaying
buyer still benefits while the other two fund
recovery. Individual rationality does NOT imply
free-rider resistance or coalition stability.

This depends on an explicit non-excludability
assumption and is NOT proven contract behavior.

No market demand, empirical welfare or real
revenue has been established. Standby and spot
counterparty risks remain incompletely priced.
No additional NEAR transaction occurred.

Next bounded gate:
R7-06E — contract compatibility, explicit sponsor
authorization and protection against free-riding.

## R7-06E/00 — Contract Authorization Boundary

Base: `96e96dc`.

- Read-only Rust contract inspection.
- M3 V1 awards all eligible Accepted/Open mandates.
- Existing API has no caller-supplied sponsor subset.
- Buyer mandate revocation exists, but is a separate
  authorized on-chain action.
- Three-funded-buyer outcome differs from the
  offline two-buyer formation.
- Conditional two-buyer compatibility demonstrated.
- Open refused supplier offer can change winner.
- On-chain cap may exceed economic willingness.
- Worker completion does not check sponsor allocation.
- Non-excludable real-world spillovers remain unsolved.
- All modeled on-chain snapshots are hypothetical.
- No new Testnet transactions or deployed code changes.

Evidence:
`docs/evidence/R7-06E-authorization-boundary.json`

Normative next design:
`docs/M3_R7_06E_AUTHORIZATION_SPEC.md`

Next: R7-06E/01 pure Rust subset-aware authorization
and settlement preflight with negative tests.

## R7-06E/01 — Rust Subset Authorization Preflight

Starting checkpoint: `a4551a6`.

- New isolated pure Rust model:
  `src/r7_06e_subset_model.rs`.
- Tests:
  `tests/r7_06e_subset_preflight.rs`.
- Reuses M3 pure Rust capped-equal allocation.
- Enforces exact modeled buyer payment approvals.
- Checks case/chain/contract scope and nonce reuse.
- Checks provider bonds and modelled liability conservation.
- Handles excluded sponsor and excess bond refunds.
- Keeps existing contract ABI and deployment unchanged.
- No cryptographic NEAR authorization yet.
- No proof of complete chain state or worker exclusion.
- No proof of coalition stability or incentive compatibility.

Worklog:
`docs/worklog/M3-R7-06E-01-rust-preflight.md`

Next: R7-06E/02 versioned contract authorization
and Sandbox atomicity design.

## R7-06E/02 — Authorization State-Machine Model

Starting checkpoint: `ca9e354`.

- Separate pure Rust registration/revocation/award model.
- Modelled caller identity, not actual NEAR authentication.
- Domain-separated plan hash binds selected jobs,
  provider pair, contract, case and recovery price.
- Consent nonces cannot be reused after revocation.
- Failed awards preserve modelled state unchanged.
- Exact buyer approvals and refund conservation
  reuse R7-06E/01 and original M3 allocator.
- Existing deployed contract and ABI untouched.
- Real NEAR state persistence and Sandbox atomicity
  have NOT been tested.

Sources:
`src/r7_06e_auth_state.rs`
`tests/r7_06e_auth_state.rs`

Design:
`docs/M3_R7_06E_ONCHAIN_DESIGN.md`

Next: R7-06E/03 versioned NEAR adapter and
actual Sandbox authorization/rollback tests.

## What Is Still Missing

1. Independently deciding buyer/provider agents.
2. Authenticated autonomous decision provenance.
3. Genuine multi-offer competitive market formation.
4. Agent refusal and voluntary outside-option choices.
5. Economic utility and fair counterfactual evaluation.
6. Coalition stability and adversarial incentive analysis.
7. On-chain execution of a selected strict subset.
8. Real independent operators or customers.
9. Demonstrated real-world economic advantage.
10. Production security review and mainnet readiness.

Do not claim these as already implemented.

## New R7-06 Development Program

Full specification:
`docs/M3_R7_06_ECONOMIC_FORMATION_PLAN.md`

Stages:
- R7-06A: Offline deterministic policy formation.
- R7-06B: Separate autonomous decision processes.
- R7-06C: Competitive clearing and adversarial bids.
- R7-06D: Economic advantage and deviation research.
- R7-06E: Contract-compatible authorization.
- R7-06F: Optional new Testnet demonstration.
- R7-06G: Independent jury evidence and submission.

Current ticket: R7-06A.

After successful R7-06A tests, next ticket:
R7-06B — authenticated, role-separated decision processes.

## Engineering Constraints

- CPU-only reference implementation.
- No paid APIs or required LLM inference.
- Preserve Rust, NEAR and existing evidence.
- No mainnet spending or token issuance.
- No unapproved Testnet redeployment.
- No private keys or signer journals in Git.
- No automatic retransmission of uncertain TX.
- No unsupported economic superiority claim.
- No fake decentralization or agent independence.
- One bounded checkpoint at a time.
- Tests before commit.
- Always preserve negative cases.

## Resume Commands

```bash
git branch --show-current
git log -1 --oneline
git status -sb
python3 -B -m unittest discover -s scripts/m3 -p 'test_r7_*.py' -q
node --test scripts/m3/r7_emergence_benchmark.test.cjs
cargo test --locked --test r7_genesis_certificate
python3 -B scripts/m3/r7_public_replay.py --offline
```

Network-dependent Testnet verifiers should be run
separately from offline development.

Before modifying files, read:
- `AGENTS.md`
- This document.
- `docs/HANDOFF.md`
- `docs/M3_NORTH_STAR.md`
- `docs/M3_R7_NORTH_STAR.md`
- `docs/M3_R7_06_ECONOMIC_FORMATION_PLAN.md`
- Latest `docs/worklog/M3-R7-*.md`

Existing untracked local files must not be
blindly deleted or overwritten.

## New-Chat Bootstrap Message

Continue NOMOGENESIS from the current GitHub HEAD
on branch `feat/r7-genesis-certificate`.

Read `AGENTS.md`,
`docs/NOMOGENESIS_SESSION_STATE.md`,
`docs/M3_R7_06_ECONOMIC_FORMATION_PLAN.md`
and `docs/HANDOFF.md` directly from the repository.

Preserve existing M2/M3/R6/R7 code,
both complete Testnet experiments and all evidence.

Do not confuse offline coalition formation
with actual on-chain subset selection.

Follow the next unverified bounded ticket.
Use one guarded Codespaces command at a time.
Verify the actual test log before claiming PASS.
