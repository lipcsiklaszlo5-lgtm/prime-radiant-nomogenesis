# R7-06E — Sponsor Authorization and Contract Compatibility

Status: evidence-backed design, NOT deployed.
Base: 96e96dc

## Existing M3 Contract

`award_rescue_bundle(case_id)` selects all currently
eligible Accepted jobs with Open funded mandates.

The caller supplies only the case ID.
The contract does not receive a selected coalition.

`revoke_open_rescue_mandate(job_id)` allows
the actual buyer to remove an Open mandate
before award close. This requires a separate
authorized NEAR transaction.

A worker can complete an Accepted job after
successful case settlement without requiring
membership in the winning bundle allocations.

These observations are enforced by source
inspection in the R7-06E auditor.

## Conditional Compatibility

If only the chosen buyers are funded and accepted,
and only voluntary provider offers are posted,
the existing contract can potentially produce
the same pair and allocation.

This is NOT sufficient evidence of executable
authorization. Source state, deadlines, account
identity, offered collateral and attached deposits
must all be verified on-chain.

If an additional funded Accepted buyer remains,
the existing award may include that buyer regardless
of the off-chain coalition selection.

Buyer-owned revocation may make a subset possible,
but creates ordering and permissionless-award races.

An off-chain provider's refusal cannot undo a
separately posted Open on-chain provider offer.

The on-chain funding cap may exceed the buyer's
private willingness limit. Without an on-chain
commitment, a different allocation can overcharge
relative to the declared economic preference.

## Critical Free-Rider Boundary

Excluding a mandate does NOT automatically exclude
the worker's job from successful common recovery.

Physical or informational spillovers may be
non-excludable even with redesigned on-chain
access checks.

The product must distinguish:
1. Financial participation.
2. Authorization to access digital proofs/results.
3. Real-world benefits that cannot be excluded.

No smart contract can guarantee economic exclusion
of genuinely non-excludable shared physical benefits.

## Proposed Versioned Authorization Mechanism

A future compatible contract variant should support:

- Explicit buyer-authorized job IDs and allocations.
- Domain-separated consent bound to NEAR buyer identity.
- Case ID, award-window expiration, nonce and chain context.
- Payment limits no greater than actual funded authority.
- On-chain verification before atomic award.
- Replay and cancellation protection.
- Deterministic provider-pair selection.
- Correct exclusion/refunds for nonselected mandates.
- Worker reward eligibility defined for excluded jobs.
- Exact M2/M3 escrow and storage conservation.
- Fail-closed behavior if a selected buyer withdraws.

No new WASM deployment until the pure Rust model,
Sandbox permission checks, adversarial settlement
regressions and an independent audit pass.

## Next Ticket

R7-06E/01: pure Rust, subset-aware authorization
and settlement preflight with negative tests.
No changes to deployed Testnet contract.
