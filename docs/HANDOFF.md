# Élő munkamenet-átadás — minden fejlesztési session végén frissítendő

## Current M3 checkpoint — 2026-11-04

- Branch: `feat/m2-escrow`
- Base: `c719804`
- M3-R2 funded liability and multi-party Sandbox: COMPLETE
- M3-R3-01A typed capacity registry: verified
- Focused capacity tests: 5 PASS
- Full Rust suite: 173 PASS
- Clippy and compatible WASM build: PASS
- WASM SHA-256: `c8999ddd7792eeee516c2f372303bd4632fe653909762379bb100c7ec2efc034`
- M2 primary, backup and settlement Sandbox suites: PASS
- M3-R2 multi-party Sandbox on this WASM: PASS
- M2 selection writes a typed `M2Offer` lock
- A simulated M3 lock blocks M2 selection in a Rust test
- M2 terminal paths remove only the matching typed owner
- Typed ownership survives state reload
- Preserve untracked: `sandbox/real_low_margin_audit.cjs`
- Real M3 offer and bundle endpoints: not implemented
- Next single action: M3-R3-01B zero-liability offer and bundle schema

The shared capacity registry is present on fresh contract state. Real
cross-market M3 slot locking can be tested once the M3 offer and award
endpoints exist.

## Munkamenetindító parancsok

```bash
git status -sb
git log --oneline -8
find . -maxdepth 3 -type f | sort | head -100
# A megfelelő cargo parancs csak akkor használható, ha létezik Cargo.toml:
# cargo test --workspace
```

## A munkamenet lezárásakor kötelezően kitöltendő

```text
Dátum és chat / ticket:
Felhasznált branch és induló commit SHA:
Módosított fájlok:
Döntés / ADR-ID:
Lefuttatott parancsok és pontos PASS/FAIL:
Új regressziós tesztek:
Git diff és elkészült commit SHA:
Nyitott hibák (ticket ID):
Bizonyított, NEM bizonyított:
Következő egyetlen lépés:
```

## Session napló (append-only)

### 2026-11-04 — M3-R3-01A typed capacity registry

- Base: `c719804`.
- Typed capacity owners: `M2Offer` and `M3RescueOffer`.
- Existing M2 `slot_holder` view preserved; typed owner view added.
- Simulated M3 ownership blocks M2 selection before mutation.
- M2 terminal paths release the exact typed M2 owner.
- Typed owner survives state reload.
- Two builder-anchor failures and their repairs are in the worklog.
- Five focused capacity tests passed.
- Full suite: 139 unit + 11 rescue-model + 17 storage-event + 6 storage-ledger = 173 passed.
- Format, Clippy, compatible WASM and diff checks passed.
- M2 primary, backup and settlement Sandboxes passed.
- M3-R2 multi-party Sandbox passed on the changed WASM.
- WASM SHA-256: `c8999ddd7792eeee516c2f372303bd4632fe653909762379bb100c7ec2efc034`.
- Real M3 offer, bundle and award are not implemented.
- Next: M3-R3-01B zero-liability offer and bundle schema.

### 2026-11-04 — M3-R3-00 provider market design

- Base: `643e19c`.
- Locked the funded provider-offer and bond-capacity model.
- Defined the atomic RecoveryRight creation boundary.
- Award caller supplies only the case ID.
- Provider pair, price, sponsors and allocations are contract-derived.
- Selected providers are distinct and each locks full bundle price `Q`.
- Defined capped-equal mandate locking and unused-cap credit.
- Defined selected-provider excess-bond credit.
- Chose one typed M2/M3 capacity registry on fresh state.
- Defined storage ownership and terminal offer-release paths.
- Added ADR-011 and ADR-012.
- Documentation-only checkpoint; no Rust or Sandbox claim.
- Next: M3-R3-01 zero-liability persistent schema.

### 2026-11-04 — M3-R2-04 multi-party Sandbox

- Base: `3bfb9cb`.
- Built compatible release WASM successfully.
- WASM SHA-256: `ab129cc27fa133a29412e6198bc550e6bc81cf4ff24b37790362727d120e1a03`.
- Deployed a fresh contract to local NEAR Sandbox.
- Created one canonical case with three buyers and three workers.
- Rejected case-storage and job-funding underpayments on-chain.
- Persisted exactly 0.09 NEAR of M3 economic principal.
- Rejected outsider worker acceptance.
- All three designated workers accepted through separate accounts.
- One buyer revoked its cap; two caps expired permissionlessly.
- Three accepted jobs expired permissionlessly.
- Terminal replay attempts were rejected.
- `rescue_escrow` closed at zero.
- Claimables reached 0.09 NEAR before withdrawal.
- A 0.02 NEAR native withdrawal completed with callback.
- Observed recipient balance increase: 0.010718153802558651764660 NEAR after transaction costs.
- Remaining claimables: 0.07 NEAR; pending payouts: zero.
- Economic identity: 0.02 paid + 0.07 claimable + 0 escrow = 0.09 NEAR.
- Storage reserves remained separate and unchanged.
- Next: M3-R3-00 provider offers, bonds and atomic bundle-award design.

