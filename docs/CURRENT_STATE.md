# Nomogenesis — aktuális állapot és folytatás

## CURRENT — R7-DEMO-03/04B backup-driven recovery VERIFIED

Date: 2026-11-06.
Branch: `feat/r7-demo-03-process-outage`.
Full local V2 Sandbox recovery passed with a genuinely
terminated source process and two separate backup
provider processes. Backup bytes were requested only
after the atomic award. Two buyer consents, one refusal,
two Merkle-verified components, two completed jobs and
48 UNIT financial conservation passed.

Wall time to both accepted proofs: 26.122 seconds.
Evidence: `docs/worklog/R7-DEMO-03-backup-driven-recovery.md`.

Limits: same-host synthetic backups, request-driven
observer, no public V2 Testnet or native withdrawal.

Next single ticket: R7-TESTNET-01.

## HISTORICAL — R7-DEMO-03/02 real process outage VERIFIED

Date: 2026-11-06.
Branch: `feat/r7-demo-03-process-outage`.
The CSV source ran as a separate process, exited via
SIGTERM, and a separate HTTP observer saw ECONNREFUSED.
The full consent-bound V2 Sandbox lifecycle then passed:
two approvals, one refusal, two provider proofs, two
completed jobs and 48 UNIT financial conservation.

Evidence: `docs/worklog/R7-DEMO-03-process-outage.md`.

Recovery payloads are still precomputed local fixtures;
backup provider independence is not yet demonstrated.
No V2 public Testnet deployment is claimed.

Next: R7-DEMO-03/04 independent backup data providers.

## HISTORICAL — R7-REPO-01 clean-checkout PASS

Branch: `chore/r7-repo-01-entrypoint`.
Implementation commit: `6604fb3`.
A committed one-command V2 gate has passed from a separate
clean checkout in Codespaces: 210 base Rust tests, 21 V2 Rust
tests, 5 CSV tests, identical V2 WASM, and complete local
failure-to-recovery Sandbox execution.

Evidence:
`docs/worklog/R7-REPO-01-clean-checkout.md`.

The `main` branch has not yet been updated.
Next single action: review and fast-forward `main`.
Afterward: `R7-DEMO-03` real process failure and live events.

## HISTORICAL — R7-DEMO-02 állapot

Ág: `feat/r7-demo-02-recovery`, alap `1103b7c`; a pontos aktuális
commitot `git rev-parse HEAD` adja. Külön buyer-folyamatokkal a helyi
HTTP 503 kiesés -> jóváhagyott V2 mentés -> két láncon igazolt CSV
komponens -> két befejezett munka -> elszámolás Sandboxban sikeres.
A harmadik buyer elutasított és visszakapta a principalját; a végső
liability 48 UNIT. A 286 másodperc gyorsított Sandbox-láncidő.
Bizonyíték és korlátok: `docs/worklog/R7-DEMO-02-recovery-lifecycle.md`.
Public V2 Testnet, natív kifizetés és valós külső szolgáltatás-kiesés
nincs igazolva. A `main` még régi M0 állapotú.

Következő egyetlen ticket: `R7-REPO-01` ágak és belépési pontok
rendezése, clean-checkout ellenőrzés, majd review-olt `main` frissítés.

## Azonnali belépés

1. `git status -sb`, `git branch -avv`, `git log -5 --oneline`.
2. Olvasd el az `AGENTS.md` fájlt, ezt az állapotlapot, a
   `docs/HANDOFF.md` legelső aktuális bejegyzését és az érintett worklogot.
3. A `main` az ellenőrzéskor csak M0 állapotban volt. Fejlesztést ne
   indíts automatikusan onnan. A nem commitált fájlokat ne töröld.
4. Teszteredményt csak konkrét futás alapján jelents újra sikeresnek.

## Mi van a legújabb commitban?

- Az M2/M3 pénzügyi mag, a korábbi két szintetikus public Testnet
  életciklus és settlement a történeti worklogokban dokumentált.
- A `r7-v2` feature alatt az `ee53dce` commit már összeköti a vevő
  NEAR-fiókjához kötött consentet a finanszírozott M3 jobbal, és
  kiválasztott koalícióra atomi awardot készít. A régi award ezen a
  feature-úton le van tiltva. Az R7-06E/03B-06 worklog 14 terv/award,
  5 funded-consent, 2 legacy-guard tesztet, 210 alap M3 tesztet,
  helyi Sandbox-eseteket és 48 UNIT megmaradást rögzít.
  **Ezek korábbi checkpoint-állítások; ebben a dokumentációs
  munkamenetben Rust/Sandbox még nem futott újra.**
- A `97a0a40` és `5455ee7` commitok a consent tárolási életciklusát
  vizsgálják. A 375 bájtos modell nem formális felső korlát.
  Consent-bond visszatérítés nincs jóváhagyva és nincs implementálva.
- Az eredeti `feat/r7-06e-03b-m3-atomic` munkakönyvtárban agent- és
  audit-scriptek vannak nem commitált állapotban. Nem tekinthetők
  ellenőrzött vagy megőrzött release-résznek; olvasd el őket, mielőtt
  hozzájuk nyúlsz.

## Nyitott, ellenőrizendő eltérések

| ID | Állapot |
|---|---|
| F1 | A korábbi „nincs on-chain subset award” megállapítást az integrált V2 checkpoint meghaladta; a teljes kód- és tesztreview még szükséges. |
| F2 | A providerhez kötött slotparitás javítva a Genesis, Python/Rust verifier, JS benchmark és verseny-audit útján. Codespaces: 93 Python, 48 Node és célzott Rust certificate teszt sikeres. |
| F3 | A szintetikus nem kizárható haszon esetén 3/3 vevő potyautasként kilépne; az ösztönző megoldás nincs bizonyítva. |
| F4 | Helyi HTTP 503 -> V2 mentés -> két munka -> settlement Sandboxban igazolt; valós külső kiesés és public V2 Testnet még nincs. |
| F5 | A korábbi offline agentek saját friss kulcsai nem bizonyítanak tartós, független NEAR-azonosságot. |
| F6 | A V2 integrált kódnak nincs igazolt új public Testnet életciklusa, független auditja vagy mainnet futása. |
| F7 | Tárolási refund és kis tartalékú natív fedezet ellenőrzése nincs lezárva a commitált bizonyítékban. |

Részletek: `docs/REVIEW_2026-11-06.md`. A régi `docs/BUGS.md`,
`docs/NOMOGENESIS_SESSION_STATE.md` és a hosszú handoff történeti
bejegyzéseinek „CURRENT”/„Next” címei nem írják felül ezt az oldalt.

## Termékcél és következő ticket

A bemutatóban egy működő közös szolgáltatás essen ki; érintett agentek
saját korlátaik alapján döntsenek; a pontos koalíció NEAR-en zároljon
mentést; ellenőrzött siker vagy részleges hiba után számoljon el.
Mérjük a helyreállítás idejét, kész jobokat, vevői költséget,
szolgáltatói díjat és lekötött tőkét. A fődíj vagy a NEAR-be történő
beemelés nem bizonyított eredmény.

Az `R7-DEMO-02` eredménye:
`docs/worklog/R7-DEMO-02-recovery-lifecycle.md`.
A `R7-REPO-01` clean-checkout gate sikeres és commitált.
Következő egyetlen lépés: review-olt `main` fast-forward.
Ezután `R7-DEMO-03` külön processzben futó forrás és
eseményvezérelt mentési demonstráció. Az eredeti munkakönyvtár
nem commitált fájljai megőrzendők.
