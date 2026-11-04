# M3-R2-00 — Storage and liability design

**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `d531cbc`
**State:** documentation scaffold verified

## Purpose

Lock the persistent domain, deadlines, authority boundaries, storage funding
responsibility and complete M3 liability definition before contract mutation.

## Inputs

- `docs/M3_NORTH_STAR.md`
- `docs/M3_RESCUE_MARKET_SPEC.md`
- `docs/M3_R2_STORAGE_AND_LIABILITY.md`
- verified M3-R1 checkpoint and current M2 withdrawal implementation

## Command

`python3 scripts/m3/m3_r2_00_design.py`

## Outputs

- `docs/M3_R2_STORAGE_AND_LIABILITY.md`
- aligned active sections in AGENTS, STATUS and HANDOFF
- ADR-010
- M3 specification R2 clarification

## Verification

- Precheck: PASS at `d531cbc`.
- Builder execution: exit code 0.
- Generated Python syntax: PASS.
- Required content and file scope: PASS.
- `git diff --check`: PASS.
- No Rust, WASM, Sandbox or testnet command was required for this documentation-only checkpoint.

## Limitations

No Rust contract state, WASM, Sandbox transaction or testnet state changes in
R2-00.

## Exactly one next action

Review and commit R2-00, then begin R2-01 boundary tests and zero-liability
schema.
