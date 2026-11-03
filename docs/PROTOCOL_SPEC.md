# Economic Commitment Protocol — M0 Specification

**Status:** DRAFT v0.2 — design only, neither implemented nor approved.
**Target:** NEAR Rust smart contract, native NEAR on testnet.
**Scope:** one buyer, one consenting primary, one reserve, one option per task; multiple tasks share a global slot registry.

This is a minimal financial commitment protocol, not a production market or a claim of verified physical capacity. The previous Python V2 is a research reference, not deployed NEAR behavior.

## 1. Participants and trust boundaries

- **Buyer** specifies a verifiable digital task, deposits its full economic budget, and purchases a reserve option.
- **Primary provider** is a separately authenticated account that explicitly accepts the task and can submit the normal result.
- **Reserve provider** is a different account that locks a declared capacity slot and its own collateral, and can deliver after backup activation.
- **Keeper** is *any* NEAR account that triggers time-sensitive transitions by paying gas. No whitelist and no presumption that the chain runs a cron job.
- **Verifier** is contract code using the immutable task commitment, not a trusted string supplied by an agent.

Authorization always derives from `env::predecessor_account_id()`. Deadline checks always derive from chain time. Caller and timestamp must not be accepted as untrusted method arguments.

The buyer, primary provider and reserve provider must be distinct accounts. The keeper may be any account, including one never seen before.

## 2. Objective digital task: authenticated data-chunk retrieval

The buyer commits to a Merkle dataset and requests one indexed chunk. A provider retrieves the bytes and gives the contract a Merkle inclusion proof. The proof verifies *which* chunk was returned, not who computed it or whether a reserve had physical capacity.

Canonical version-1 encoding:

- A dataset contains exactly `2^h` leaves; `1 <= h <= 10`.
- The immutable task records `root: [u8; 32]`, `height: u8` and `index: u64`; `index < 2^h`.
- The submitted payload has length 1–256 bytes and exactly `h` siblings of 32 bytes each.
- `leaf = SHA256(0x00 || u64_be(index) || u32_be(payload_length) || payload)`.
- `parent = SHA256(0x01 || left_32 || right_32)`.
- For sibling depth `d` from leaf toward root, bit `d` of `index` determines child ordering.
- Proof is valid only when calculated root equals the immutable task root.

Fixture: four ASCII payloads `alpha`, `bravo`, `charlie`, `delta`; request index 2 and height 2. Independently generate expected root and siblings outside the contract. Test valid and mutated proofs, wrong index, wrong lengths, and reversed sibling order.

**Explicit limitation:** if a dataset or proof is public, another party may copy it. This establishes objective result correctness only. It cannot prove provider labor, standby capacity, confidential computation, or source availability. Both providers need independent off-chain access to data for a meaningful failover demo.

## 3. Economic quantities and persistent state

Store NEAR amounts as integer `u128` yoctoNEAR with checked arithmetic. No floats, implicit overdrafts or arbitrarily user-supplied accounting balances.

`Task`: ID; buyer; designated primary; `primary_deadline`; `reserve_deadline`; immutable proof commitment; budget buckets `primary_reward`, `reserve_reward`, `option_premium`, `keeper_bounty`; option ID (if assigned); lifecycle state; terminal settlement marker.

`Offer`: ID; task ID; reserve account; declared `slot_id`; expiration time; prices constrained to task budget; collateral; availability/acceptance/release state.

`Option`: selected offer ID and buyer/task ID; slot lock; activation state. Only one accepted option per task.

`SlotLock`: `(reserve_account, slot_id) -> accepted_option_id`. The same slot may appear in unaccepted offers, but never in two simultaneously accepted/live options.

`Ledger`: authenticated deposits, segregated task funds, reserved collateral, per-account claimable balances, withdrawal IDs and pending transfers, transfer results; storage reserve separately from economic escrow.

**Economic policy v0.2:** collateral must be at least `reserve_reward + option_premium`; premium remains escrowed until terminal settlement. This prevents the trivial `premium=100, collateral=1` default profit, but is not a theorem of incentive compatibility. Limits and account storage economics require sandbox validation.

## 4. Registration and funding

`create_task` (buyer, payable): enforce distinct buyer/primary, correct commitment and time order `now < primary_deadline < reserve_deadline`, strictly positive budget buckets and funding exactly sufficient for their sum plus separately measured storage deposit. State `SeekingPrimary`.

`accept_primary(task_id)` (designated primary): explicitly accepts; `SeekingPrimary -> SeekingReserve`.

