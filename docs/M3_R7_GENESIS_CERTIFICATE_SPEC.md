# M3-R7-02 — NOMOGENESIS Genesis Certificate

Status: APPROVED RESEARCH AND DEVELOPMENT DIRECTION
Decision: 2026-11-05
Base: feat/r7-economic-emergence

## 1. Product thesis

NOMOGENESIS is a proposed economic coordination
infrastructure for autonomous agents.

Its first market enables independently financed
jobs to collectively purchase bonded recovery
of a failed shared dependency.

The next innovation target is a reproducible
certificate of coalition feasibility and necessity.

Proposed name:
Proof-Carrying Market Formation.

This is a product-level mechanism hypothesis,
NOT a proven world-first mathematical invention.

## 2. Prior-art findings

The following existing systems overlap:

1. NEAR AI Swarms:
   group-buying agents, auctions, shared payments.

2. NEAR AI Agent Market:
   agent bids, task escrow, delivery verification.

3. NEAR Intents:
   atomic settlement of compatible signed intents.

4. Coalition / ETHOnline 2026:
   agent funds pooled for shared compute.

5. CoW Protocol:
   combinatorial auction and solver competition.

6. Cooperative game theory:
   minimal winning coalitions, stability and core.

7. Existing auction verification research:
   cryptographic commitments and independently
   recomputable auction outcomes.

No exact matching NEAR implementation was found
in the public research completed on 2026-11-05.

Absence from search results is NOT proof of
worldwide uniqueness, patentability or freedom
to operate.

Sources:

https://nearhackathon.com/
https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/05-swarms.md
https://near.ai/blog/introducing-near-ai-agent-market
https://github.com/near/intents
https://ethglobal.com/showcase/coalition-9d4ok
https://docs.cow.fi/cow-protocol/concepts/introduction/fair-combinatorial-auction
https://eprint.iacr.org/2017/1167.pdf
https://www.nature.com/articles/s41598-026-58903-2

## 3. Exact mathematical model

Let B be a set of 1 to 6 buyer mandates.

Each buyer i has:
- unique numeric job ID;
- nonnegative funded rescue cap c_i.

Exactly two dependency components are required.

There are at most 6 open provider offers.
Each offer contains:
- unique numeric offer ID;
- dependency component ID;
- provider and capacity-slot identity;
- positive fee;
- independently funded bond;
- recovery readiness deadline;
- capacity availability.

A complete provider pair is admissible only if:
- both required components are present;
- providers and capacity slots are distinct;
- both capacity slots are free;
- both providers can deliver before the deadline;
- each provider bond covers the COMPLETE pair price;
- all eligibility rules are satisfied.

The lowest-priced admissible complete pair wins.
Ties use ascending numeric offer IDs.

Let Q be the winning pair price.

For every nonempty buyer coalition S:

F(S) = 1 iff an admissible complete pair exists
and the sum of buyer caps in S is at least Q.

Otherwise F(S) = 0.

When feasible, use deterministic capped-equal
water filling and ascending job-ID remainder ties.

The allocation must satisfy:

sum(x_i for i in S) = Q

0 <= x_i <= c_i

## 4. Genesis condition

A coalition S is inclusion-minimal when:

F(S) = 1

AND

for every proper subset T of S:

F(T) = 0

Enumerate all nonempty subsets.

With 6 buyers, there are at most 63.

Report:
- all feasible and infeasible coalitions;
- all inclusion-minimal winning coalitions;
- minimum coalition cardinality;
- individual allocations;
- cheapest complete offer pair;
- rejected coalitions and reasons;
- pivotal/swing participants.

Minimal-by-inclusion does NOT imply cheapest
coalition, core stability or incentive compatibility.

## 5. Genesis Certificate V1

Create canonical, deterministic JSON containing:
- protocol version and domain identifier;
- normalized and bounded input snapshot;
- SHA-256 input digest;
- complete enumeration of coalition outcomes;
- selected provider pair and total price;
- deterministic buyer allocation;
- all minimal viable coalitions;
- reported minimum cardinality;
- SHA-256 certificate digest.

