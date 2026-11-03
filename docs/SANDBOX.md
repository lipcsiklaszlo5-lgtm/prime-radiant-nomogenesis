# NEAR Sandbox

Requirements: Rust 1.99.1, wasm32 target, Node.js and npm.

Run `npm ci` then `npm run test:sandbox`.

Tests cover primary success, reserve success, reserve failure, keeper activation, replay rejection and slot release on local NEAR Sandbox.

Internal escrow, terminal claims and native NEAR withdrawals are implemented. Withdrawal success and callback recovery have been tested locally.

## M2 funding sandbox

`npm run test:sandbox` includes the authenticated buyer deposit and reserve collateral tests.

The funding tests run on an isolated local NEAR Sandbox using test accounts and valueless tokens.

Known limitations: exact storage accounting, storage-reserve refund policy, public testnet deployment and production security review are not implemented or verified.


## M2 terminal settlement sandbox

`npm run test:sandbox` runs eleven independent local suites.

The settlement suite tests four funded tasks in one sandbox:

- Primary success
- Reserve success
- Reserve default with collateral forfeiture
- Expiry without keeper activation

Aggregate economic deposits: 192 yoctoNEAR.
All 192 are accounted for as escrow or internal credits.
Storage reserves are excluded from that economic total.

The suite verifies keeper credit timing, slot release and
terminal replay rejection. Withdrawal tests are separate suites.


## M2 native withdrawal sandbox

Sandbox/05 (`sandbox/withdrawal.cjs`) verifies:

- Real transfers of 0.5, 0.8 and 0.6 NEAR
- Recipient balance increases
- Completed asynchronous payout callbacks
- No residual pending withdrawal
- Exact internal claimable accounting
- Unauthorized withdrawal and callback rejection

The recipient's total account balance can also change through
transaction gas fees and refunds. Exact amounts are audited in
the contract ledger; external account deltas use a tolerance.

Sandbox/06 (`sandbox/withdrawal_failure.cjs`) verifies:

- A native transfer receipt fails for a nonexistent receiver
- The callback restores the owner's claimable balance
- Other claimants are unchanged
- No withdrawal remains pending

This failure case uses an intentionally fault-injected WASM
variant. `scripts/test-withdrawal-failure.sh` restores the
original Rust source and normal WASM artifact after execution.

Neither suite establishes production safety. Storage obligations
are still provisionally reserved, and no public testnet or
independent security audit has been performed.


## M2/05 measured storage audit

Sandbox/07 measures 15 chain-observed storage checkpoints:
task and offer creation, deposits, selection, settlement,
withdrawal, offer release and cancellation.

Measured growth: 1535 bytes.
Provisional reserve: 8192 bytes.
The difference is not automatically refundable.

See `docs/STORAGE_POLICY.md`.

Historical limitation: unpaid task and offer creation
was addressed in M2/05C. Exact storage refunds remain pending.


## M2/05C — Storage admission sandbox

Sandbox/08 verifies:

- Zero, insufficient and excessive storage deposits rejected.
- Two independent callers tested for both creation endpoints.
- Twelve rejected attempts leave contract storage unchanged.
- Task and offer storage-bond owners persisted on-chain.
- Storage liabilities kept separate from economic escrow.
- Measured storage growth remains within each 2048-byte
  provisional creation contribution in the tested cases.

Sandbox/07 remains a measured lifecycle regression.
Its earlier 1535-byte figure belongs to the pre-admission
implementation; the updated lifecycle measures 1930 bytes.

No independent security audit or public testnet validation.


## M2/05D — Capital solvency sandbox

Sandbox/09 (`sandbox/capital_audit.cjs`) tests
two deployments with explicitly limited initial NEAR balances.

Both deployments include the storage stake necessary to
hold the deployed WASM. The available operating capital is
then independently limited:

- 0.06 NEAR: real withdrawal succeeds
- 0.015 NEAR: backing guard rejects withdrawal
- Rejected payout leaves the customer's claim unchanged

