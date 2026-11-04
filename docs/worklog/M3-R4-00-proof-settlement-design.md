# M3-R4-00 — proof and settlement design

Date: 2026-11-04
Branch: feat/m2-escrow
Base: 2bf546d

Documentation-only ticket.
No new Rust implementation or runtime PASS is claimed.

Inputs:
- docs/M3_NORTH_STAR.md
- docs/M3_RESCUE_MARKET_SPEC.md
- docs/M3_R3_PROVIDER_MARKET_AND_AWARD.md
- src/rescue.rs
- src/rescue_market_model.rs

Output:
- docs/M3_R4_PROOF_AND_SETTLEMENT_SPEC.md

The specification preserves the existing 3Q settlement
conservation rule, immutable recipients, typed slot locking
and separately held worker rewards.

Known risk:
The legacy R0 computed worker profiles differ from the
current persistent ExactCommitment/MinimumThreshold schema.
This must be resolved explicitly before R4-04 implementation.

Next action: R4-01 bounded proof parser and proof authentication.
