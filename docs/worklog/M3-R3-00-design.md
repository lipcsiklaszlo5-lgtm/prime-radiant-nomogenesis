# M3-R3-00 — provider market and atomic award design

**Status:** documentation checkpoint
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `643e19c`

## Purpose

Lock the supply-side records, funding rules, deterministic clearing and
cross-market capacity boundary before persistent R3 implementation.

## Product decision

Pre-funded buyer mandates and funded provider offers remain nonbinding market
inputs.

A binding `RecoveryRight` is created only by a complete atomic award that locks:

- deterministic buyer allocations;
- two distinct funded providers;
- full bundle-price bond from each provider;
- two typed exclusive capacity slots;
- one recovery deadline;
- one immutable bundle record.

## Key engineering decisions

- maximum six offers and six sponsors;
- exactly two components and two distinct selected providers;
- provider bond capacity is deposited per offer;
- no shared bond reuse;
- award caller supplies only the case ID;
- pair, price, sponsors and allocations are contract-derived;
- capped-equal allocation remains normative;
- M2 and M3 share one typed capacity registry;
- R3 uses fresh deployment state;
- case and offer storage quotes are revised before funding endpoints.

## Files

- `docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md`
- `docs/M3_RESCUE_MARKET_SPEC.md`
- `docs/DECISIONS.md`
- `AGENTS.md`
- `docs/STATUS.md`
- `docs/HANDOFF.md`
- `docs/worklog/M3-R3-00-design.md`
- `scripts/m3/m3_r3_00_design.py`

## Verification

Documentation-only checkpoint. No Rust, WASM or Sandbox execution is claimed.

Required checks:

- exact intended file set;
- unique ADR identifiers;
- required design sections;
- no false implementation claim;
- `git diff --check`.

## Next single action

M3-R3-01 persistent offer, bundle and typed capacity-lock schema with zero new
economic liability.

## Validation finding

The first content check failed because its assertion expected
`## 8. Atomic award`. The normative document correctly places cost allocation
and provider bond locking before the atomic transition, so the actual heading
is `## 10. Atomic award`.

No design content was changed in response. The corrected validation checks the
real section order and all financial markers.

### Wrapped-text validation

The second content check searched for one unwrapped sentence in
`docs/M3_RESCUE_MARKET_SPEC.md`. The sentence was present but Markdown wrapped
it after `caller`. The corrected check normalizes whitespace before comparing
prose. No specification or design rule changed.