### 2026-11-04 — M3-R2-03B permissionless expiry

- Base: `a083eb2`.
- Added permissionless unaccepted-job expiry at the dependency deadline.
- Added permissionless open-mandate release at award close.
- Added permissionless accepted-job expiry at the final job deadline.
- Pre-deadline actions use `<`; matching expiry paths use `>=`.
- Unaccepted expiry releases reward and only a still-held cap.
- Award expiry releases only an open, unlocked cap.
- Accepted-job expiry releases reward independently from mandate state.
- Locked mandates remain protected for future bundle settlement.
- Expiry callers cannot redirect value from the immutable buyer.
- Replays and claimable overflow preserve persistent economic state.
- Permissionless terminal state and totals survive reload.
- Focused expiry tests: 7 passed, 0 failed.
- Full Rust suite: 168 passed, 0 failed.
- Clippy, WASM target check and diff check passed.
- Preserve: `sandbox/real_low_margin_audit.cjs`.
- Next: M3-R2-04 multi-party local NEAR Sandbox reproduction.

### 2026-11-04 — M3-R2-03A manual liability release

- Base: `f19bad9`.
- Added buyer-only cancellation of unaccepted rescue jobs.
- Added buyer-only revocation of open rescue mandates.
- Cancellation releases held worker reward and any still-open cap.
- A previously revoked cap is not credited again during cancellation.
- Accepted jobs cannot be cancelled through the unaccepted-job path.
- Mandate revocation leaves the funded or accepted worker job intact.
- Every successful release decreases `rescue_escrow` by the credited amount.
- Foreign callers, replays and claimable overflow preserve economic state.
- Terminal job, mandate and claimable state survives reload.
- Focused release tests: 6 passed, 0 failed.
- Full Rust suite: 161 passed, 0 failed.
- Clippy, WASM target check and diff check passed.
- Preserve: `sandbox/real_low_margin_audit.cjs`.
- Next: M3-R2-03B permissionless deadline expiry.

### 2026-11-04 — M3-R2-02B atomic funded job and mandate

- Base: `df44175`.
- Added atomic creation of a funded rescue job and its bounded rescue mandate.
- Exact deposit covers worker reward, rescue cap and the 576-byte storage quote.
- Buyer identity, worker identity, deadlines, result profile and commitments are validated before mutation.
- Duplicate buyer participation and the seventh case job are rejected.
- Only the designated worker may accept before the dependency deadline.
- Acceptance changes job state without changing economic liability.
- Malformed and overflowing inputs leave IDs, collections and totals unchanged.
- Job, mandate and M3 totals survive state reload.
- Measured job-plus-mandate write: 307 bytes against a 576-byte quote.
- Focused funding tests: 6 passed, 0 failed.
- Full Rust suite: 155 passed, 0 failed.
- Clippy, WASM target check and diff check passed.
- Preserve: `sandbox/real_low_margin_audit.cjs`.
- Next: M3-R2-03 cancellation, revocation and expiry with one-time liability release.

### 2026-11-04 — M3-R2-02A canonical case and quote

- Base: `b9e53f1`.
- Added typed immutable rescue-case descriptors.
- Case IDs bind the descriptor hash to the contract account.
- Added bounded storage quotes derived from exact record and key sizes.
- Initial case write measured 256 bytes against a 893-byte quote.
- Future job-plus-mandate quote is 576 bytes.
- 149 Rust tests, Clippy, WASM target and diff checks passed.
- No M3 economic principal was accepted.
- Next: M3-R2-02B atomic funded job plus mandate.


### 2026-11-04 — M3-R2-01 zero-liability schema

- Base: `b3eb084`.
- Added bounded rescue case, job and mandate records.
- Added zero-initialized `rescue_escrow` and empty M3 collections.
- Withdrawal backing now includes active M3 principal.
- Fixed overflowing offer-pair admission so one invalid pair cannot block a valid bundle.
- 145 Rust tests, Clippy, WASM target check and diff check passed.
- No M3 funding endpoint or real Sandbox storage quote was introduced.
- Next: M3-R2-02 atomic funded job plus mandate.


