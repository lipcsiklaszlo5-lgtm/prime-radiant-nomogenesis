# PRIME RADIANT — PROJECT MASTER

> Történeti M3-termékterv. A jelenlegi kódállapot, korlátok és következő ticket: `docs/CURRENT_STATE.md`.

**Product:** Nomogenesis — The Rescue Market for Agent Economies
**Version:** M3-R0, 2026-11-04
**Status:** GO for bounded M3 implementation; NO-GO for submission or production funds

## Mission

Nomogenesis creates a jointly funded recovery transaction when a shared dependency blocks separately owned jobs and no single buyer will purchase the complete repair alone.

The MVP combines pre-funded rescue mandates, complementary recovery offers, objective digital proofs and fully funded settlement on NEAR.

## R7 strategic direction — 2026-11-05

The existing verified M3 rescue market is the first bounded
instance of the proposed economic coordination platform.

The next objective is to demonstrate economic emergence
against fair counterfactual baselines, then independent
agent decisions, competitive clearing and adversarial
behavior.

Target: 98/100 internal evidence-readiness, NOT a
prediction of any official hackathon score.

The R7 strategy is defined in:
`docs/M3_R7_NORTH_STAR.md`.

The M3 on-chain contract remains feature-frozen.

## Genesis Certificate direction

The exact R7-02 plan and prior-art boundaries:
`docs/M3_R7_GENESIS_CERTIFICATE_SPEC.md`.

The proposed innovation is an exhaustive,
reproducible certificate for minimal fundable
coalitions in a bounded NEAR recovery market.

This is not a claim of worldwide novelty.
No certificate-to-chain binding is yet proven.

## Authoritative documents

1. docs/M3_NORTH_STAR.md — product direction and claim boundary.
2. docs/M3_RESCUE_MARKET_SPEC.md — executable financial and domain rules.
3. docs/STATUS.md — verified implementation evidence.
4. docs/DECISIONS.md — append-only architectural decisions.
5. docs/HANDOFF.md and the newest M3 worklog — continuation point.

Git and executed tests remain the source of truth for implementation state.

## Product boundary

A rescue mandate is funded buyer authority, not guaranteed standby capacity. A binding RecoveryRight exists only after atomic bundle award.

The MVP has at most six sponsoring jobs, two required components and six offers. It uses full provider bonds and does not reuse collateral.

## Architecture

On-chain Rust handles:

- funded rescue jobs and mandates;
- bounded offer-pair clearing;
- buyer allocations and provider bonds;
- M2/M3 cross-slot exclusion;
- Merkle proof verification;
- settlement and withdrawal backing.

Off-chain signer processes handle:

- buyer, provider, worker and keeper policies;
- deterministic fixtures;
- actual data delivery;
- independent ledger reconstruction;
- the demonstration interface.

Off-chain calculations never create on-chain funds or authority.

## Demonstration

Three buyers fund 25-unit worker rewards and rescue caps of 5. Two missing dependencies cost 6 each. No individual cap buys the 12-unit bundle; three mandates allocate 4 each.

Two providers each post a 12-unit bond, restore actual data and allow three jobs to finish. A separate partial-failure run proves conservative settlement.

All values are test units, not prices, revenue or profit.

## Existing foundation

The feat/m2-escrow branch preserves the M2 task, escrow, collateral, slot, proof, settlement, withdrawal and callback kernel.

Recorded evidence reports 108 Rust tests and 11 default Sandbox suites. M3-R0 does not rerun or upgrade those claims.

The untracked sandbox/real_low_margin_audit.cjs file remains preserved until separately classified.

## Non-goals

No token, lending, mainnet funds, paid API, general oracle, arbitrary DAG optimizer, shared-collateral leverage, physical capacity attestation or generic marketplace framework.

No universal cost advantage, formal security, adoption or prize outcome is claimed.

## Implementation order

1. M3-R1 pure Rust allocation, clearing and settlement model.
2. M3-R2 funded jobs, mandates and rescue liability.
3. M3-R3 atomic clearing and cross-slot guards.
4. M3-R4 proof and terminal settlement.
5. M3-R5 signer processes and actual data workflow.
6. M3-R6 interface, testnet evidence and clean reproduction.

Submission, public deployment and irreversible external actions require explicit owner approval.
