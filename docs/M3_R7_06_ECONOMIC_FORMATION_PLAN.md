# M3-R7-06 — Autonomous Economic Formation

Status: APPROVED DEVELOPMENT PLAN
Date: 2026-11-06
Base checkpoint: 3237164

## 1. Product Thesis

NOMOGENESIS should discover economically beneficial
agreements among self-interested autonomous agents.

The initial use case is collective recovery of
shared failed dependencies across funded jobs.

The product must not merely execute a coalition
that a central operator predetermined.

## 2. Falsifiable Research Hypotheses

H1: Independently parameterized buyer and provider
policies can form a voluntary recovery coalition
when no individual willing buyer can fully fund it.

H2: The engine can provide an independently
recomputable certificate explaining participant
decisions, feasibility, allocation and economics.

H3: Once authorized, the accepted formation
can be executed and reconciled on NEAR.

A strict subset is not currently executable
if additional eligible funded jobs remain enrolled
under the unchanged contract.

H4: Under explicitly stated assumptions,
some scenarios yield positive collective value
where individual recovery is infeasible.

H4 does not imply universal economic superiority.

## 3. Competitive Landscape

Known overlapping concepts and implementations:

- CoW Protocol: solver competition and batch auctions.
- NEAR Intents: conditional settlement infrastructure.
- NEAR AI Agent Market: agent service contracting.
- NEAR AI Swarms: collective purchasing and agent policies.
- Olas Mech Marketplace: agent-to-agent transactions.
- Virtuals / EconomyOS: autonomous economic participants.
- ETHOnline Coalition: pooled agent compute purchasing.
- Cooperative game theory: coalition feasibility and stability.
- Combinatorial auctions: joint allocation optimization.

Research target:
proof-carrying market formation connected to
authorized, bonded recovery execution.

No world-first or patentability claim is established.

## 4. Preserve the Existing System

Do not replace:
- M2 funded-task kernel and callback handling.
- M3 rescue contract and accounting invariants.
- Existing Testnet contract deployment.
- Two complete 17-transaction experiments.
- CSV and Merkle verification.
- Genesis Python/Rust verifiers.
- Historical transaction witnesses.
- R7 benchmark negative scenarios.
- Existing standalone jury demo.

Reuse the existing Genesis Engine rather than
copying its allocation and enumeration code.

## 5. Buyer Economic Model

Each buyer i declares:
- job_id
- funded spending authority cap_i
- incremental recovery value_i
- outside_option_i
- active status

A voluntary buyer accepts only when:

    value_i > outside_option_i

and cap_i > 0.

Policy-acceptable maximum:

    willingness_i =
        min(cap_i, value_i - outside_option_i)

A realized payment x_i must satisfy:

    0 <= x_i <= willingness_i

and:

    value_i - x_i >= outside_option_i

These are synthetic, declared preferences.
They do not prove truthful value revelation.

## 6. Provider Economic Model

Each provider declares:
- offer_id
- component index
- provider identity
- capacity slot
- requested fee
- cost floor
- bonded capacity
- readiness deadline
- availability

A provider accepts if fee >= cost floor.

The complete bonded pair must:
- Cover component 0 and component 1.
- Use distinct providers and capacity slots.
- Be available before the deadline.
- Hold sufficient independent collateral.
- Pass the existing Genesis eligibility rules.

Cheapest eligible complete pair wins under
the current bounded reference policy.

Future gates must model strategic bidding.

## 7. Coalition Formation

For every feasible coalition S:

    sum(payments_i) = provider pair price

    payment_i <= willingness_i

The existing deterministic capped-equal allocator
calculates actual payments.

For buyer i, declared utility margin is:

    buyer_margin_i =
      value_i - outside_option_i - payment_i

For supplier j:

    supplier_margin_j =
      fee_j - cost_floor_j

Modelled total incremental economic surplus:

    surplus(S) =
      sum(value_i - outside_option_i)
      - sum(provider cost floors)

Supplier fees are transfers within the model.
Do not subtract them twice.

The initial provisional policy maximizes declared
surplus among eligible feasible coalitions.

Tie-breaks:
1. Fewer participants.
2. Ascending job IDs.

Report minimal viable coalitions separately.
The maximum-surplus coalition need not be minimal.

A newly fundable agreement requires:
- At least two voluntary participants.
- A feasible complete provider pair.
- No individual willing buyer can fund the pair.

This is a bounded model criterion,
not proof of real-world profit creation.

## 8. Required Counterfactuals

Compare the same service and deadlines under:
- No recovery.
- Individual financing.
- Full standby reservation.
- Reactive spot procurement.
- Collective NOMOGENESIS formation.

