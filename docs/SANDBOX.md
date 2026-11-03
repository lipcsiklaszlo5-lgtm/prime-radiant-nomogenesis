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

`npm run test:sandbox` runs nine independent local suites.

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
