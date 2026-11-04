# M3-R4 — Authenticated proof and terminal settlement

Status: R4-01 through R4-04 locally verified; R4-05 pending
Date: 2026-11-04
Base checkpoint: 2bf546d

## 1. Scope

Convert one awarded RecoveryRight into a terminal economic
result without creating or destroying principal.

Preserve R3 records, the M2/M3 typed capacity registry,
separate worker rewards and existing withdrawal backing.

Exactly two selected component providers, at most six
positive sponsor allocations, one terminal settlement.

No oracle, discretionary judge, AI proof validation,
shared bond, new token or cross-contract trust dependency.

## 2. Component proof

Public transaction:
submit_rescue_component(bundle_id, component_index,
                        payload, sibling)

Caller must equal the immutable selected offer provider.
Bundle must be Awarded; offer Locked; outcome Pending.
Chain timestamp must be strictly before recovery_deadline.
The slot must be owned by M3RescueOffer(offer_id).

component_index is exactly 0 or 1.

Payload format:
- byte 0: version 0x01
- byte 1: kind 0x01 for component 0, 0x02 for component 1
- byte 2: record count 1..16
- each record: item_id u16 BE, value u64 BE
- item IDs strictly ascending and unique
- exact payload length 3 + 10 * count
- payload must fit MAX_COMPONENT_PAYLOAD_BYTES

Sibling must contain exactly 32 bytes.

Use the existing Merkle hashing convention:

leaf0 = SHA256(0x00 || u64_be(0) ||
               u32_be(payload_len) || payload)
leaf1 = SHA256(0x00 || u64_be(1) ||
               u32_be(3) || [0x01,0x7f,kind])
root = SHA256(0x01 || leaf0 || leaf1)

Require root == case.component_commitments[component_index].

Validate all inputs before mutation.
Then persist the payload in case.resolved_payloads,
set component_outcomes[index] = Proven,
and set selected offer phase = Proven.

Proof submission transfers no funds and does not
release the capacity slot.

Invalid proof, duplicate proof, wrong provider, wrong
component, altered commitment or late proof must not write.

Merkle verification authenticates bytes against a
precommitted root. It does not attest physical work,
provider independence or off-chain data availability.

## 3. Terminal bundle settlement

Public permissionless transaction:
settle_rescue_bundle(bundle_id)

Allowed only if:
- bundle phase is Awarded, and
- both components are Proven, OR
- timestamp >= recovery_deadline.

At deadline, every still-Pending component becomes Defaulted.
A Proven component can never be converted to Defaulted.

Read immutable selected offers, Q, positive allocations,
case and existing typed slot owners before any writes.

Validate:
- q0 + q1 == Q with checked arithmetic
- sum sponsor allocations == Q
- each mandate is Locked to this bundle
- each selected bond equals Q
- providers and slot keys are distinct
- both typed capacity locks have exact owners
- existing claimables can accept all grouped credits
- rescue_escrow can cover total settlement credits
- no duplicate sponsor job IDs

No terminal state mutation until all preflight succeeds.

## 4. Both components proven

For each selected provider j:
credit Q + q_j to its immutable provider account.

This returns its bond Q and pays its fee q_j.

Total settlement credit = 3Q.
Sponsor allocations are consumed, not refunded.
Unused caps were already refunded at award.

Worker rewards remain outside this transaction.

Bundle phase becomes SettledSuccess.

## 5. One or two defaults

For each positive sponsor i:
credit its original locked allocation x_i
to the immutable job buyer.

For each Proven provider j:
credit Q + q_j to the immutable provider account.

Defaulted providers receive zero and forfeit Q each.

Let D be the number of defaulted components.
Let F be the sum of fees of Proven providers.

Residual forfeiture R = D*Q - F.

Distribute R equally among positive sponsor rows,
sorted ascending by job ID. Integer remainder units
go to the lowest job IDs first.

Do not distribute penalties to zero-allocation mandates
or to the settlement caller.

All arithmetic uses checked u128 operations.

Total settlement credits must equal 3Q.
Bundle phase becomes SettledDefault.

## 6. Atomic terminal writes

After full preflight:
- credit immutable recipients through the existing ledger;
- decrease rescue_escrow by exactly 3Q;
- mark positive mandates Released / Settled with zero principal;
- mark offer outcomes Proven or Defaulted as appropriate;
- clear each capacity key only if its typed owner matches;
- persist terminal component outcomes and bundle phase;
- close the rescue case without deleting proof bytes;
- preserve worker reward liabilities and storage reserves.

A repeated settlement or failed preflight writes nothing.

There is no keeper fee in R4.

## 7. Accounting examples

Q=12, fees=(6,6), sponsor allocations=(4,4,4).
Provider bonds are 12 each. Bundle liability is 36.

Both Proven:
- providers 18 and 18
- buyers receive no additional award settlement credit
- total 36

Proven, Defaulted:
- successful provider 18
- sponsor allocation refunds 4,4,4
- remaining forfeiture 6 => 2,2,2
- buyers 6,6,6; total 36

Defaulted, Defaulted:
- providers zero
- sponsor allocation refunds 4,4,4
- forfeiture 24 => 8,8,8
- buyers 12,12,12; total 36

The 75 units of accepted-job worker rewards and 3 units
of earlier unused-cap refunds are separate liabilities.
All 114 initial economic units remain accounted for.

## 8. Worker result boundary

The existing funded job supports ExactCommitment and
MinimumThreshold profiles. The older R0 draft describes
three computed result profiles; those are not the same API.

Do not silently substitute one representation for another.

R4 worker completion must be a separate ticket with
explicit result validation, the worker's authenticated
identity, final_deadline checks, reward release and replay
protection. No worker reward is paid by bundle settlement.

## 9. Required regression evidence

- two valid distinct provider proofs
- forged, malformed, duplicate and late proofs
- wrong provider, wrong bundle and wrong component
- component payload ordering and size boundaries
- success, each one-default ordering, both-default
- exact recovery_deadline behavior
- claimable aggregate and recipient overflow
- escrow underflow and typed slot-owner mismatch
- failed preflight leaves all records unchanged
- replayed settlement cannot create further credit
- persistent state reload and native withdrawals
- worker rewards untouched at bundle settlement
- unchanged storage reserve and M2 slot isolation
- fresh NEAR Sandbox for success and partial default

## 10. Implementation order

R4-01: bounded payload parser and authenticated proof.
R4-02: pure terminal allocation and economic invariants.
R4-03: atomic on-chain terminal bundle settlement.
R4-04: worker result and reward lifecycle.
R4-05: end-to-end Sandbox plus complete M2/M3 regressions.

No production-funds approval without further review.