Track:
- Feasibility.
- Buyer utility.
- Provider margin.
- Aggregate declared surplus.
- Payment and capital requirements.
- Completion deadline.
- Delivery and default assumptions.
- Cases where alternatives are superior.

Do not claim universal optimality.

## 9. Architecture

Buyer policy processes
        |
Provider policy processes
        |
Decision and authorization envelopes
        |
R7-06 Formation Coordinator
        |
Existing Genesis Engine
        |
Independent certificate verification
        |
Economic deviation and alternatives
        |
Authorized NEAR execution adapter
        |
M3 Rust/NEAR settlement kernel
        |
Public receipt and economic reconciliation

The first stage implements only the offline
policy-to-Genesis portion.

## 10. Development Gates

### R7-06A — Offline Policy Formation

Implement:
- Deterministic buyer refusal and acceptance.
- Provider minimum-acceptable-fee decisions.
- Strict schema and integer validation.
- Existing Genesis integration.
- Feasible coalition search.
- Exact payments and utility margins.
- Selected candidate and minimal coalitions.
- Independent certificate verification.
- Reproducible source hash.
- Adversarial and negative tests.

No wallet, LLM, API or NEAR transaction.

### R7-06B — Separate Autonomous Decision Processes

Implement:
- Independent local buyer/seller processes.
- Different economic policy parameters.
- Separate decision input files.
- Authenticated decision envelopes.
- Domain separation and nonce checks.
- Expiration and replay rejection.
- Auditable accept/refuse transcripts.

Independent processes are not independent owners.
Do not claim decentralized ownership.

### R7-06C — Competitive Clearing

Implement:
- Multiple competing offers.
- Cheapest eligible complete provider pair.
- Underbonded cheaper offer rejection.
- Deadline and capacity-slot conflicts.
- Same-provider and invalid-component rejection.
- Buyer opt-out and supplier refusal.
- Deterministic tie breaks.
- Differential tests with Genesis/Rust.

### R7-06D — Economic Counterfactuals

Implement:
- Parameter sensitivity.
- Reserve and spot comparisons.
- Locked capital and timing assumptions.
- Negative economic cases.
- Buyer exit and coalition deviations.
- Possible blocking coalitions.
- Seller and buyer welfare measurements.
- Explicit failure regions.

Feasibility is not coalition-proofness.
Do not invent empirical economic advantage.

### R7-06E — NEAR Authorization Integration

Investigate whether the actual authorized
participant set can be executed by current M3.

The deployed contract currently enrolls
all eligible accepted buyer jobs.

It cannot be claimed to select a strict subset
simply because Genesis computed that subset.

If changes are required:
- Define explicit sponsor authorization.
- Preserve original economic liabilities.
- Test Rust ownership and budget invariants.
- Test partial failure and replay.
- Execute Sandbox regression.
- Version any changed WASM.
- Obtain separate deployment approval.

Do not alter the deployed Testnet contract
during the offline formation gates.

### R7-06F — Formation Testnet Demonstration

Only after successful policy, provenance,
competition, authorization and Sandbox gates:

- Independently generated decision evidence.
- Accepted coalition and eligible offers.
- Signed NEAR transactions.
- Real atomic settlement.
- Objective proof validation.
- Exact receipt reconciliation.
- No automatic retransmission on uncertainty.
- Keyless public verification.

### R7-06G — Final Jury Evidence

Combine:
- Existing R6 Testnet proof.
- Existing R7-05C Testnet proof.
- Genesis certificates.
- Independent agent decision evidence.
- Economic counterfactuals.
- Genuine formation demonstration.
- Explicit limitations and adverse examples.

Then perform clean-checkout reproduction,
security review and submission preparation.

## 11. Negative Acceptance Matrix

Reject or classify:
- All buyers refuse.
- Insufficient voluntary funding.
- Individual funding already feasible.
- Payment above cap or economic willingness.
- Provider fee below cost floor.
- Underbonded provider.
- Same-provider pair.
- Conflicting capacity slots.
- Missing or late component.
- Duplicate buyer or offer IDs.
- Negative, float or Boolean money values.
- Overflow and malformed input.
- Forged certificate outcomes.
- Replayed signed decisions.
- Strategy deviations.
- Alternatives that outperform NOMOGENESIS.
- Off-chain subset incompatible with M3.
- Unknown or incomplete market evidence.

## 12. Engineering and Continuity Rules

One bounded gate at a time.

Each completed gate requires:
- Implementation and negative tests.
- Actual observed PASS logs.
- Updated `docs/HANDOFF.md`.
- Updated `docs/NOMOGENESIS_SESSION_STATE.md`.
- A dated `docs/worklog/` record.
- Commit and push.
- Exactly one next task.

CPU-only, no paid APIs, no mainnet funds.
Preserve prior verified code and evidence.
