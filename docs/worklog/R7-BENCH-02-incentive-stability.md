# R7-BENCH-02 — Participation equilibrium benchmark

Baseline: `85e5c20`.
Environment: AWS Ubuntu, offline Python.

## Goal

Determine whether voluntarily funded rescue
coalitions remain stable when individual agents
can independently opt in or out.

The existing Genesis formation engine is reused.
All 2^3 participation profiles are exhaustively
evaluated, with every unilateral deviation checked.

## Finding

In the hypothetical three-beneficiary market,
the fully funded coalition is unstable if the
shared recovery benefits nonpaying agents.

Two pivotal payers may remain stable while the
third beneficiary receives the recovered service
without paying.

The empty participation profile may also be
stable despite the existence of a feasible
jointly financed recovery.

Under the hypothetical payer-excludable model,
the fully participating coalition is stable
against these unilateral participation toggles.

## Engineering implications

Cryptographic settlement correctness does not
imply incentive compatibility.

Next development must define how independent
agents discover the same case and how they
coordinate participation without assuming
that the controller chooses their actions.

Benefit exclusion, service access control,
commitment timing and free-rider incentives
must be handled explicitly. Do not claim that
access exclusion already exists on-chain.

## Evidence and limitations

Machine-readable output:
`docs/evidence/R7-BENCH-02-equilibria.json`.

The modified third-buyer preferences are synthetic
and not covered by the original signed transcript.

This is a bounded static participation game,
not a dynamic multi-agent market equilibrium
or a general mechanism-design proof.

No contract or Testnet transactions were modified.