`post_offer(task_id, slot_id, expiry)` (reserve, payable): allowed only in `SeekingReserve`; provider differs from buyer and primary, `now < expiry <= primary_deadline`, matching task prices, sufficient collateral plus separately accounted storage. Creates an `Available` offer. Reserve can cancel an unaccepted offer and reclaim its collateral; cannot withdraw collateral from an accepted live option.

`buy_option(task_id, offer_id)` (buyer): task in `SeekingReserve`, no existing accepted option, offer unexpired and for the task, provider slot not locked elsewhere, before primary deadline. Atomically locks the slot and transitions to `Running`. No immediate premium or reward distribution; Q is earned for purchased standby and allocated at terminal settlement.

`release_unaccepted_offer(offer_id)`: the reserve owner may release an available offer at any time. After offer expiry, task cancellation, or unmatched task expiry, anyone may trigger release. Collateral is credited only to the offer owner. Accepted or previously released offers cannot use this operation.

## 5. Lifecycle

`SeekingPrimary -> SeekingReserve -> Running` via explicit primary acceptance and buyer option purchase.

While `Running`:

- `submit_primary_proof`: only designated primary, only `now < primary_deadline`, valid proof; terminal `PrimarySucceeded`.
- `trigger_backup`: any account, only `primary_deadline <= now < reserve_deadline`; `Running -> BackupActive`, records the activating keeper but does not credit the bounty yet. K is credited exactly once at terminal settlement.
- `close_unactivated`: any account, only `now >= reserve_deadline`; terminal `UnactivatedExpired`. The reserve receives the purchased standby premium Q. This is a documented liveness fallback if no keeper activated; it does **not** guarantee continuous failover.

While `BackupActive`:

- `submit_reserve_proof`: only accepted reserve account, only `now < reserve_deadline`, valid proof; terminal `ReserveSucceeded`.
- `finalize_reserve_failure`: any account, only `now >= reserve_deadline`; terminal `ReserveFailed`, slash collateral to buyer.

Before an option is bought:

- `cancel_unmatched`: buyer may cancel `SeekingPrimary` or `SeekingReserve`, refund its unused economic funding; unaccepted offers remain separately cancellable by their owners. Terminal `Cancelled`.
- `expire_unmatched`: any account may expire an unmatched task after the primary deadline; buyer funding is refunded and unaccepted offers remain independently refundable to their owners. Terminal `UnmatchedExpired`.

Every accepted-option terminal settlement atomically releases its capacity-slot lock and marks the associated offer released. Neither terminal replay nor offer release may unlock another task's slot or credit collateral again.

No method may mutate a terminal task to another terminal state. A late proof must never resurrect a task. Return explicit errors on invalid transitions.

## 6. Settlement matrix

Let `P=primary_reward`, `R=reserve_reward`, `Q=option_premium`, `K=keeper_bounty`, and `C=locked_reserve_collateral`. Incoming economic obligations total `P+R+Q+K+C` once an option is accepted. Storage obligations are tracked separately.

| Terminal state | Buyer credit | Primary credit | Reserve credit | Keeper credit |
|---|---:|---:|---:|---:|
| `PrimarySucceeded` | `R+K` | `P` | `Q+C` | `0` |
| `ReserveSucceeded` | `P` | `0` | `R+Q+C` | `K` |
| `ReserveFailed` | `P+R+Q+C` | `0` | `0` | `K` |
| `UnactivatedExpired` | `P+R+K` | `0` | `Q+C` | `0` |
| `Cancelled` / `UnmatchedExpired` (before option) | `P+R+Q+K` | `0` | unaccepted collateral returned separately | `0` |

The last row has no accepted option: collateral is still owned by independent *unaccepted* offers and must be returned via their own cancellation/refund transition; do not invent a task-specific `C` that was never locked.

Purchased standby Q belongs to reserve when primary succeeds, reserve succeeds, or the option expires without activation. If activated reserve defaults, Q returns to buyer and C is forfeited. Keeper K is earmarked on activation and credited only at terminal settlement.

Example: P=20, R=10, Q=3, K=2, C=13; total deposits=48. Primary success: buyer 12, primary 20, reserve 16. Reserve success: buyer 20, reserve 26, keeper 2. Reserve failure: buyer 46, keeper 2. Unactivated expiry: buyer 32, reserve 16. Each outcome totals 48.

The *sum* of credits in each accepted-option terminal state must equal `P+R+Q+K+C`. The ledger must reconstruct this from original deposits, not from a claimed `money_conserved` flag. Economic entitlement must never be created by settlement replay.

## 7. Withdrawals and NEAR async effects

Settlement credits internal claimable amounts; it does not assume synchronous NEAR payouts.

`withdraw(amount)`: authenticated owner; sufficient claimable amount; decrement it and create a unique pending payout record *before* scheduling the NEAR Promise transfer. Amount cannot be claimed again while pending.

