# STATUS — Prime Radiant / Nomogenesis

**Current state:** M3-R4-04 authenticated worker reward lifecycle locally verified
**Date:** 2026-11-04
**Branch:** `feat/m2-escrow`
**Implementation starting commit:** `af9c518`

| Area | Verified state |
|---|---|
| M3-R2 funded jobs and mandates | SANDBOX PASS |
| M3-R3 provider funding and release | SANDBOX PASS |
| Deterministic capped-equal allocation | UNIT PASS |
| Atomic bundle award | UNIT + SANDBOX PASS |
| Shared M2/M3 capacity locking | UNIT + SANDBOX PASS |
| Full Rust regression | 242/242 PASS |
| Strict Clippy and compatible WASM | PASS |
| M2 primary, backup and settlement | SANDBOX PASS |
| M3-R2 lifecycle and R3 release | SANDBOX PASS |
| Component proofs / terminal settlement | UNIT + SANDBOX PASS / UNIT + SANDBOX PASS |
| Worker result and reward lifecycle | UNIT + SANDBOX PASS |
| Public testnet evidence | NOT VERIFIED |
| Independent security audit | NOT PERFORMED |
| Production funds | NOT APPROVED |

## M3-R4-04 — authenticated worker reward lifecycle

Base commit: `0f6d127`.

- Pure deterministic worker result verifier implemented.
- Current ExactCommitment and MinimumThreshold profiles retained.
- 8 pure validator tests PASS.
- 6 on-chain worker completion integration tests PASS.
- Full Rust regression: 208 + 11 + 17 + 6 = 242 PASS.
- Strict Clippy and rustfmt PASS.
- Fresh compatible WASM build PASS.
- WASM SHA-256: `f6b470b22a3c8c8e94187510e4de7e6123bf61913a2a16ccb7945d2abf1429f7`.
- Fresh local NEAR Sandbox worker lifecycle PASS.
- Four independent recovery cases created and settled.
- Two authenticated worker completions credited 50 units.
- Ten expired worker rewards refunded 250 units.
- Wrong signer, forged result, incorrect threshold,
  premature completion, deadline violation and replay rejected.
- Proof commitment checks and persisted state transitions PASS.
- After terminal bundle settlement:
  escrow 300 + claimable 156 = 456.
- After worker completion and expiry:
  escrow 0 + claimable 456 = 456.
- After native worker withdrawal:
  escrow 0 + claimable 436 + paid 20 = 456.
- Units above are 0.001 NEAR, excluding storage reserves
  and network transaction fees.
- Native withdrawal callback and claimable reduction PASS.
- R4-03 terminal settlement remains unchanged.
- Physical performance, public testnet and independent
  security audit NOT established.
- Production funds NOT approved.

Next: M3-R4-05 full M2/M3 regression and clean-checkout gate.

## M3-R4-03 — atomic on-chain terminal settlement

Base commit: `0866b77`.

- Permissionless settlement of awarded RecoveryRight bundles.
- 7 focused Rust integration tests PASS.
- Full regression: 194 + 11 + 17 + 6 = 228 PASS.
- Strict Clippy and rustfmt PASS.
- Compatible WASM build PASS.
- WASM SHA-256: `ae3c6f8e9742004d89b8b08c74ebf2f732b72a40879eb8ce0174b1eab02191b9`.
- Fresh local NEAR Sandbox: four independent cases PASS.
- Both proven, each single-default ordering and two defaults verified.
- Premature settlement and terminal replay rejected.
- Selected typed capacity locks cleared at settlement.
- Proven payloads preserved; worker rewards remain held.
- Settlement credits: 4 * 3Q = 144 economic units.
- Before withdrawal: escrow 300 + claimable 156 = 456.
- After native withdrawal: escrow 300 + claimable 136 +
  paid 20 = 456, all in 0.001 NEAR units.
- Native payout callback finalized; pending withdrawal zero.
- Measured settlement storage delta: -791 bytes.
- Storage reserves unchanged; standalone backing audit pending.
- First Sandbox attempt failed a net-balance assertion
  because transaction gas exceeded its tiny payout.
- Corrected test passed with a 20-unit native withdrawal.
- Public testnet and independent security audit NOT performed.
- Worker result and reward completion NOT implemented.

