# M3 Rescue Market specification

**Version:** M3-R0
**Status:** implementation specification; no M3 code is claimed complete
**Base checkpoint:** aceae9b

## 1. Limits

| Limit | Value |
|---|---:|
| Sponsoring jobs | 1–6 |
| Required components | exactly 2 |
| Open offers | at most 6 |
| Records per component | 1–16 |
| Payload bytes | at most 256 |
| Selected providers | exactly 2, distinct |
| Accepted bundles per mandate | at most 1 |

All NEAR amounts use checked u128 yoctoNEAR arithmetic. Timestamps use chain time. Ties use ascending numeric IDs.

## 2. Domain records

RescueJob stores job ID, buyer, worker, worker reward, two dependency IDs, rescue cap, dependency deadline, final deadline, result profile, optional threshold and state.

RescueMandate stores mandate ID, job ID, owner, remaining cap, expiration and Open, Locked or Released state.

RescueOffer stores offer ID, dependency ID, provider, slot ID, fee, posted bond capacity, recovery deadline and state.

RescueBundle stores selected offers, sponsoring mandates, allocations, total price Q, common recovery deadline and terminal state.

## 3. Component payload

Canonical binary payload:

- byte 0: version 0x01;
- byte 1: kind, 0x01 quantities or 0x02 prices;
- byte 2: record count, 1–16;
- each record: item_id u16 big-endian and value u64 big-endian;
- item IDs strictly ascending and unique;
- exact length: 3 + count × 10 bytes.

A dependency uses the existing Merkle algorithm with height 1 and index 0. Leaf 0 contains the component. Leaf 1 contains metadata bytes [0x01, 0x7f, kind].

leaf = SHA256(0x00 || u64_be(index) || u32_be(length) || payload)

root = SHA256(0x01 || leaf_0 || leaf_1)

Proof establishes payload correctness, not labor, machine independence or physical capacity.

## 4. Final work

A worker submits 26 bytes:

- version 0x01;
- profile byte;
- job ID u64 big-endian;
- result u128 big-endian.

Profiles:

- 0x11: sum of quantity × price;
- 0x12: item ID with maximum quantity × price, ties to lowest ID;
- 0x13: count whose quantity × price meets the job threshold.

The contract parses stored components, uses checked u128 arithmetic and recomputes the result. Malformed bytes, duplicate IDs, missing items and overflow fail closed.

## 5. Timeline

dependency_deadline < bid_close < recovery_deadline < final_job_deadline.

Proof is valid only while now < recovery_deadline. Failure is finalizable only while now >= recovery_deadline. Final job success requires both component proofs.

External keepers submit time-triggered transactions. The chain does not run cron.

## 6. Cost allocation

For bundle price Q and caps c_i, allocations x_i satisfy:

- sum(x_i) = Q;
- 0 <= x_i <= c_i.

Algorithm:

1. sort active mandates by job ID;
2. divide the remainder equally among non-saturated mandates;
3. assign indivisible remainder units in job-ID order;
4. cap each assignment at remaining mandate capacity;
5. repeat until Q is allocated or no progress is possible.

If combined caps are below Q, clearing fails without mutation.

## 7. Clearing

Enumerate every admissible pair containing one offer for each component. With six offers, at most 36 ordered checks are needed.

An offer is admissible only when open, unexpired, bonded for Q, on a free M2/M3 slot, using the common recovery deadline, and paired with a distinct provider.

Choose the lowest total fee. Equal totals use ascending offer-ID pairs. Inadmissible bids are filtered before price comparison.

Award atomically locks mandates, Q buyer funds, Q from each provider and both slots. Excess bond capacity is credited back. No partial award may remain.

## 8. Settlement

Each selected provider locks Q. Provider fees q_j sum to Q.

Complete success:

- providers receive q_j;
- providers receive their Q bonds;
- unused mandate capacity remains buyer-owned;
- worker rewards remain in the job lifecycle.

At least one default:

- all buyer rescue allocations are returned;
- successful providers receive q_j from defaulted bonds;
- successful providers receive their own Q bonds;
- defaulting providers forfeit Q;
- remaining forfeited value is divided among sponsoring buyers deterministically.

Worker rewards settle separately.

| Outcome | Buyer-side credits after job expiry | Provider credits | Total |
|---|---:|---:|---:|
| Complete success and completed jobs | 3 | 111 | 114 |
| One provider succeeds, one defaults | 96 | 18 | 114 |
| Both providers default | 114 | 0 | 114 |

## 9. Accounting invariants

- rescue_escrow equals all uncredited M3 principal.
- Internal allocation does not change aggregate liability.
- Account credit reduces rescue_escrow equally.
- Withdrawal backing includes rescue_escrow and all existing M2 obligations.
- A mandate funds at most one bundle.
- A job appears once among sponsors.
- A proof completes one component.
- A bundle settles once.
- M2 and M3 cross-check provider/slot locks.
- Failed native payout restores the original credit once.
- Fresh testnet deployment does not assume migration.

## 10. Required tests

R01 success.
R02 insufficient caps.
R03 cap overflow.
R04 reused mandate.
R05 duplicate job.
R06 incomplete components.
R07 M2/M3 slot conflict.
R08 cheap unfunded bid.
R09 forged or late proof.
R10 one provider default.
R11 both providers default.
R12 replayed settlement.
R13 withdrawal backing.
R14 failed payout recovery.
R15 duplicate proof.
R16 arithmetic bounds.
R17 deadline races.
R18 input limits.
R19 missing-component result.
R20 clean-checkout reproduction.

These are required tests, not PASS claims.

## 11. First code ticket

M3-R1 creates a pure Rust domain module only:

- records and enums;
- capped-equal allocation;
- admissible offer-pair selection;
- success and partial-default settlement;
- conservation and adversarial tests.

M3-R1 does not mutate persistent NEAR state.
