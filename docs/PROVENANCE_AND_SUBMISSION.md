# Hackathon provenance és publikáció — ellenőrzőlista

**Szabályokat mindig a hivatalos oldalról ellenőrizd újra.** 2026-11-03 ismert hivatkozások:

- https://nearhackathon.com/
- https://github.com/nearai/near-hackathon-prompt-examples/blob/main/SUBMITTING.md
- https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/07-agents.md
- https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/05-swarms.md

## Ellenőrzött előfeltételek a korábbi audit alapján

- Publikus, bírálók által futtatható GitHub repository és `do X → see Y` README.
- Publikus X demóposzt képpel/videóval, az aktuális nevezési kiírás szerinti kötelező jelölésekkel.
- Mainnet NEAR cím az esetleges díjfizetéshez; a demó fejlesztése testneten történhet.
- Egyetlen végleges nevezés; határidő: **2026-11-14 23:59 UTC**.
- A kód eredetére: „Code written since the announcement counts.” **A bejelentési határpont és a régi komponensek jogosultsága nem egyértelmű; kérdezzük meg a szervezőt, ha kritikus.**

## Kód-eredetnapló (kitöltendő, nem található ki)

| Modul | Eredet | Első commit SHA | Időpont | Nevezési státusz |
|---|---|---|---|---|
| Rust Economic Commitment Protocol | ÚJ / fejlesztésre vár | — | — | Ellenőrzendő |
| Python Protocol V2 referencia | 2026-11-03 archivált kísérlet | — | — | Régi komponens, nem automatikusan beszámítható |
| Régi Nomogenesis csere-/claim-ág | külön kutatási ág | — | — | Nem a V2 szerződés |
| UI / CLI / demo | fejlesztésre vár | — | — | Ellenőrzendő |

## IP és titkok — kritikus Git-history szabály

**Egy fájl törlése commitban NEM távolítja el a Git előzményeiből.** Ha a privát repo később publikus lesz, a korábban commitolt titkos / stratégiai fájlok története is hozzáférhető lehet. Ne tegyél ide jelszót, mnemonic seedet, API kulcsot, valós pénzügyi adatot, zárt know-how-t vagy teljes privát auditarchívumot. A privát teljes master külön **privát repo / ChatGPT Library / biztonságos személyes tár** legyen. A nyilvános projektre csak publikálható kontextus és minimális, ellenőrizhető kód kerüljön. Áttéréskor ne történet-átírással próbáld „eltüntetni” a bizalmas adatot; külön, tiszta publikációs repót készíts, ha ilyen adat egyáltalán bekerült.

## Nevezés előtt minimum

- [ ] Hivatalos HACKATHON.md / szabályok újraolvasása és jogosultság tisztázása
- [ ] Rust sandbox PASS és 3 signer testnet receipts
- [ ] Független proof + hibaesetek bemutatva
- [ ] Tiszta checkout + egyparancsos demó + CI
- [ ] README nem állít bizonyítatlan eredményt
- [ ] Repo teljes Git history átvizsgálva titkokra
- [ ] X poszt publikus videóval/képpel és a kötelező jelölésekkel
- [ ] Felhasználói kifejezett jóváhagyás a repó publikálására, posztra és végleges nevezésre