Next: M3-R4-04 authenticated worker result lifecycle.

## M3-R4-02 — pure terminal economics

Base commit: `0392d17`.

- Pure Rust deterministic terminal allocation implemented.
- 10 new settlement tests PASS.
- Full regression: 187 library + 11 market + 17 event +
  6 storage-ledger = 221 PASS.
- Strict Clippy and rustfmt PASS.
- Compatible WASM build PASS.
- WASM SHA-256: `6d3affd31a7cf271de959d1affa112b3166321a3c7aca351445c5ce2c6d07f71`.
- Success, both partial-default orders and full default tested.
- Exact 3Q credit conservation for terminal combinations.
- Checked u128 arithmetic and deterministic integer remainder.
- Positive sponsors only; exact selected provider bonds required.
- Legacy R1 pure model is not the R4 settlement authority.
- No on-chain settlement transaction implemented yet.
- No fresh Sandbox run for R4-02.
- No public testnet or independent security audit.

Next: M3-R4-03 atomic on-chain terminal settlement.

## M3-R4-01 — authenticated component proof

Base commit: `10338cf`.

- 177 library + 11 market + 17 event + 6 storage-ledger
  Rust tests = 211 PASS.
- Strict Clippy and rustfmt PASS.
- Compatible WASM and local NEAR Sandbox PASS.
- WASM SHA-256:
  `51466911e11d2c4df741d0aa86823e69d9fc472b113b8eb94a3bcef671f2055a`.
- Two distinct selected providers submitted valid committed
  payloads on deployed WASM.
- Forged, unauthorized, malformed and replayed proofs rejected.
- Both capacity locks remained held after proof.
- Awarded bundle remained open for terminal settlement.
- Rescue escrow 111 + claimable 3 = 114 economic units,
  unchanged by proof submission in this Sandbox fixture.
- Worker rewards and storage reserves unchanged.
- No terminal settlement or worker completion implemented.
- No public testnet or independent audit.
- Physical performance is NOT established by Merkle proof.
- Post-proof storage-byte growth needs separate measurement.

Next: M3-R4-02 deterministic terminal economic model.

## M3-R4-00 — design checkpoint

Authenticated component proof and terminal settlement rules specified in `docs/M3_R4_PROOF_AND_SETTLEMENT_SPEC.md`.
Documentation only; no R4 Rust implementation or Sandbox verification is claimed.
Next: M3-R4-01 bounded proof parser and authentication.

## Current gate — M3-R3-03B-02

Nine focused award tests passed, including successful award,
replay rejection, capped-equal allocation, refund conservation,
overflow rejection, time boundaries, insufficient caps,
M2/M3 slot conflict and persistence.

A fresh local NEAR Sandbox awarded fully bonded offers [2, 3]
for three accepted jobs. The winning bundle price was
12 units and the sponsor allocations were 4, 4 and 4.

The test rejected repeated award and release of selected offers,
then released the two unselected, under-bonded offers.

Economic conservation after release:
111 escrow + 5 claimable = 116 original principal.
Storage reserves remained unchanged in this scenario.

Rust regression: 172 library + 11 market + 17 event + 6
storage-ledger tests = 206 PASS.

WASM SHA-256: `d77817ae80f14bfdb1845f1151069e168dbcc107cc8bf0cc89e518499e25e8fc`.

The completed local Sandbox runs were M2 primary, backup,
settlement; M3-R2 lifecycle; M3-R3 offer release; and M3-R3
atomic award. Other historical Sandbox suites were not rerun
on this WASM.

## Next task

M3-R4-04: implement authenticated worker result validation
and the separate reward settlement lifecycle.

## Frissítési szabály

Record the actual commit SHA, test outputs, open limitations and one next
action. Historical milestones remain below.

## M1 Final Gate — PASS

2026-11-03: fresh Git checkout at b2d0a71.

- 75/75 Rust tests PASS.
- Compatible release WASM build PASS.
- SHA-256: 22f451680c7f4c8e62e69b467b6641c86c52402ee1f1755891a9a38cbb9b0cab
- Sandbox/01 primary lifecycle PASS.
- Sandbox/02 reserve success and failure PASS.
- Working tree CLEAN.
- Public testnet NOT VERIFIED.
- Escrow, collateral and withdrawals NOT IMPLEMENTED.

