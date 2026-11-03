# STATUS — Prime Radiant

**Aktuális fejlesztési állapot:** M2/06B — scoped storage rebate, 2026-11-03

| Mező | Ellenőrzött állapot |
|---|---|
| Projekt | Prime Radiant — Economic Commitment Protocol / Nomogenesis |
| Repozitórium | https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis |
| Fejlesztési ág | `feat/m2-escrow` |
| Előző rögzített checkpoint | `ae554a4` — M2/05D |
| Állapotgép | Minden tervezett fő M1 életciklus implementálva |
| Merkle-bizonyítás | Taskhoz kötött SHA-256 ellenőrzés implementálva |
| Kapacitásfoglalás | Kizárólagos provider/slot foglalás és lezárás |
| Natív Rust unit tesztek | **108 PASS, 0 FAIL** |
| Mockolt NEAR storage reload | PASS — 2 célzott teszt |
| Terminális állapotok auditja | PASS — 6 állapot, 7 új teszt |
| `cargo check --locked --target wasm32-unknown-unknown` | PASS |
| `cargo clippy --locked --all-targets -- -D warnings` | PASS |
| NEAR-kompatibilis release WASM | PASS |
| Helyi NEAR Sandbox tranzakciók | PASS — 10 integrációs csomag |
| Native NEAR withdrawal és callback | PASS — success + fault-injected failure on local sandbox |
| Testnet tranzakciók / receipts | NOT VERIFIED |
| Gazdasági escrow és belső settlement | PASS — local sandbox |
| Storage reserve és refund | Provisional 2048-byte reserves; exact accounting and refunds NOT VERIFIED |
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