### 2026-11-04 — M3-R0B governance alignment

- M3-R0 base commit: aceae9b.
- PROJECT_MASTER, STATUS and AGENTS aligned with the rescue-market specification.
- Existing M2 source and historical evidence remain unchanged.
- No Rust, Sandbox or testnet test was run.
- Next: review and commit M3-R0, then start M3-R1.


### 2026-11-04 — M3-R0A product and executable spec

- Base commit: aceae9b.
- Replaced the old collateral-reuse-first product direction.
- Added bounded payload, allocation, clearing and settlement rules.
- Added ADR-007 through ADR-009.
- No Rust, Sandbox or testnet test was run.
- Next: M3-R0B governance-document alignment.


### 2026-11-04 — M3-00 continuity workflow

- Checkpoint: 5a1b6ff
- Tracked worktree clean.
- audit file preserved.
- Worklog path established.
- Next: M3-R0; no scaffold before reconciliation.


### 2026-11-03 — Context pack létrehozva

A különálló korábbi Python prototípusokat és független auditot feldolgozva az új Rust-repo számára önmagát magyarázó kormányzó dokumentumok készültek. **Nem történt Rust implementáció, Git commit, Codespaces build vagy NEAR-tranzakció ebben a munkamenetben.**

### 2026-11-03 — GitHub repo és Codespaces állapot ellenőrizve (commit előtt)

Repo: https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis (public). A felhasználó a `main` branch-en megnyitotta a Codespaces-t asztali VS Code-ban. A dokumentumok telepítését, commitját és tesztjét a következő terminálkimenettel kell igazolni; ezen csomag **önmagában nem bizonyít commitot**.

### 2026-11-03 — M0 projektmemória rögzítve

- Commit: `ce9c9e4a5e13e89d06f0f30c3673de8318564323`.
- 11 Markdown-fájl sikeresen commitolva és pusholva.
- GitHub-kapcsolaton keresztül a commit és a fájllista ellenőrizve.
- Codespaces working tree a commit után: `CLEAN`.
- Rust build, funkcionális teszt vagy NEAR-tranzakció még nem történt.
- Következő feladat: M0 protokollspecifikáció.

### 2026-11-03 — M1 Rust checkpoint

- Branch: `feat/m1-near-contract`.
- Commit: `129e8a8beaf88f45e2c80300770d90ce14eb9ada`.
- Megépítve: objektív Merkle-proof ellenőrző, task létrehozás, kijelölt primary elfogadás.
- Natív Rust unit tesztek: 12 PASS, 0 FAIL.
- `cargo check --locked --target wasm32-unknown-unknown`: PASS.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- NEM igazolt: NEAR sandbox, telepíthető szerződés,
  escrow, fedezet, backup aktiválás, valódi lánctranzakció.
- A proof view metódus jelenleg hívótól kapott rootot
  vizsgál; még nincs task állapotához kötve.
- Következő: tartalékajánlat + kizárólagos slot-foglalás.


### 2026-11-03 — M1 állapotgép és regressziós audit lezárása

- Ellenőrzött Rust commit: `01996a3d12e229ec3edb819c683defb60d90e13b`.
- Funkciók: task / offer / slot-lock / primary proof /
  backup activation / reserve proof / minden fő lezárási út.
- 75 sikeres natív Rust unit teszt.
- 2 mock storage-reload teszt és 7 terminális audit-teszt
  része a 75 tesztnek, nem hozzáadandó új eredmény.
- `cargo check --locked --target wasm32-unknown-unknown`: PASS.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- `git diff --check`: PASS.
- Még nem történt bizonyított sandbox-telepítés,
  testnet-tranzakció vagy gazdasági settlement.
- Következő: release WASM build, majd sandbox-integráció.

### 2026-11-03 — M1 Final Gate PASS

- Clean checkout: b2d0a71.
- Rust: 75/75 PASS.
- Both real local NEAR sandbox suites PASS.
- Compatible WASM SHA-256: 22f451680c7f4c8e62e69b467b6641c86c52402ee1f1755891a9a38cbb9b0cab
- No testnet receipts or economic settlement.
- Next: M2 deterministic accounting core.

### 2026-11-03 — M2 funding checkpoint