## Next task

M3-R2-02B: atomic funded rescue job plus mandate, worker acceptance,
authenticated views and exact attached-deposit validation.

## Frissítési szabály

Minden új mérföldkőnél rögzíteni kell a pontos commitot,
lefuttatott parancsokat, bizonyított PASS/FAIL eredményeket
és a még NEM igazolt állításokat. A dokumentációs commit
SHA-ja eltérhet a fent megjelölt auditált Rust checkpointtól.

## M2/02A — Funding implementation

- 89 Rust unit tests PASS.
- Clippy and WASM checks PASS.
- Local funding sandbox PASS.
- Native NEAR attached deposits verified in sandbox.
- Buyer budget and reserve collateral persist.
- Financial withdrawal and terminal settlement NOT IMPLEMENTED.
- Storage reserve is provisional, not measured.
- Not approved for production funds.


## M2/03B — Terminal settlement verified locally

- Base commit: `67585d4`.
- 95/95 Rust tests PASS.
- Clippy and WASM checks PASS.
- Local Sandbox/01, /02, /03, /04 PASS.
- Four funded settlement paths verified on local NEAR Sandbox.
- 192 yoctoNEAR of economic deposits fully accounted.
- Keeper activation does not create early credit.
- Replayed terminal settlement rejected.
- External transfers NOT IMPLEMENTED.
- Exact storage accounting NOT IMPLEMENTED.
- Public testnet NOT VERIFIED.
- Production funds NOT APPROVED.


## M2/04D — Native withdrawal and callback checkpoint

- Base commit: `984da8d`.
- 103 Rust unit tests, including eight withdrawal tests.
- Local NEAR Sandbox/01 through /06 integrated.
- Three native withdrawal transfers, totaling 1.9 NEAR, verified.
- 2.9 NEAR remained as internal claimable balances.
- Successful payout callbacks removed pending obligations.
- Failed native transfer recovered credit via callback.
- Failure scenario used a separate fault-injected test WASM.
- Zero/oversized/foreign withdrawals rejected.
- Private callback access enforced.
- Replay tests verified in Rust unit tests.
- Provisional storage backing only; exact cost NOT VERIFIED.
- Production deployment NOT APPROVED.
- No public testnet, independent audit or migration verification.


## M2/05A — Storage audit checkpoint

- Real local NEAR Sandbox storage measurements.
- 15 lifecycle checkpoints.
- Persistent growth: 1535 bytes.
- Four provisional reserves: 8192 bytes.
- Reserve-versus-growth difference: 6657 byte-equivalent.
- Difference is NOT yet validated as refundable.
- Unfunded task/offer creation allows unpaid storage growth.
- Required next milestone: paid creation admission gates.
- Production funds NOT APPROVED.


## M2/05C — Paid storage admission

- Base commit: `e9c9c9a`.
- Rust tests: 106/106 PASS.
- Eight local NEAR Sandbox suites integrated.
- Task and offer creation require storage prepayment.
- Storage bond payer and amount persisted per record.
- Invalid deposits reject writes before ID allocation.
- Sandbox/08 tests 12 invalid creation attempts.
- Economic escrow and payouts remain separate.
- New measured persistent storage growth: 1930 bytes.
- Eight provisional storage reserves: 16384 byte-equivalent.
- Exact storage refunds NOT IMPLEMENTED.
- Historic deployed-state migration NOT VERIFIED.
- Independent economic security review NOT DONE.
- Production funds NOT APPROVED.


## M2/05D — Low-capital solvency regression

- Base commit: `26579ef`.
- 106 Rust unit tests.
- Nine local NEAR Sandbox integrations.
- Contract baseline: 314430 storage bytes.
- Baseline storage stake: 3.1443 NEAR.
- Scenario A: 0.06 NEAR additional operating capital.
- Scenario A: 0.5 NEAR withdrawal succeeded.
- Scenario B: 0.015 NEAR additional operating capital.
- Scenario B: withdrawal backing guard rejected payment.
- Failed attempt preserved the original customer claim.
- These are two measured scenarios, not global bounds.
- Storage prepayments remain nonrefundable.
- Current withdrawal guard includes both storage reserves
  and the full measured storage stake.
