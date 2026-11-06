## CURRENT ENTRY POINT (2026-11-06 / R7-06)

Read first:
- `docs/NOMOGENESIS_SESSION_STATE.md`
- `docs/M3_R7_06_ECONOMIC_FORMATION_PLAN.md`

These preserve the complete M2/M3/R6/R7 history
and define the missing economic formation layer.

Check current Git HEAD before acting.
Older status paragraphs are historical checkpoints.

Never claim autonomous independent operators,
incentive compatibility or on-chain subset selection
based only on the offline Genesis engine.

Next after R7-06A: R7-06B.

---

# AGENTS.md — Prime Radiant / Nomogenesis

> **KÖTELEZŐ első olvasmány minden új ChatGPT-, Claude-, Codex- vagy más fejlesztői munkamenetben.**
> Állapot: 2026-11-04. Ez munkautasítás, nem azonos a Git valós pillanatnyi állapotával.

## 0. A repó és a munkamenet igazságforrásai

1. **A Git aktuális tartalma és commitjai az igazságforrások a kód állapotáról.** A chatmemória, egy korábbi beszélgetés és egy statikus ZIP nem írhatja ezt felül.
2. Olvasási sorrend: `AGENTS.md` → `PROJECT_MASTER.md` → `docs/M3_NORTH_STAR.md` → `docs/M3_RESCUE_MARKET_SPEC.md` → `docs/STATUS.md` → `docs/DECISIONS.md` → `docs/BUGS.md` → `docs/HANDOFF.md` → `docs/DEVELOPMENT_WORKFLOW.md` → legújabb `docs/worklog/M3-*.md` → Git és tesztek.
3. Ha a fenti fájlok közül valamelyik hiányzik, hibás vagy ellentmond a kódnak, **állj meg**, és írd le az eltérést. Ne találj ki hiányzó implementációt.
4. Új chatben a felhasználó megadja a repó URL-jét (vagy csatolja a friss exportot); az asszisztens köteles az aktuális forrást elolvasni. **Nem szabad feltételezni, hogy az új chat automatikusan látja a repót.**

## 1. Projekt és scope

Cél: a Nomogenesis bounded NEAR Rust rescue market prototípusa.

Több vevő finanszírozott mentési mandátuma együtt vásárolhat teljes, többkomponensű helyreállítást. A kiválasztott szolgáltatók saját fedezetet zárolnak; objektív proof és determinisztikus settlement szükséges.

Az MVP legfeljebb hat szponzoráló jobot, két szükséges komponenst és hat ajánlatot kezel. Nincs token, hitelezés, collateral reuse, mainnet-költés vagy általános oracle.

A meglévő M2 kernel megőrzendő. Persistent integráció előtt kötelező a pure Rust domainmodell és a docs/M3_RESCUE_MARKET_SPEC.md tesztmátrixa.

## 2. Kötelező munkafegyelem

- **Egy ticket, egy szűk branch, egy kis diff.** Minden munkát írd hozzá a `docs/HANDOFF.md`-hez, mielőtt implementálsz.
- Ne módosíts, ne törölj és ne cserélj le létező működő modult úgy, hogy előtte el nem olvastad a forrást és a teszteket. Ne állítsd át a teljes architektúrát implicit módon.
- Az egyszeri M0 dokumentációs inicializálás mehet `main`-re, utána ne fejlessz közvetlenül `main`-en; javasolt ág: `feat/<ticket>-<leiras>` / `fix/<ticket>-<leiras>`. Tartsd meg a változásokat commitokban; ne használj `git push --force`, `git reset --hard`, történetátírást vagy tömeges fájlfelülírást külön kifejezett jóváhagyás nélkül.
- Minden változásnál: dokumentáld a kiinduló commit SHA-t, a módosított fájlokat, a futtatott tesztparancsot, a valódi kimenetet, a maradék kockázatot, az új commit SHA-t. **Teszt nélkül nincs PASS.**
- A megírt kódot ellenőrizhető, automatizált teszttel és regressziós esettel egészítsd ki. A teszteknek negatív támadási eseteket is fedniük kell.
- Függőséget/verziót csak kifejezett indokkal változtass. Pinelt Rust toolchain, `Cargo.lock`, `near-sdk`, sandbox tesztelés, CI. Kihagyott, nem futtatható tesztet ne nevezd sikeresnek.
- Rustban: checked `u128` aritmetika, objektív blokklánc-idő, `predecessor_account_id` jogosultság, nem felhasználó által megadott `actor`, aszinkron kifizetés-könyvelés és callback-hibakezelés.
- **Ne állíts gazdasági fölényt, formális biztonságot, decentralizáltságot, AI-autonómiát vagy testnetes működést, amíg azt konkrét bizonyíték nem támasztja alá.**
- Külső írási/publikációs művelet (repo nyilvánossá tétele, X-poszt, hackathon beadás, számlatranzakció) csak a felhasználó kifejezett engedélyével.