Private callback: only the contract's own callback; inspect the Promise result. Success permanently closes the pending payout. Failure restores claimable entitlement exactly once. Missing/duplicate callback must not double-restore or double-pay.

Storage-staking funding, executable balance and the deposit accounting must be reconciled with native NEAR attached-deposit semantics. Before paying a claim, confirm that the contract remains adequately funded for all other claimable, pending, escrowed and storage obligations. Gas costs paid by external callers are not magically economic escrow movements.

## 8. Security invariants

I-01. Role operations derive the caller from an authenticated NEAR predecessor account.
I-02. Terminal task settlements happen at most once.
I-03. Every accepted option refers to an existing task and valid offer.
I-04. At most one accepted option belongs to a task.
I-05. A provider/slot pair is locked by at most one live option.
I-06. No proof is accepted at or beyond its deadline.
I-07. A keeper receives no more than one bounty per task.
I-08. All escrow and collateral movements are checked and fully accounted.
I-09. Failed withdrawal restores entitlement once; successful withdrawal pays once.
I-10. Reserve failure forfeits its collateral to the buyer.
I-11. Buyer cannot reclaim entitlements already credited to providers or keeper.
I-12. Proof validates the task's immutable Merkle root, height and index.

## 9. Required functional and adversarial tests

T-01. Different buyer, primary and reserve accounts complete normal primary path.
T-02. Missing primary; unrelated unregistered keeper activates backup; reserve completes.
T-03. Second buyer cannot accept an offer for an already locked reserve slot.
T-04. Mutated Merkle leaf, sibling, index, height or length fails.
T-05. Incorrect signer cannot submit either provider proof.
T-06. Primary proof at and after deadline fails.
T-07. Keeper activation before deadline fails.
T-08. Repeated activation cannot create extra bounty.
T-09. Reserve proof at/after reserve deadline fails.
T-10. Reserve failure slashes full collateral; buyer and keeper credits balanced.
T-11. `premium=100, collateral=1` offer is rejected.
T-12. Primary completion returns unused R and K to buyer.
T-13. Async payout fails, claim restored once, later successful withdrawal pays once.
T-14. Two unaccepted offers may declare the same slot; only one can be accepted at a time.
T-15. Replaying settlement, claim or cancellation does not alter balances.
T-16. No keeper activates; after reserve deadline buyer receives P+R+K and reserve receives Q+C.
T-17. Arithmetic overflow and underfunded deposit fail.
T-18. Every settlement branch preserves authenticated deposits plus collateral, excluding separately accounted storage.
T-19. A clean checkout executes documented independent tests and NEAR sandbox lifecycle(s).
T-20. Independent buyer, primary, reserve and keeper sign actual testnet transactions; receipts are recorded.
T-21. An unrelated caller expires an unmatched task; buyer funds are refunded and unaccepted collateral remains reclaimable.
T-22. Primary succeeds; reserve receives purchased-standby Q although backup was unused.
T-23. Keeper activation creates no claimable bounty; terminal settlement credits K exactly once.
T-24. Releasing an unaccepted offer returns collateral only to its owner, without duplicate credits.
T-25. Every terminal settlement releases its accepted slot lock; another task can subsequently reserve that slot.

## 10. Threat model and excluded claims

Covered in this MVP: unauthorized method calls, double settlement, forged result proof, live slot double booking, wrong timing, reserve nonperformance, arithmetic overflow, failed asynchronous payout, callback replay, underfunded collateral.

Not covered: independently attested compute/physical capacity; independently sourced data availability; malicious buyer choosing unavailable data; copying a public proof; price discovery; network-effect or economic-optimality claims; production oracle/arbitration; automatic keeper without an external process; formal verification; or production security audit.

## 11. Milestone gates and unresolved engineering decisions

- **M0:** review the exact methods, settlement table, Merkle byte encoding, storage policy, and pin Rust/NEAR dependency versions. This draft is not implementation approval.
- **M1:** typed Rust state machine and authorization, deterministic proof verification, unit *and* NEAR sandbox transition tests. No claims of real payout.
- **M2:** native NEAR deposit and collateral bookkeeping, storage reconciliation, pending withdrawals, callback failure and replay tests.
- **M3:** independent signer testnet lifecycle plus explorer transaction receipts.
- **M4:** off-chain Python optimizer integration, judge-friendly clean-checkout demonstration, CI, accurate eligibility/provenance and submission artifacts.

Unresolved for M0 review: storage deposit pricing and refunds; exact method parameter types and gas assumptions; consistency between pending payouts and account liabilities; whether the Merkle proof is sufficiently meaningful for judging the agent-economy track. No frontend, paid API or Rust rewrite of the Python optimizer is required.