- Exact storage refund accounting NOT IMPLEMENTED.
- Public testnet and independent security audit NOT DONE.
- Production funds NOT APPROVED.


## M2/06B — Scoped storage rebate

- Base checkpoint: `ae554a4`.
- 108 Rust unit tests.
- Ten local NEAR Sandbox integration suites.
- Refund applies only when an unselected funded offer
  releases its collateral storage record.
- Measured first release: -5 bytes, 0.00005 NEAR credit.
- Measured second release: -88 bytes, 0.00088 NEAR credit.
- Refund attribution: original reserve funding owner.
- Refund limited to net freed storage and the original
  collateral-record storage contribution.
- Repeated release rejected; balances remain unchanged.
- Storage reserves plus claimable obligations conserved.
- Task and offer creation bonds remain held.
- Other funding storage reserves remain held.
- Exact general refund accounting NOT IMPLEMENTED.
- Public testnet, migration and external audit NOT DONE.
- Production funds NOT APPROVED.


## M2/06C — Cross-owner refund audit

- Base commit: `10db9d7`.
- Rust code unchanged: 108 unit tests.
- Eleventh local NEAR Sandbox suite registered.
- Two independent buyers and two reserve providers.
- Unauthorized early offer release rejected.
- External caller may release offers after task cancellation.
- Collateral and storage rebates credited to the
  original reserve provider, never the external caller.
- Other providers' and buyers' balances unchanged.
- Replayed releases leave storage and balances unchanged.
- Native withdrawal of a storage rebate verified.
- Five tested release orders PASS, from 24 possible.
- Four alternate orders available via
  `npm run sandbox:ownership-orders`.
- Both providers received 0.00091 NEAR in each
  tested multi-owner ordering.
- General storage ownership and solvency NOT PROVEN.
- No public testnet or independent audit.
- Production funds NOT APPROVED.

## M2/07A — Capital drift measurement

Local NEAR Sandbox, 2026-11-03.

- Starting commit: `dd93929`.
- Rust and compatible WASM unchanged.
- Six sequential task creation transactions PASS.
- Initial free capital: 0.08000000 NEAR.
- Six creation bonds: 0.12288000 NEAR.
- Persistent storage growth: 1883 bytes.
- Actual storage stake growth: 0.01883000 NEAR.
- Additional contract balance inflow: approximately
  0.00018419 NEAR.
- Net free capital reduction: approximately
  0.01864580 NEAR.
- Remaining free capital: 0.06135419 NEAR.
- Remaining capital after payout buffer:
  0.04087419 NEAR.

The entire creation bond remains recorded as a
storage reserve liability while actual allocated
storage separately increases the backing requirement.

This causes measured free-capital consumption despite
the user's storage prepayment.

The test accounts for additional observed contract
balance inflows rather than assuming exact equality
between attached deposits and balance changes.

This is one measured workload, not a universal
capital bound or proof of insolvency.

The audit is optional and is not yet part of the
eleven-suite default Sandbox regression.

Run independently:

`npm run sandbox:capital-drift`

Next: classify permanently consumed storage capital,
refundable balances and retained-record ownership
across mixed terminal and withdrawal lifecycles.

Production funds remain NOT APPROVED.

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

## M2/07D/1 — Pure Rust storage ledger model

Base commit: `4eb25a7`.

An isolated Rust arithmetic model has been created in:

- `src/storage_ledger_model.rs`
- `tests/storage_ledger_spec.rs`

Six new tests PASS. The existing 108 Rust unit tests
remain unchanged and PASS.

The model tracks payer, original contribution,
consumed capacity, unused capacity and simulated
released credit for four record categories.

Its accounting invariant is:

total = consumed + unused + released

This model does not modify the NEAR contract state,
WASM interface, withdrawal guard or escrow ledger.

Security limitations:

- Release eligibility is not authenticated.
- Storage deltas are not independently authenticated.
- Shared storage attribution remains unresolved.
- Future storage growth has no proven upper bound.
- Repeated partial simulated credits are not
  protected by a trusted one-time event identity.
- Caller-provided event IDs alone would not
  constitute sufficient replay protection.
- State migration remains unimplemented.