## 3. Tiltott veszélyes rövidítések

- A `premium=100, collateral=1` opció kifizetése és mulasztása nem maradhat nyereséges a szolgáltatónak a nemteljesítésből. A fedezet/ár ösztönzőit demonstráció előtt definiálni kell; a biztosíték nem bizonyít fizikai kapacitást.
- Ugyanazt a kapacitás-slotot nem lehet két aktív opcióhoz lekötni. Spot kapacitásra külön szabály kell; ne állíts általános túlfoglalás-mentességet, amíg az nincs kezelve.
- Nem használható a 10 bit nehézségű SHA nonce valódi szolgáltatásbizonyítékként.
- A permissionless keeperhez **nem kell előre regisztrált szimulált account**; a láncon objektív jogosultságellenőrzés kell.
- Az összesített egyenleget nem szabad kizárólag önbevallott `money_conserved=True` alapján bizonyítani. Eredeti genesis / letéti betétek és tranzakciók rekonstruálandók.

## 4. M3 mérföldkövek

M3-R0: stratégia és végrehajtható specifikáció.

M3-R1: pure Rust allocation, clearing és settlement domainmodell.

M3-R2: funded jobs, mandates és külön rescue liability.

M3-R3: atomi bundle award és M2/M3 cross-slot guard.

M3-R4: proof, siker és minden részleges kudarcág.

M3-R5: külön signerfolyamatok és tényleges adatmunka.

M3-R6: UI, testnet evidence, clean checkout és nevezési csomag.

Jelenlegi ellenőrzött kapu: M3-R6-05B.
242 Rust teszt, Clippy, reprodukált WASM PASS.
26 M2/M3 Sandbox kapu, két javított offline
storage-audit és withdrawal fault injection PASS.
Összesen 29/29 kapu ellenőrizve.
A két audit elavult tárhelyelvárását korrigáltuk.
Public testnet és független audit NINCS.
M3-R5-02: CSV-alapú mentési demó,
külön NEAR-fiókokkal, 3 sikeres dolgozói eredménnyel,
114 egység könyvelési megmaradással és ellenőrzött
20 egységes natív Transfer + callback receipttel.
Az R5-02 eredetileg egyetlen signer-harnessben futott.
M3-R5-03/01: két külön Node.js aláírófolyamat,
két külön privát kulcs és két sikeres helyi
NEAR Sandbox-tranzakció ellenőrizve.
M3-R5-03/02: 12 külön helyi signerfolyamat,
szerepkörös aláírás, 2 szolgáltatói CSV-ellenőrzés,
3 dolgozói újraszámítás, 114 egység megmaradás,
20 egységes natív receipt, legacy regresszió PASS.
A Sandbox-adminisztrátor továbbra is megbízható szereplő.
Független üzemeltetők és nyilvános testnet NINCS igazolva.
M3-R6-03: nyilvános Testnet-telepítés PASS.
Szerződés: `nomogenesis-70e59593a3.testnet`.
Tranzakció: `49NZ9qDKmfy42K9A7UKQDrDbQ9FWETFhijWQaUvcR5Qd`.
Két független RPC-n teljes WASM-egyezés PASS.
A teljes gazdasági életciklus Testneten MÉG NEM igazolt.
M3-R6-04: nyilvános Testneten 3 sikeres
tranzakció, 30 UNIT zárolt gazdasági letét,
külön vevő és dolgozó, két RPC finality PASS.
Teljes mentés, elszámolás, kifizetés Testneten
még NINCS igazolva.
M3-R6-05B: teljes nyilvános Testnet mentési életciklus PASS.
17 nyilvános konzorciumi tranzakció, két RPC ellenőrzés,
114 UNIT gazdasági megmaradás, 20 UNIT natív kifizetés,
Transfer + callback receipt PASS.
A korábbi R6-04 30 UNIT letétje megmaradt.
Nyilvános, kulcsmentes ellenőrzés:
`node scripts/m3/r6_verify_public.cjs`.
Független üzemeltetői hálózat, audit és mainnet NINCS.
Következő: M3-R6-06 nevezési demó és review.

