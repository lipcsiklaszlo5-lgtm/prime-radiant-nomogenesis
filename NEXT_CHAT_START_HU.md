# Másold be ezt egy új chat legelső üzenetébe

A **Prime Radiant — Economic Commitment Protocol** fejlesztését folytatjuk. A GitHub repó a projekt egyetlen kód-igazságforrása: https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis.

Mielőtt bármit írnál vagy megváltoztatnál:
1. Olvasd el a repóból az `AGENTS.md`, `PROJECT_MASTER.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/BUGS.md`, `docs/HANDOFF.md` fájlokat, majd a legfrissebb commitokat és az érintett forrásokat.
2. Ellenőrizd a valós branch/HEAD SHA-t, `git status`-t, futtatható tesztet; ne higgy korábbi chatből származó „PASS” állításnak új bizonyíték nélkül.
3. Mondj röviden 5 pontot: (i) aktuális HEAD/branch, (ii) mi kész és bizonyított, (iii) mi nem kész, (iv) nyitott P0/P1 hibák, (v) a következő egyetlen ticket.
4. **Ne generáld újra a teljes projektet, ne írj felül létező működő fájlt, ne fejlessz `main`-en, ne force-pusholj és ne jelents tesztelés nélküli sikert.** Dolgozz kis branch/diff/teszt/commit lépésekben.
5. A feladat végén frissítsd a `docs/HANDOFF.md`, `docs/STATUS.md` és releváns hiba- vagy döntési dokumentumokat.

A fejlesztési cél minimális Rust NEAR-szerződés három külön accounttal, fedezett opcióval, permissionless timeouttal, objektív proof-fal, biztonságos payouttal; a Python optimizer off-chain marad. A 2026-11-03-as audit 95 Python PASS ellenére a gazdasági fölényt **nem bizonyította**, a Rust/testnet V2 pedig még nem igazolt. Ha hozzáférésed nincs a repóhoz, ezt írd meg, és kérj exportot; ne találgass.
> **Új, kötelező mérnöki elv:** A repó semmilyen körülmények között ne váljon összecsapott AI-sablonná vagy „vibe-coded” projektté. Mielőtt kódot írsz, olvasd el az `AGENTS.md` 6. szakaszát, a `docs/ENGINEERING_STANDARDS.md` fájlt és az ADR-006-ot. A cél igazolt, gondosan átgondolt, idiomatikus Rust és szerződéses tesztelés; ne állíts hamis szerzőséget vagy teszteredményt.