Next: M2/07D/2 — event identity, replay protection,
trusted storage attribution and adversarial tests.

No production funds approved.

## M2/07D/2 — Isolated event replay guard

Base commit: `e123e15`.
Date: 2026-11-03.

New files:

- `src/storage_event_guard.rs`
- `tests/storage_event_guard_spec.rs`

Verified local results:

- Seven event guard tests PASS.
- Thirteen tests in combined event guard target PASS.
- Six original storage ledger tests PASS.
- 108 existing contract unit tests PASS.
- Clippy, formatting and WASM target checks PASS.

Verified model properties:

- An identical event ID cannot be processed twice.
- Reusing an ID against another owner is rejected.
- Payer mismatch is rejected.
- Invalid arithmetic does not mutate the ledger.
- Failed operations do not consume event IDs.
- Processed restore events cannot be replayed.
- Tested balances preserve ledger conservation.

These tests verify an isolated arithmetic and
event bookkeeping model, NOT NEAR authorization.

Remaining security gaps:

1. Event authenticity is not established.
2. Distinct event IDs can describe the same physical
   storage change; global byte uniqueness is unproven.
3. Unused capacity alone does not prove refund
   eligibility or finality of a record.
4. The event source is simulated in unit tests.
5. The in-memory BTreeSet and full Book cloning are
   not approved on-chain persistence/gas strategies.
6. Allocation of shared storage and future mutation
   capacity remains unresolved.
7. Persistent state migration remains unimplemented.

The current contract storage backing and withdrawal
rules must remain unchanged.

Next gate: M2/07D/3 — derive event provenance from
trusted state transitions, measure actual storage
deltas, and prevent double attribution even when
different event IDs are presented.

Production funds remain NOT APPROVED.

## M2/07D/3 — Canonical offer finality and provenance

Base commit: `8730a6c`.
Date: 2026-11-03.

### Isolated Rust model — M2/07D/3A

- Canonical key: OfferFunding(offer_id).
- The first successful simulated credit finalizes
  that funding record in the isolated model.
- Further allocation, restoration or credit against
  that record is rejected, even with another event ID.
- Failed credit does not finalize the record.
- Other offer funding records remain independent.
- TaskFunding finality is NOT defined by this gate.
- 17 tests PASS in the event-guard test target.

The in-memory model is not connected to NEAR state.
Its terminal credit does not independently establish
the entitlement or completeness of a real refund.

### Real NEAR Sandbox — M2/07D/3B

- Two buyers, two reserve providers, one outsider.
- Four funded offers released after task cancellation.
- Four distinct-account replay attempts rejected.
- Original provider receives collateral and rebate,
  regardless of which eligible actor triggers release.
- Four released offer collateral records are absent.
- Unreleased offers remain available and funded.
- Measured net storage reductions: 3, 3, 88, 88 bytes.
- Total measured release reduction: 182 bytes.
- Total storage rebate: 0.00182 NEAR.
- Cross-owner financial accounting PASS.
- Native rebate withdrawal PASS.

The Sandbox checks the CURRENT contract's existing
offer state machine, not integration of the new ledger.

### Limitations

- Source and destination of every shared storage byte
  are not yet independently attributed.
- The physical storage delta cannot be submitted as
  an arbitrary caller-provided credit entitlement.
- An event ID is not evidence of storage release.
- Other record categories have no general finality
  and refund policy.
- New persistent structures, gas costs, contract
  state migration and minimal-capital operation
  remain unverified.

No changes to the contract's withdrawal backing
rule or persistent NEAR state were made.

Optional Sandbox regression:

`npm run sandbox:provenance`

Next: design the trusted transition-to-ledger bridge,
including exact allocation boundaries and persistent
storage cost attribution.

Production funds remain NOT APPROVED.

## M2/07E/1 — Raw NEAR storage key attribution

Base commit: `8e3a580`.
Local NEAR Sandbox, 2026-11-03.

Four funded, unselected offers were released.
Raw persisted key/value differences were inspected
through NEAR Sandbox view_state.

Measured results:

- Four offer funding records deleted.
- Each deleted record occupied 88 bytes.
- Total deleted storage: 352 bytes.
- First claimable creation for each provider:
  85 bytes.