An independent verifier MUST reconstruct all
results from the supplied inputs and reject any
inconsistency.

The verifier must not simply trust a Boolean PASS.

A hash without an independently authenticated
reference DOES NOT prove that the source input
matches actual NEAR state.

V1 is an exhaustive recomputation certificate,
not a SNARK, digital signature or formal proof
of complete real-world market knowledge.

## 6. Implementation stages

R7-02A:
- Pure Node.js reference engine.
- Exact bounded coalition enumeration.
- Provider pair admissibility.
- Capped-equal allocations.
- Canonical JSON certificate.
- Independent recomputation verifier.
- Negative and adversarial tests.
- No API, GPU, wallet or chain writes.

R7-02B:
- Capture a public NEAR case and offer snapshot.
- Establish the correct block height and input set.
- Identify all relevant funded mandates.
- Verify eligibility against contract state.
- Reconcile winner and allocations with the
  actual on-chain award.
- Bind the certificate to authoritative receipts.
- No live-chain certificate claim before this passes.

R7-02C:
- Rust independent verifier.
- Differential tests against JavaScript and M3.
- Matching numeric tie-breaking and integer math.
- Cross-language fixtures and property tests.

R7-03:
- Autonomous buyer and provider decision policies.
- Role-separated signing.
- Recorded independent economic decisions.

R7-04:
- Coalition stability and deviation tests.
- Explicitly model outside options and valuations.
- Test collusion, sybil assumptions and defaults.
- Do not imply a Shapley value is always stable.

R7-05:
- Integrate the Genesis visualization.
- Run clean-checkout reproducibility.
- Complete NEAR hackathon submission.

## 7. Required tests

T01: [5,5,5] caps, price 12.
     Only full three-buyer coalition succeeds.
     Allocation exactly [4,4,4].

T02: All seven nonempty subsets enumerated.

T03: Multiple inclusion-minimal coalitions.

T04: A single independently capable buyer.

T05: Insufficient combined caps.

T06: Underbonded offer pair rejected.

T07: Same provider or occupied slot rejected.

T08: Late delivery or missing component rejected.

T09: Cheapest valid offer pair selected.

T10: Duplicate IDs and invalid amounts rejected.

T11: Reordered inputs give identical certificate.

T12: Modified input or forged outcome rejected.

T13: Existing R7 benchmark remains operational.

T14: No M3 contract or R6 evidence regression.

## 8. Explicit threat model

Out of scope or unproven in V1:
- unknown or omitted supplier offers;
- unverified input completeness;
- sybil identities;
- strategic false valuations;
- provider collusion;
- general coalition-game optimality;
- proof of external economic demand;
- universal cost superiority;
- production security;
- cross-chain settlement;
- on-chain Genesis Certificate anchoring.

No fake claims of formal verification,
decentralized participants or mainnet readiness.

## 9. NEAR and jury alignment

Primary: AI Swarms.
Secondary: Agent Economy, Open Innovation.

The intended difference from NEAR Intents:

Intents executes compatible signed outcomes.
Genesis identifies and certifies a bounded
coalition that can collectively finance an outcome.

This is complementary architectural positioning,
not an already implemented Intents integration.

Jury narrative:
1. A shared dependency fails.
2. Individual recovery is impossible.
3. The engine enumerates every coalition.
4. A minimal feasible coalition emerges.
5. The certificate explains why smaller sets fail.
6. A bonded pair receives an atomic award.
7. Objective delivery and settlement are verified.

The historical R6 Testnet evidence remains separate
until R7-02B reconciliation establishes linkage.

## 10. Competition objective

Internal readiness ambition: approximately 98/100.

Evidence, not marketing, drives the score.

The score is not an official judge prediction
or a winning probability.

No new token or general marketplace rewrite.
Preserve the established Rust economic kernel.

## 11. Next single action

R7-02A:
Implement the exact finite Genesis solver,
JSON certificate and independent verifier.

Do not mutate the NEAR smart contract.
Do not claim chain binding until R7-02B.