## 5. Munkamenet lezárás

Minden alkalom végén frissítsd `docs/STATUS.md`, `docs/HANDOFF.md`, szükség esetén `docs/BUGS.md` és `docs/DECISIONS.md`; rögzítsd a `git status` állapotát, a SHA-t, a teszteredményt, a következő **egyetlen** végrehajtható lépést. Ha két chat párhuzamosan fejleszt, **külön branch**, és csak review/merge után lesz közös állapot. Soha ne dolgozz korábbi chat összefoglalója alapján a frissebb commitok figyelmen kívül hagyásával.

## 6. Kötelező mérnöki minőség — ne legyen AI-slop / vibe-coded repo (ADR-006)

- A repó **valóban legyen professzionális és ember által könnyen átlátható**, ne csak annak látszódjon. Nem kell és nem szabad hamis emberi szerzőséget vagy nem végzett teszteket állítani; a verseny AI-használatra vonatkozó szabályait tartsd be.
- Minden változtatásnak legyen megnevezhető oka és ellenőrizhető elfogadási feltétele. Kicsi, célzott diffek; idiomatikus Rust; expliciten kezelt hibák és határok; világos domain-fogalmak.
- **Tilos a töltelék**: AI-s önkommentár, túlmagyarázott triviális kód, generikus wrapper-hegyek, indokolatlan absztrakció, halott modul, duplikált implementáció, díszítő dashboard, kozmetikázott benchmark és hamis PASS.
- Dokumentáció: rövid, pontos, használható README; architektúra/ADR-ek valódi trade-offokkal, fenntartásokkal; csak igazolt parancsok és valódi kimenetek. Az `AGENTS.md` fejlesztői belső útmutató, nem zsűrinek szóló marketinganyag.
- Tesztpiramis: format/lint/build/unit **és** állapotátmenet, jogosultság, pénzmegmaradás, támadási és sandbox/integrációs tesztek. Tesztkimenet nélkül nincs sikerállítás; minden valós on-chain állítás tranzakcióazonosítót kíván.
- Nem szabad „nagy scaffold = kész rendszer” logikával dolgozni. Előbb rövid specifikáció és tesztesetek; aztán minimális működő változtatás; futtatás; kódreview; commit. A későbbi chat ne írja át a működő részeket pusztán más stílusért.
- A szerzőségre és az AI-eszközök használatára vonatkozó bármely kötelező hackathon-nyilatkozat legyen tényszerű. A minőséget **nem álcázással**, hanem bizonyítható mérnöki munkával érjük el.
- Részletes kritériumok: `docs/ENGINEERING_STANDARDS.md`.

## 7. Felhasználói működés és kódgenerálás

A felhasználó lépésenként dolgozik, a programozást nem neki kell elvégeznie. Az asszisztens csak egy **teljesen bemásolható Codespaces Bash/Python scaffoldot** ad egyszerre; a felhasználó a teljes terminálkimenetet visszaküldi. E kimenet ellenőrzése előtt nincs következő kódváltoztatás. A mechanikus build/lint/unit tesztek nem elegendők: szerződéses, pénzügyi, negatív és end-to-end tesztek is szükségesek, ahol releváns. Lehetőleg idempotens és célzott módosítás, soha néma felülírás vagy generikus nagy kódömlés. A repó nyilvános: bizalmas háttéranyag nem commitolható.