- Base commit: 684782c.
- On-chain buyer and reserve funding methods added.
- Six additional Rust tests PASS.
- Third sandbox funding integration PASS.
- Pending: terminal ledger, refunds, withdrawals, callback replay protection, storage measurement.


### 2026-11-03 — M2/03 terminal ledger checkpoint

- Base commit: `67585d4`, branch `feat/m2-escrow`.
- Rust 95/95 PASS; Clippy and WASM PASS.
- Four local NEAR sandbox suites PASS.
- Terminal claims and collateral slashing verified on-chain.
- Conservation: 192 yoctoNEAR across four funded tasks.
- Storage accounting remains provisional.
- Withdrawals and async callbacks not implemented.
- Next: M2/04 withdrawal and storage security.


### 2026-11-03 — M2/04D withdrawal checkpoint

- Base: `984da8d`, branch `feat/m2-escrow`.
- 103/103 Rust tests, Clippy, compatible WASM PASS.
- Six local NEAR sandbox suites integrated.
- Native payout success and callback finalization verified.
- Fault-injected native transfer failure and callback recovery verified.
- Double callback does not recreate credit in unit tests.
- Failure-injection harness restores original source and WASM.
- Exact storage liability and refund lifecycle NOT VERIFIED.
- Public testnet and independent security review NOT DONE.
- Next: exact storage accounting and liability invariants.


### 2026-11-03 — M2/05A storage measurement

- Base: `8cc009c`, branch `feat/m2-escrow`.
- Fifteen real local Sandbox storage checkpoints PASS.
- Persistent net growth: 1535 bytes.
- Current provisional storage reserves: 8192 bytes.
- Excess storage reserve must NOT yet be refunded.
- Unpaid create_task/post_offer storage growth is a
  confirmed design gap.
- New design: docs/STORAGE_POLICY.md.
- Next: require funded storage admission for both
  persistent creation endpoints and migrate tests.


### 2026-11-03 — M2/05C storage admission checkpoint

- Base: `e9c9c9a`, branch `feat/m2-escrow`.
- 106 Rust unit tests.
- Eight local NEAR sandbox suites.
- Storage prepayment required for task/offer creation.
- Ownership tracked in persistent storage bonds.
- 12 rejected creation transactions leave storage unchanged.
- Exact economic payout logic remains unchanged.
- Refund mechanism NOT IMPLEMENTED.
- Public testnet, migration, independent audit NOT DONE.
- Next: precise storage and refund lifecycle.


### 2026-11-03 — M2/05D capital solvency checkpoint

- Base commit: `26579ef`, branch `feat/m2-escrow`.
- Baseline deployed WASM stake: 3.1443 NEAR.
- Additional operating margin 0.06 NEAR: payout PASS.
- Additional operating margin 0.015 NEAR:
  withdrawal rejected; claimant balance preserved.
- Nine local NEAR sandbox regression suites.
- Storage reserves and actual storage stake are both
  included in the current conservative backing guard.
- Universal capital sufficiency NOT PROVEN.
- Storage refund lifecycle NOT IMPLEMENTED.
- Next: precise refund eligibility and storage release
  accounting, with no weakening of economic solvency.


### 2026-11-03 — M2/06B scoped refund validation

- Base: `ae554a4`, branch `feat/m2-escrow`.
- 108 Rust unit tests; ten local Sandbox suites.
- Exact net-byte rebate on released unselected
  collateral funding record.
- First observed rebate: 5 byte-equivalent.
- Second observed rebate: 88 byte-equivalent.
- Owner attribution and replay protection tested.
- All unrelated storage contributions remain reserved.
- Historical M2/06A preflight archived.
- General storage refund policy NOT complete.
- No public testnet or independent security audit.
- Next: audit per-record lifetime storage attribution
  and withdrawal solvency after storage rebates.


### 2026-11-03 — M2/06C ownership audit

- Base commit: `10db9d7`, branch `feat/m2-escrow`.
- Rust code unchanged; 108 unit tests.
- Eleventh sandbox suite: cross-owner refund audit.
- Two buyers, two providers, external release caller.
- Early unauthorized calls rejected.
- Original provider credited under valid external release.
- Other providers and buyers remain unaffected.
- Replay blocked without ledger or storage mutation.
- Native refund withdrawal tested.
- Five of 24 offer-release permutations PASS.
- Tested owner rebate total: 0.00091 NEAR each.
- Optional repeat: `npm run sandbox:ownership-orders`.
- Scoped-only evidence; general refund system unproven.
- No public testnet or independent audit.
- Next: analyze allocation ownership and minimum-capital
  backing across longer mixed lifecycles.

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
