# Döntési napló — ADR (append-only)

Korábbi döntést **ne törölj**: új `ADR-...` bejegyzéssel helyettesítsd és hivatkozz a régi ID-ra. Az implementáció előtt olvasd el.

### ADR-001 — 2026-11-03 — Szűk NEAR MVP, nem teljes platform
**Állapot: Elfogadva.**  Az auditált Python V2 helyben fut, de láncos bizonyítéka nincs. Első cél a független számlák közötti fedezett opció-elszámolás. Nincs frontend, LLM-hálózat, mainnet Intents, fizetős API vagy full-stack marketplace az első mérföldkőben.

### ADR-002 — 2026-11-03 — Off-chain Python optimalizáló, on-chain Rust elszámolás
**Állapot: Elfogadva.** A Python DAG-kockázati motor nem kerül Rustba a határidő előtt; a Rust csak objektíven ellenőrizhető állapotot és pénzügyi kötelezettséget kezel. Az optimalizáló gazdasági fölényéről nem teszünk nem bizonyított állítást.

### ADR-003 — 2026-11-03 — Biztonság a demonstrációban is
**Állapot: Elfogadva.** A PR-005/006/007/008/009 hiányosságok nem elfedhető demófeltételek: külön mérlegelendő fedezet, objektív proof, permissionless hívás, pénzügyi ledger és sandbox-callback tesztek. A felhasználói `actor` és `timestamp` nem hiteles identitás/idő.

### ADR-004 — 2026-11-03 — A Git a kód igazságforrása
**Állapot: Elfogadva.** Új chat nem írhatja felül az előző munka commitját vagy modulját. `main` védett fejlesztési célpont, ticketenként külön branch/diff/teszt; minden session zárásakor `STATUS`, `HANDOFF`, hibajegyzék frissítendő.

### ADR-005 — 2026-11-03 — Publikus nevezés és privát kutatás szétválasztása
**Állapot: Elfogadva.** A versenyhez publikus repó kell, de a Git-historyban a törölt fájlok is elérhetők maradhatnak. Titkok vagy bizalmas kutatási kéziratok soha ne kerüljenek a nyilvánossá teendő repó történetébe. Külön privát repository/fájlhely szükséges. Publikáció csak felhasználói jóváhagyással.

### ADR-006 — 2026-11-03 — Valódi mérnöki minőség, nem „AI-slop”
**Állapot: Elfogadva.** A kód és a repó áttekinthető, idiomatikus, indokolható architektúrájú, karbantartható és bizonyítékokkal tesztelt legyen. Nem fogadunk el nagy, kontrollálatlan scaffoldokat, marketingtölteléket, értelmetlen absztrakciókat, álteszteket, hamis PASS-t vagy el nem végzett ellenőrzésre utaló kommentet. A cél nem az AI-hozzájárulás megtévesztő eltitkolása: ahol a szabályok előírják, tényszerűen közöljük. Normatív részletek: `docs/ENGINEERING_STANDARDS.md`.


### ADR-007 — 2026-11-04 — Jointly funded rescue market
**Állapot: Elfogadva.** Az M3 terméke több érintett job közös helyreállítási piaca. A mentési mandátum vevői költési felhatalmazás, nem garantált szolgáltatói kapacitás. Ez felülírja a közös fedezet-újrahasználat korábbi M3-prioritását; az M2 kernel és biztonsági korlátok megmaradnak.

### ADR-008 — 2026-11-04 — Konzervatív fedezet és bounded clearing
**Állapot: Elfogadva.** Az MVP két komponenst, legfeljebb hat ajánlatot és teljes Q szolgáltatói fedezetet használ kiválasztott szolgáltatónként. Nincs shared-collateral leverage. Az olcsó, de fedezetlen ajánlat nem blokkolhat megengedett kombinációt.

### ADR-009 — 2026-11-04 — Külön M3 liability
**Állapot: Elfogadva.** Minden jóvá nem írt M3 principal a rescue_escrow kötelezettségben marad. A withdrawal backing ezt a meglévő M2 kötelezettségeken, storage stake-en és bufferen felül védi.
