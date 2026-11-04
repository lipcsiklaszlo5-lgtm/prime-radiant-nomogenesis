# M3-R3-01A — typed cross-market capacity registry

**Status:** verified
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Base:** `c719804`

## Purpose

Replace the M2-only untyped slot value with one typed capacity owner while
preserving the existing M2 public view and state-machine behavior.

This is the first R3 persistent-schema substep. It does not add RescueOffer,
RescueBundle, provider funding or bundle award.

## Schema

The registry value is:

- `M2Offer(offer_id)`;
- `M3RescueOffer(offer_id)`.

The canonical key remains provider account plus validated slot identifier.

The persistent prefix changes from `locks` to `capacity`. R3 evidence therefore
uses a fresh deployment and makes no migration claim.

## Compatibility

`slot_holder` continues returning an M2 offer ID for M2-owned capacity.

It returns `None` for an M3-owned slot rather than misrepresenting that owner
as an M2 offer.

`capacity_lock_holder` exposes the complete typed owner.

## Required evidence

- default registry is empty and creates no liability;
- M2 selection writes `M2Offer`;
- legacy M2 view still returns the offer ID;
- simulated M3 ownership blocks M2 selection before mutation;
- terminal M2 path removes the exact typed owner;
- typed owner survives state reload;
- every existing M2 and M3 regression remains green;
- Clippy and WASM checks pass.

## Files

- `src/capacity.rs`
- `src/lib.rs`
- `src/capacity_lock_tests.rs`
- `scripts/m3/m3_r3_01a_capacity_registry.py`
- `docs/worklog/M3-R3-01A-capacity-registry.md`

## Scaffold finding

The initial builder expected four identically indented M2 lock assertions.
The source contains three method-level checks and one check nested inside the
reserve-proof validation block. No contract mutation occurred before the
builder stopped. The builder now validates and rewrites the 3+1 structure
explicitly.

### Capacity-view anchor

The repaired builder then reached the public view replacement after its
earlier global `.copied()` to `.cloned()` transformation. The replacement
anchor still described the pre-transformation text, so it found zero matches.
No repository source file had been written. The anchor now describes the
actual intermediate representation.

## Next single action

Run focused capacity tests. If green, run the full regression, Clippy and WASM
gates before committing. Then implement R3-01B zero-liability RescueOffer and
RescueBundle schema.

## Full regression run

Base: `c719804`. Exit code 99 means skipped after an earlier failure.

- `cargo fmt --all -- --check`: exit code 0.
- `cargo test --locked -q`: exit code 0.
- `cargo clippy --locked --all-targets -- -D warnings`: exit code 0.
- `npm run wasm:build`: exit code 0.
- `npm run sandbox:primary`: exit code 0.
- `npm run sandbox:backup`: exit code 0.
- `npm run sandbox:settlement`: exit code 0.
- `npm run sandbox:m3-r2`: exit code 0.

This gate tests M2 behavior on the typed capacity registry and reruns
the funded M3-R2 lifecycle on a fresh local Sandbox deployment.
The M3 offer and bundle endpoints are not implemented in this ticket.

## Verified R3-01A checkpoint

- Base: `c719804`.
- Focused capacity tests: 5 passed, 0 failed.
- `cargo fmt --all -- --check`: exit code 0.
- `cargo test --locked -q`: 173 passed, 0 failed.
- `cargo clippy --locked --all-targets -- -D warnings`: exit code 0.
- `npm run wasm:build`: exit code 0.
- WASM SHA-256: `c8999ddd7792eeee516c2f372303bd4632fe653909762379bb100c7ec2efc034`.
- `npm run sandbox:primary`: exit code 0.
- `npm run sandbox:backup`: exit code 0.
- `npm run sandbox:settlement`: exit code 0.
- `npm run sandbox:m3-r2`: exit code 0.
- `git diff --check`: exit code 0.
- The M3 owner was simulated in the Rust cross-lock test. Real M3 offer
  posting and award remain to be implemented.
- Next single action: M3-R3-01B zero-liability offer and bundle schema.
