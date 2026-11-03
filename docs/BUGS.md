# Audit hibajegyzék — 2026-11-03

**Forrás:** `Prime_Radiant_Independent_GO_NO_GO_Audit_2026-11-03.zip` / `AUDIT_REPORT_HU.md`. A lista **nem azt jelenti, hogy a Rust kód létezik**. Státusz csak tényleges regressziós teszttel és commit SHA-val zárható.

| ID | Pri | Hiba | Elfogadási teszt / lezárási kritérium | Állapot |
|---|---|---|---|---|
| PR-001 | P0 | Nincs bizonyított V2 Rust szerződés, több aláíró és testnet receipt | `cargo test`, NEAR sandbox, három független signed testnet tx + explorer hivatkozás | OPEN |
| PR-002 | P0 | Hackathon provenance és beadási követelmények nincsenek tisztázva | Régi/új fájlok eredete; szervezői tisztázás, ha szükséges; publikálási checklist | OPEN |
| PR-003 | P0 | Toy SHA nonce nem szolgáltatásbizonyíték | Definiált, objektív digitális feladat; hamis, replay és late proof tesztek | OPEN |
| PR-004 | P1 | Nem robusztus gazdasági fölény | Erős, train-only választott kontroll + CI; vagy a fölényállítás eltávolítása | OPEN / CLAIM RESTRICTED |
| PR-005 | P1 | Premium=100, collateral=1 nyereséges mulasztás | Fedezeti/kockázati szerződésszabály és támadási regressziós teszt | OPEN |
| PR-006 | P1 | Bizalmi attesztáló szabad szöveggel hozhat létre slotokat | Korlátozott / bizonyított kapacitás-attesztáció és hazug issuer modell | OPEN |
| PR-007 | P1 | Az auditor +100000 hamis záróegyenleget elfogad | Hiteles genesis + teljes ledger rekonstruálása, hamisítás teszt FAIL | OPEN |
| PR-008 | P1 | Keeper csak pre-regisztráltként működik a Pythonmodellben | Új, előre nem regisztrált NEAR account is hívhat timeoutot | OPEN |
| PR-009 | P1 | Payout/callback/storage réteg hiányzik | Callback failure, retriable claims, idempotency és storage deposit tesztek | OPEN |
| PR-010 | P2 | Spot nincs foglalt kapacitáshoz kötve | Spot slot-lock vagy dokumentált best-effort garancia-mentesség | OPEN |
| PR-011 | P2 | Nincs clean-room judges demo / CI / IP policy | Tiszta checkout, pinelt függőségek, `do X → see Y`, automatizált CI és demó | OPEN |

## Prioritási szabály

A P0 a nevezéshez kapcsolódó minimum, de a P1 pénzügyi biztonsági problémákra **nem szabad úgy tesztelni valódi pénzzel**, hogy azokat lezártnak tekintjük. Testneten is dokumentálni kell minden limitációt. Hibát csak konkrét tesztparanccsal, kimenettel, dátummal és commit SHA-val zárj.