- Two new claimable records: 170 bytes.
- Existing claimable updates added zero bytes.
- Net storage released: 182 bytes.
- Storage rebates: 0.00182 NEAR.
- Raw KV deltas matched storage_usage changes.
- Four cross-caller replay attempts rejected.
- Original reserve providers received the credits.
- Native refund withdrawal PASS.

Specific release deltas: 3, 3, 88, 88 bytes.

The 85-byte claimable allocation depends on the
tested account identifiers and storage encoding.
It is not a universal constant.

The observed 40-byte per-key overhead was checked
against the measured NEAR storage_usage delta.

This is read-only external storage inspection.
The contract does not expose raw storage keys.

The audit proves exact attribution of the inspected
key changes in this local scenario, not ownership
of all shared or future storage allocations.

Rust contract, persistent state and WASM unchanged.

Optional regression:

`npm run sandbox:storage-keys`

Next: M2/07E/2 — per-transition storage cost
attribution, including retained records, shared
writes and future mutation capacity.

The isolated storage ledger is not on-chain.
General storage refunds are not approved.
Production funds remain NOT APPROVED.

## M2/07E/2A — Complete storage transition matrix

Base commit: `387dff9`.
Local NEAR Sandbox, 2026-11-03.

### Verified physical measurements

- 21 successful state transitions instrumented.
- Each raw KV delta reconciled against storage_usage.
- Total persistent growth: 2339 bytes.
- Difference between reconstructed and actual
  storage usage: zero bytes.
- Four funded offer records deleted.
- Four cross-caller replay attempts rejected.
- Native refund withdrawal PASS.
- Existing contract WASM unchanged.

### Retained storage after lifecycle

| Category | Records | Bytes |
|---|---:|---:|
| Tasks | 2 | 334 |
| Task creation bonds | 2 | 186 |
| Task funding | 2 | 270 |
| Offers | 4 | 460 |
| Offer creation bonds | 4 | 384 |
| Settlement markers | 2 | 112 |
| Claimable balances | 4 | 336 |
| Shared or unknown | 1 | 257 |
| TOTAL | 21 | 2339 |

Named record categories account for 2082 bytes.
The remaining 257 bytes were classified as
shared_or_unknown, not assigned to a customer.

### Transaction groups

- Task creation: +777 bytes, including 257 bytes
  classified as shared_or_unknown.
- Task funding: +270 bytes.
- Primary acceptance: 0 net bytes.
- Offer posting: +844 bytes.
- Offer funding: +352 bytes.
- Task cancellation: +278 bytes.
- Offer release: -182 bytes.
- Native withdrawal: 0 net bytes.

Total: +2339 bytes.

All amounts above describe the tested workload.

### Attribution boundary

Physical storage ownership and contractual
cost-bearing responsibility are different.

The presence of a payer's creation bond does
not establish that all subsequent storage for
that task or offer is refundable.

The claimable record's beneficiary does not
automatically establish who finances its
persistent storage.

The 257-byte shared_or_unknown allocation
must not be arbitrarily assigned to the first
task creator merely because that transaction
first created the record.

Retained audit, terminal, funding and bond
records may require long-term storage backing.

The model does not establish future mutation
bounds, migration safety, universal storage
costs or general refund eligibility.

### Regression

`npm run sandbox:transition-matrix`

Next: M2/07E/2B — explicitly define funding
responsibility by record category and prove
that refundable capacity remains protected
against future storage obligations.

The current contract remains unchanged.
No general refund authorization is granted.
Production funds remain NOT APPROVED.

## M2/07E/2B/1 — Isolated storage cost policy

Base commit: `0c16b18`.
Date: 2026-11-03.

### Evidence

A fresh 21-transition NEAR Sandbox matrix was
processed by the isolated cost-policy model.

Verified results:

- 12 independently tracked storage contributions.
- Each contribution preserves:
  total = consumed + unused + released.
- Five manipulated scenarios rejected.
- Physical storage reconciliation PASS.
- Rust contract and WASM unchanged.

### Model totals

| Component | Byte-equivalent |
|---|---:|
| Original storage contributions | 24576 |
| Attributed persistent customer storage | 2082 |
| Hypothetical unused capacity | 22312 |
| Previously released credit | 182 |
| Separate shared storage | 257 |

Accounting:

