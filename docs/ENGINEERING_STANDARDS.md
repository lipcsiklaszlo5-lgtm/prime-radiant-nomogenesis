# Engineering Standards — Prime Radiant / Nomogenesis

**Státusz:** kötelező, ADR-006; hatályos 2026-11-03-tól. A cél valós szakmai minőség, nem annak színlelése.

## Review-kritériumok

1. **Érthető, szűk domainmodell.** Task, reservation, collateral, obligation, payout és transition fogalmaknak egyértelmű jelentése van. A primitív típusok véletlen keverését és üzleti logika duplikálását kerüljük.
2. **Minimális struktúra.** Csak olyan modul, függvény, trait és dependency létezzen, amelynek konkrét szükségessége igazolható. A hardver- és időkerethez igazodó, kis fókuszú WASM-szerződés.
3. **Idiomatikus Rust.** Hibák típusosan; `Result` vagy elvárt szerződéses reject; checked arithmetic; invariánsok a state transitionök szélén; nincsenek elhallgatott hibák, túlzott `unwrap()`-ok vagy magic numberök.
4. **Valódi tesztbizonyíték.** `fmt`, `clippy`, `check`, `build`, `test` önmagában nem elég: a pénzügyi, jogosultsági, replay, timeout, duplafoglalási, callback és külső elszámolási útvonalakat konkrét negatív/pozitív tesztek fedik. Testnet állítás: explorer/tx hash kötelező.
5. **Tiszta Git.** Kicsi, célzott commitok és PR-ek; minden változásnak egy célja van. Soha nincs tömeges újragenerálás, automatikus felülírás, mellékes refaktor a felhasználó jóváhagyása nélkül.
6. **Dokumentáció a valódi olvasónak.** README: mi a probléma, miért NEAR, hogyan reprodukálható, mik a limitációk. Nem kell reklámszöveg, mindenre kiterjedő útmutató, logó-/badge-zuhatag vagy önmagát dicsérő AI-kommentár. Az `AGENTS.md` belső fejlesztői dokumentum; szükség esetén a nevezés előtt ellenőrizzük, hogy nem tartalmaz privát információt.
7. **Tényszerű szerzőség.** Nem hamisítjuk a commitokat, teszteredményeket, teljesítményt, felhasználókat vagy emberi kézi szerzőséget. A hackathon AI-használati és proveniencia szabályait teljesítjük; a „human-readable” nem egyenlő a megtévesztéssel.
8. **Codespaces munkamód.** A felhasználó kezdő; egyetlen bemásolható Bash-kódrészletet kap alkalmanként, lehetőség szerint idempotens Python scaffoldot, amely előbb ellenőrzi a munkakönyvtárat/branch-et, majd csak a kijelölt fájlokat írja. Minden szakasz után a teljes terminálkimenet alapján közösen döntünk a következő lépésről.

## Minden mérföldkő átadásának rövid ellenőrzése

- Tényleg a várt branch/commit az alap? Nincs felülírt vagy véletlenül törölt fájl?
- Érthető a változtatás célja és a szükséges minimális diff?
- Megvolt a fordítás/lint és az indokolt funkcionális, pénzügyi, adversarial és integrációs teszt?
- A README és a projektdokumentáció **csak** a valós eredményeket mondja?
- Frissült a `docs/HANDOFF.md`, `docs/STATUS.md`, és ha kell, a hibajegyzék/ADR?

**Ha bármely kérdésre nem a válasz, a változtatás nem kész.**
