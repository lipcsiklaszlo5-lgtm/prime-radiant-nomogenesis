# NOMOGENESIS — M3 NORTH STAR

Status: APPROVED STRATEGIC DIRECTION
Decision date: 2026-11-03

## 1. NON-NEGOTIABLE GOAL

Build a NEAR Hackathon grand-prize-caliber economic
innovation with immediate investor-level WOW.

NOT a generic tool.
NOT a CI system.
NOT another workflow optimizer.
NOT merely escrow, insurance, or agent matchmaking.
NOT endless research and overtesting.

The goal is an asymmetric economic primitive
capable of creating a new market.

# NOMOGENESIS
## The Economic Continuity Protocol

"The market for guaranteed execution in an
autonomous economy."

The product enables autonomous economic actors
to purchase financially backed rights to
continued execution BEFORE counterparties fail.

Novelty, market demand and prize prospects
remain hypotheses until demonstrated.

## 2. THE THREE CORE INNOVATIONS

### M3/01 — RecoveryRight

A sellable conditional execution right.

Required fields:

- Buyer and provider
- Reserved execution capacity
- Activation trigger
- Validity window and deadline
- Financial collateral
- Option premium and execution reward
- Objective completion proof
- Settlement and expiration rules

The buyer purchases a right to replacement
execution, not merely insurance compensation.

### M3/02 — Dependency-Aware Economic Clearing

Create a clearing mechanism that analyzes
which obligations can activate simultaneously.

Financial collateral AND execution capacity
must both remain sufficient.

The engine must:

- Detect conflicting obligations
- Prevent double-selling of scarce capacity
- Identify mutually exclusive activation rights
- Calculate maximum concurrent liabilities
- Safely reuse collateral only where exclusion
  is enforceable
- Return explicit conflict witnesses
- Preserve storage and pending payout backing

The target is capital efficiency without
undercollateralization.

No statistical probability is sufficient
to prove hard solvency.

### M3/03 — Autonomous Recovery Market

Autonomous agents offer standby capacity.

A deterministic Rust clearing engine decides
which commitments are economically compatible.

NEAR provides:

- Financial commitments
- Capacity reservations
- Activation
- Objective proof verification
- Settlement and withdrawals

This is intended as a market infrastructure
primitive, not a subscription software tool.

## 3. MANDATORY HACKATHON WOW DEMO

A judge must be able to:

1. See an autonomous economic network.
2. Buy a real conditional RecoveryRight.
3. Trigger a critical agent failure.
4. Watch a reserve agent execute replacement work.
5. Inspect real NEAR Sandbox transactions.
6. Attempt to double-sell execution capacity.
7. See overlapping obligations REJECTED.
8. Change to provably exclusive obligations.
9. See safe capital/capacity reuse ACCEPTED.
10. Observe measurable collateral efficiency.

Display a comparison:

A. No continuity guarantees
B. Naive full collateral reservation
C. Nomogenesis dependency-aware clearing

Use verifiable measurements, not invented savings.

The demo must show actual economic mechanisms,
not simply a static animation.

## 4. PRESERVE EXISTING IMPLEMENTATION

Repository:
lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis

Branch:
feat/m2-escrow

Last verified committed checkpoint:
3894710 — M2/07E/2B/2A

Additional M2/07E/2B/2B live Sandbox evidence:
4 deployments at 0, 0.015, 0.060 and 0.120
NEAR margins: payout reject/reject/pass/pass.

The real_low_margin_audit.cjs file was last
observed untracked. Verify current git state.

KEEP:

- Existing Rust contract
- Task and offer lifecycle
- Economic escrow
- Funded reserve offers
- Exclusive slot locks
- Backup activation
- Merkle proof verification
- Economic settlement
- Native NEAR withdrawals
- Existing security and storage tests

The current contract DOES NOT yet implement
general shared-collateral clearing.

No shadow calculation is an on-chain guarantee.

M2 STORAGE ACCOUNTING IS FEATURE-FROZEN.

Do not resume M2 overtesting unless a specific
reproducible defect blocks the M3 demonstration.

No production funds are authorized.

## 5. BUILD PRIORITY

FIRST:
M3/01 RecoveryRight and scenario-based
capital/capacity conflict engine in Rust.

SECOND:
M3/02 enforceable conditional commitments
and safe clearing integration with NEAR.

THIRD:
M3/03 autonomous agents, end-to-end
settlement and one-screen investor demo.

Time priority:
Working economic innovation > more abstractions.

No token launch, speculative lending,
unbacked collateral or generic marketplace.

## 6. INVESTOR TEST

The demonstration must answer:

"What new market becomes possible because
this protocol exists?"

Five acceptance criteria:

1. New sellable economic right
2. Enforceable simultaneous-activation safety
3. Quantifiable capital efficiency
4. Real execution and NEAR settlement
5. Plausible scaling to external agent networks

Grand prize is the ambition, not a guarantee.

## 7. INSTRUCTIONS FOR FUTURE CHATGPT SESSIONS

THIS DOCUMENT IS THE AUTHORITATIVE PRODUCT GOAL.

Before doing anything:

1. Read this document.
2. Read docs/HANDOFF.md.
3. Inspect git status and latest commit.
4. Inspect existing Rust and NEAR implementation.

DO NOT:

- Ask the user to select the vision again.
- Reopen the old strategic brainstorming.
- Propose another generic agent tool.
- Return to storage-accounting test loops.
- Replace the existing repository.
- Claim unimplemented features already work.

DO:

- Continue directly with M3.
- Prefer executable Rust implementations.
- Validate actual economic invariants.
- Use real NEAR Sandbox transactions.
- Keep development checkpoints small.
- Build the investor-level WOW demonstration.

NEXT DEVELOPMENT STEP:

M3/01 — RecoveryRight + Provable
Mutual-Exclusion Economic Clearing.

NORTH STAR:

"Most agent systems coordinate work.
Nomogenesis clears the economic rights that
let work continue when counterparties fail."
