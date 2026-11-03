# PROTOCOL SPEC — M0 SPEC TEMPLATE (NEM JÓVÁHAGYOTT IMPLEMENTÁCIÓ)

> Ezt a dokumentumot **az első Rust kód előtt** konkretizálni kell. A V2 Python modell informáló referencia, de a független audit hibáit nem szabad a szerződésbe másolni.

## Szereplők
Buyer; Primary Provider; Reserve Provider; Keeper; Proof Verifier / capacity issuer (ha van). A NEAR `predecessor_account_id` a hívó, nem user input.

## Minimum adattípusok / invariánsok

- `Task`: buyer, primary, funding, `deadline`, proof spec, állapot és kifizetési állapot.
- `Offer`: reserve provider, időablak, slot ID, premium, activation fee, collateral, expiry, immutable hash.
- `Option`: ajánlatra hivatkozás, buyer, aktív slot-lock és állapot.
- `Capacity`: slot tulajdonos és foglalás. Objektív fizikai/compute erőforrás ellenőrzés NEM bizonyított.
- `Ledger`: `deposits`, `reserved`, `claimable`, `pending_transfers`, `completed`; nem lehet fedezetlen ígérvény; minden változás checked arithmetic.
- **No double spend**: ugyanaz a slot ne legyen egyszerre két aktív opcióban; ugyanaz a claim ne legyen kétszer kivonható.
- **Timeout**: megfelelő határidő után bárki hívhatja; a késő proof ne írja felül a lezárt állapotot.
- **Payout**: aszinkron callback és hiba esetén retryable, idempotens; soha ne fizessen duplán.
- **Economic**: option premium és collateral / slash arány ne ösztönözzön egyszerű nemteljesítésre. Definiálandó paraméterkorlát és példa.
- **Proof**: jobb, mint a régi 10-bites SHA PoW; objektíven ellenőrizhető, input/output-hoz, task ID-hoz, signerhez és időhöz kötött.

## A minimális demonstráció negatív tesztjei

1. Primary eltűnik; *nem regisztrált* keeper határidő után aktiválja a tartalékot.
2. Két buyer ugyanazt a reserve slotot nem foglalhatja el egyidejűleg.
3. A hamis és késő proof elutasítódik, korai slash nélkül.
4. Reserve nemteljesít: fedezetlevonás / claim / refund helyesen működik.
5. Dupla `claim` / callback / transfer / cancel kísérlet nem hoz új pénzt.
6. `premium=100; collateral=1` adversarial stratégia érvénytelen vagy az ismert vevői kockázat explicit dokumentált és elfogadott.
7. Valódi NEAR testnet accountok tranzakcióinak explorer-linkjei egyeznek a trace-ben rögzített állapotokkal.

## Nyitott specifikációs döntések — megoldandók M0 során

- Pénznem: natív NEAR kizárólag testneten első MVP-ben, vagy belső ledger? Egyszerre ne vezessünk több tokent.
- Payout minta: `withdraw` claim + callback / elbukott payout visszaállítás.
- Collateral floor és slash/refund képlet; kezelendő, hogy a készenléti premium kifizetés milyen ösztönzőt teremt.
- Feladat proof: konkrét hasznos determinisztikus számítás és ellenőrizhetőségi költség.
- Slot kapacitás-claim kezelése: trust assumption, exposure cap, vagy tesztelhető bizonyítás.
- Storage költség és account-alapú befizetések, callback helyes állapota.
- `near-sdk` és `cargo-near` konkrét **ellenőrzött, pinelt** verziószámai.

**M0 exit:** A végleges Rust interfészek, állapotok, invariánsok, tesztvektorok és fenyegetési modell jóváhagyva és verziózva; csak ezután implementáció.
