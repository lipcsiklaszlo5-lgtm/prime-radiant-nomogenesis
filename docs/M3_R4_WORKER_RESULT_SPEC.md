# M3-R4-04 — Worker result and reward boundary

Status: Rust and local NEAR Sandbox worker lifecycle verified
Base commit: `0f6d127`
Date: 2026-11-04

## 1. Existing job schema

The persistent job already contains immutable buyer and
worker accounts, held reward, a 32-byte result commitment,
optional u128 threshold, final deadline and job phase.

ExactCommitment requires threshold=None.
MinimumThreshold requires threshold=Some(value>0).

The old R0 profiles 0x11, 0x12 and 0x13 are NOT
substitutes for these two current funding profiles.

## 2. Deterministic result

Compute the sum of quantity * price from exactly two
preauthenticated component payloads.

Require matching ordered item ID sets; perform every
multiplication and addition with checked u128 arithmetic.

Worker result is exactly 26 bytes:

- version byte: 0x01
- profile byte: 0x21 ExactCommitment,
  0x22 MinimumThreshold
- job_id: u64 big-endian
- value: u128 big-endian

The submitted value must exactly equal the independently
recomputed result. The caller supplies no recipient.

## 3. Funding-time commitment rules

ExactCommitment:

SHA256(
  ASCII("NOMOGENESIS/M3/EXACT-SUM/V1") || 0x00 ||
  case_id[32] || canonical_result[26]
)

MinimumThreshold:

SHA256(
  ASCII("NOMOGENESIS/M3/MIN-SUM/V1") || 0x00 ||
  case_id[32] || threshold_u128_be
)

The latter commits to a public calculation policy, not
to the unknown future numeric outcome. It also requires
the recomputed result to be >= the funded threshold.

Both commitments are computed before job funding.
Existing arbitrary placeholder commitments do not
authorize worker completion.

## 4. Planned on-chain reward boundary

Only the recorded worker may complete an Accepted job
strictly before final_deadline.

Require the matching case's awarded bundle to have
SettledSuccess with two Proven component outcomes,
and both stored payloads to match the immutable roots.

After every preflight check:
- reduce rescue_escrow by the exact held worker reward;
- credit the immutable worker through the existing ledger;
- zero held_worker_reward and set phase Completed;
- preserve all rescue mandate, provider, case and bundle
  balances and economic states.

Failed proof, late completion and replay do not pay.
Defaulted cases leave the separate job expiry refund path
available at final_deadline.

No new persistent fields or storage migrations.

## 5. Limits

This result authenticates the numeric calculation against
stored committed input. It does not independently prove
real-world data correctness or physical work.
No production-funds approval.

## 6. Local verification — 2026-11-04

- 8 pure validator tests PASS.
- 6 authenticated completion integration tests PASS.
- 242 total Rust tests PASS.
- Strict Clippy, rustfmt and compatible WASM PASS.
- WASM SHA-256: `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`.
- Fresh local Sandbox worker lifecycle PASS.
- Exact result, threshold and deadline boundaries tested.
- Invalid signer, forged result and replay rejected.
- Full terminal ledger conserved 456 economic units.
- Native worker withdrawal and callback finalized.
- No public testnet or independent security audit.

## 7. Next verification

Connect this checked pure result engine to the on-chain
worker reward transition and test fresh Sandbox payouts.
