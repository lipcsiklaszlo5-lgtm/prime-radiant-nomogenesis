# STATUS — Prime Radiant

**Aktuális fejlesztési állapot:** M2/07D/3 — canonical offer provenance, 2026-11-03

| Mező | Ellenőrzött állapot |
|---|---|
| Projekt | Prime Radiant — Economic Commitment Protocol / Nomogenesis |
| Repozitórium | https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis |
| Fejlesztési ág | `feat/m2-escrow` |
| Előző rögzített checkpoint | `8730a6c` — M2/07D/2 |
| Állapotgép | Minden tervezett fő M1 életciklus implementálva |
| Merkle-bizonyítás | Taskhoz kötött SHA-256 ellenőrzés implementálva |
| Kapacitásfoglalás | Kizárólagos provider/slot foglalás és lezárás |
| Natív Rust unit tesztek | **108 PASS, 0 FAIL** |
| Mockolt NEAR storage reload | PASS — 2 célzott teszt |
| Terminális állapotok auditja | PASS — 6 állapot, 7 új teszt |
| `cargo check --locked --target wasm32-unknown-unknown` | PASS |
| `cargo clippy --locked --all-targets -- -D warnings` | PASS |
| NEAR-kompatibilis release WASM | PASS |
| Helyi NEAR Sandbox tranzakciók | PASS — 11 integrációs csomag |
| Native NEAR withdrawal és callback | PASS — success + fault-injected failure on local sandbox |
| Testnet tranzakciók / receipts | NOT VERIFIED |
| Gazdasági escrow és belső settlement | PASS — local sandbox |
| Storage reserve és refund | Scoped unselected-offer rebate PASS locally; general refunds NOT VERIFIED |
| Python V2 referenciateszt | 95/95 PASS korábbi független audit alapján |
| Gazdasági optimalizációs fölény | NOT PROVEN |
| Hackathon nevezés kész | NO |

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

Next: exact storage accounting, refund lifecycle, and economic security audit.
No production funds before these controls are verified.

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