The test does not establish a universally sufficient
minimum capitalization.

The current withdrawal guard reserves funding for both
the entire storage-reserve ledger and the actual byte stake.
This conservative design requires additional operating
capital and must be revisited before storage refunds.


## M2/06B — Scoped storage refund integration

Sandbox/10 (`sandbox/refund_integration.cjs`) verifies:

- Net storage measurement on two funded offer releases
- Different storage effects for first and repeated credits
- Exact transfer from storage reserve to internal claimable
- Original reserve provider receives the storage credit
- Replayed release cannot claim a second refund
- Unfunded releases do not refund creation bonds
- Global economic and storage-ledger conservation

Refund amounts are observations of this workload,
not universal fixed refund rates.

The historical pre-refund measurement is archived under
`docs/audit-archive/` and is not an active regression.

General refund eligibility, storage-account ownership
attribution and adversarial concurrency remain open.


## M2/06C — Cross-owner audit

Sandbox/11 (`sandbox/refund_ownership_audit.cjs`) tests:

- Two buyers, two reserve providers and an outsider
- Rejection of unauthorized early release
- Third-party release after cancellation
- Storage rebate attributed to the original provider
- Unaffected balances of other parties
- Per-offer replay rejection
- Exact aggregate ledger conservation
- Native payout of credited storage rebate

Default release order: [2,0,1,3].

Four additional independently deployed scenarios were
validated locally:

- [0,2,3,1]
- [1,3,0,2]
- [2,1,0,3]
- [3,0,1,2]

Run those four scenarios again with:

`npm run sandbox:ownership-orders`

The observed aggregate rebate remained 0.00091 NEAR
per provider in each tested scenario.

Five of the 24 possible orders were tested.
This is not exhaustive concurrency or security proof.

## M2/07B — Mixed lifecycle capital audit

Local NEAR Sandbox, 2026-11-03.

- Base commit: `650983c`.
- Original M2/06C ownership audit preserved.
- Rust contract and WASM unchanged.
- 23 state snapshots collected.
- Two buyers, two reserve providers, outsider caller.
- Unauthorized early releases rejected.
- Two funded tasks cancelled.
- Four collateralized offers released.
- Replay protection PASS.
- Ownership and financial conservation PASS.
- Native storage rebate withdrawal PASS.
- Initial free capital: 0.12000000 NEAR.
- Net storage growth: 2339 bytes.
- Storage stake growth: 0.02339000 NEAR.
- Net capital reduction: approximately 0.02251805 NEAR.
- Final free capital: approximately 0.09748195 NEAR.
- Final guarded capital: approximately 0.07700195 NEAR.
- Remaining recorded storage reserve: 0.24394000 NEAR.

The observed financial ledger remained conserved
through the tested releases and native withdrawal.

Recorded storage reserves remain protected as
liabilities in addition to actual storage stake.

All sampled states maintained nonnegative surplus.

Intermediate funding transitions were not all
sampled individually.

This is a bounded local lifecycle experiment,
not an exhaustive solvency or concurrency proof.

Optional regression:

`npm run sandbox:capital-lifecycle`

Next: classify consumed versus refundable storage
capital and model minimal-capital operation.

No production funds approved.

## M2/07C — Shadow storage reconciliation

- Base: `53ca3a9`.
- Local Sandbox shadow reconciliation PASS.
- 23 observed states.
- Hypothetical consumed storage: 0.02339 NEAR.
- Hypothetical unused reserve: 0.22055 NEAR.
- Conservative free capital: 0.09748195 NEAR.
- Shadow free capital: 0.12087195 NEAR.
- No on-chain economic or storage logic changed.
- No per-owner refund eligibility established.
- Shadow identity is algebraic, not a
  standalone security or solvency proof.

Optional regression:

`npm run sandbox:capital-shadow`

Proposed implementation requirements:

`docs/STORAGE_RECONCILIATION_ADR.md`

General storage refunds, migration and
production solvency remain unverified.
