# Nomogenesis — aktuális állapot és folytatás

Dátum: 2026-11-06. Integrációs kódalap: `5455ee779aa2c66d98f0f93175176034e969a4ec`.
Dokumentációs ág: `docs/r7-continuity-5455ee7`.
Jelenlegi javítóág: `fix/r7-fix-01-provider-slot`, alap `2778cdd`.
A dokumentációs checkpoint a GitHubon `2778cdd`. Új chatben előbb
ellenőrizd a javítóág távoli HEAD-jét, az összes ágat és a nem
commitált fájlokat.

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
| F4 | A tényleges szolgáltatás-kieséstől a mentésig tartó teljes, mérhető folyamat még nincs igazolva. |
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

Az `R7-FIX-01` eredménye: `docs/worklog/R7-FIX-01-provider-slot.md`.
A **következő egyetlen ticket** `R7-REPO-01`: az összes ág és a
nem commitált buyer/audit fájlok leltára, majd a `main` ág
felzárkóztatásának ellenőrizhető terve. Ágat nem törlünk és
`main`-t nem mozgatunk az összevetés előtt.
Utána a kiesés → agentes döntés → atomi NEAR mentés → settlement
demó és az új V2 public Testnet bizonyítása következhet.