24576 = 2082 + 22312 + 182

2339 = 2082 + 257

Existing on-chain storage reserve after the
tested rebates is 24394 byte-equivalent.

The proposed accounting split is:

24394 = 2082 + 22312

### Proposed cost-bearing assumptions

- Task creation bond covers task record
  and task creation bond storage.
- Task funding bond covers task funding,
  settlement marker and buyer claimable creation
  in this tested unmatched lifecycle.
- Offer creation bond covers offer record
  and offer creation bond storage.
- Offer funding bond covers its original
  funding record until deletion.
- The first provider claimable creation is
  provisionally charged to the corresponding
  offer funding bond.
- Shared storage remains separately backed.

These are design assumptions, not established
refund entitlements.

### Security limitations

- Future storage obligations are not bounded.
- Different lifecycle outcomes may have
  different storage requirements.
- Storage costs can depend on account and slot
  identifier lengths.
- Claimable ownership does not automatically
  establish storage cost responsibility.
- The model parses Sandbox evidence and uses
  expected fixture values; it is not itself
  an authenticated on-chain ledger.
- Adversarial tests demonstrate rejection of
  the tested mutations, not exhaustive security.
- General refunds and migration remain unproven.
- No new withdrawal or payout rights are enabled.

Optional regression:

1. npm run sandbox:transition-matrix
2. npm run sandbox:cost-policy -- /path/to/log

Next: M2/07E/2B/2 — future mutation reserve,
global backing invariants and zero-capital stress.

Production funds remain NOT APPROVED.

## M2/07E/2B/2A — Global backing stress model

Base commit: `5149b76`.
Date: 2026-11-03.

### Verified evidence

- 21 successful Sandbox storage transitions.
- 22 backing samples, including baseline.
- Actual account balances and physical storage.
- Current economic, collateral, claimable,
  pending and storage reserve liabilities.
- Conservative backing guard reconstructed.
- Hypothetical consumed/unused backing model.
- Five adversarial input mutations rejected.
- Rust contract and WASM unchanged.

### Final accounting

Measured physical storage growth: 2339 bytes.

Attributed consumed storage: 2082 bytes.
Shared storage: 257 bytes.
Unused contribution capacity: 22312 bytes.
Previously credited storage refunds: 182 bytes.

Recorded remaining storage reserve:
24394 byte-equivalent.

The observed accounting identities hold:

2339 = 2082 + 257

24394 = 2082 + 22312

### Treasury margin scenarios

All margins below are counterfactual.
They reduce the starting treasury balance while
preserving observed transaction balance changes.

| Margin | Conservative | Shadow |
|---|---|---|
| 0 NEAR | FAIL | FAIL |
| 0.015 NEAR | FAIL | FAIL |
| 0.060 NEAR | PASS | PASS |
| 0.120 NEAR | PASS | PASS |

Approximate implied minimum initial margins
for the sampled transition trace:

Conservative: 0.04514410 NEAR.
Shadow: 0.02302421 NEAR.

These are conditional model thresholds,
NOT proven safe funding requirements.

### Future capacity test

The model tested incremental consumption of
unused capacity without new storage deposits.

The following requests were algebraically
covered within the simulated reserve:

0, 2048, 4096, 8192 and 22312 bytes.

A 22313-byte request exceeded the modeled
22312-byte unused capacity and was rejected.

The assumed future minimum was 2048 bytes.
This is a test parameter, not a proven upper
bound for future legitimate state changes.

Converting unused storage reserves to an
equal claimable liability does not by itself
create free capital.

### Unresolved security boundaries

- Actual low-margin Sandbox deployments
  have not been run for these scenarios.
- No universal future storage growth bound.
- No proof of every lifecycle and callback.
- The shadow split is not persisted on-chain.
- Model calculations use a fixed verified
  transaction trace and known fixture categories.
- Storage ownership and refund entitlement
  remain separate questions.
- No migration safety proof.
- No permission to relax withdrawal backing.
- No general refund authorization.

### Regression

1. npm run sandbox:backing-probe
2. npm run sandbox:backing-stress -- /path/to/log

Next: M2/07E/2B/2B — actual low-margin
Sandbox deployments, native payout checks
and alternative lifecycle stress.

Production funds remain NOT APPROVED.
