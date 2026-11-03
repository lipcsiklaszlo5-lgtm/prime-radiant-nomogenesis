# PRIME RADIANT — PROJECT MASTER / Single Source of Truth

**Projekt:** Prime Radiant — Nomogenesis / Economic Commitment Protocol  
**Verzió:** 0.1 handoff, 2026-11-03  
**Státusz:** csak Rust/NEAR MVP-fejlesztésre **feltételes GO**; nevezésre késznek nevezni **NO-GO**.  
**Karbantartás:** változásokat `docs/STATUS.md`-ben és `docs/DECISIONS.md`-ben rögzíts, ne írd felül a korábbi tényeket.

## A. Küldetés: mi a projekt?

Az **Economic Commitment Protocol** egy több szereplős, pénzügyi fedezett tartalékkapacitás- és helyettesítési szerződésprotokoll. Vásárló egy időhöz kötött feladatot finanszíroz; elsődleges szolgáltató vállal teljesítést; tartalékszolgáltató opciós díjért és lekötött fedezettel vállal készenlétet; ha az elsődleges szolgáltató nem teljesít határidőre, egy külső végrehajtó a láncon kiválthatja a tartalékot; ellenőrizhető teljesítés után az elszámolás szerződésszerű. A Prime Radiant kockázatalapú optimalizálása **off-chain** számítja, mely tartalékok megvásárlása célszerű egész feladatfüggőségi gráfoknál.

**Lehetséges megkülönböztetés:** több független vevő és szolgáltató közös kapacitáskockázat-kezelése + on-chain gazdasági kötelezettségek. Ez a *vizsgálandó termékhipotézis*, **nem bizonyított algoritmikus vagy üzleti újdonság**. A kétoldalú opciók és agent marketplace-ek létező koncepciók.

**Ne kommunikáld úgy, hogy:** garantált gazdasági előny; formálisan biztonságos; valódi kapacitás bizonyított; önműködő blockchain cron; valós AI-modellek szabad döntéshozatala; decentralizált minden rétegben. Ezek jelenleg nem igazoltak.

## B. Miért NEAR, és mi kerül a láncra?

A NEAR a különálló számlák közötti **ellenőrizhető** kötelezettségvállalást, letéti nyilvántartást, jogosultságot, határidőt és állapotfüggő elszámolást adhatja, anélkül hogy az egyik vevő vagy szolgáltató privát adatbázisát mindenkinek el kellene fogadnia.

- **On-chain Rust**: task/offer/option állapotok, bejegyzett kapacitás-slotok és fedezet, tartozások/letétek, határidők, jogosultságok, idempotens kifizetési/claim állapotgép.
- **Off-chain Python**: DAG- és kockázati modell, ajánlatrangsort készítő optimalizáló, több vevős kísérletek; ez nem on-chain igazságforrás.
- **Ügynökök**: független kulcsot birtokló kliensfolyamatok vagy account-backed scriptelt policy-k; a „szimulált actor string” nem elég.
- **Keeper**: külön folyamat/ügynök hívja a határidős, *bárki által* kezdeményezhető műveletet; a blokklánc nem indít magától tranzakciót.
- **Verification/oracle**: az első MVP-hez szűk, objektíven ellenőrizhető digitális feladat. Nincs általános külső szolgáltatásbizonyító orákulum.

## C. Első MVP user journey

1. Buyer létrehozza és finanszírozza a konkrét digitális feladatot, határidővel, ellenőrzési specifikációval, ármaximummal.
2. A reserve provider időablakra és egyedi slotra opciós ajánlatot tesz, és elkülönített fedezetet helyez letétbe.
3. Buyer leköti az opciót; a szerződés ellenőrzi a slot rendelkezésre állását, fedezetét és az időablakot.
4. Primary vagy igazolt eredményt nyújt be határidőre, vagy eltűnik. Ha eltűnik, egy *tetszőleges* keeper lejárati hívást küld.
5. A zárolt, érvényes reserve opció aktiválható; a reserve teljesít vagy határidőre elbukik.
6. A szerződés belső egyenlegeken, állapotokon és aszinkron NEAR payoutot kezelő ledgeren keresztül elszámol. Független számlák tranzakciói publikus explorerben megtekinthetők.

A részletes állapotok és invariantok kötelező kiindulása a régi V2 Python-átadás `NEAR_HANDOFF_V2.md`, de **audit hibáit ki kell javítani; nem másolható vakon 1:1**.

## D. Gazdasági modell — mit tudunk és mit nem?

- A Python piactesztekben 120 szintetikus világ, 480 politikaértékelés készült. Eredetileg +1,55 egység átlagos előnyt mutatott a platform egy fix sorrendű, különálló beszerzési kontrollhoz képest.
- A független audit jobb kontrollt készített (train-only sorrendválasztással). Ezzel **−0,87** egység lett a platform átlagos különbsége; 29 nyerés, 67 vereség, 24 döntetlen; 95% CI **[−2,08; +0,26]**. Egyik irányú általános fölény sem igazolt. Súlyosan szűkös környezetben a korábbi +3,90 átlagos előny +0,06-ra csökkent.
- Az egyéni kétoldalú árazás modell szerint bizonyos paramétertartományokban mindkét félnek megérheti; ez nem valós piaci kereslet vagy egyensúly.
- Több szereplő önmagában nem bizonyított hálózati hatást. A protokoll értéke és versenyelőnye **külön bizonyítandó**.
- A hackathon pitch-ben a **valódi, ellenőrizhető on-chain kötelezettség és hibatűrő végrehajtás** legyen a központi állítás. Ne állíts költségelőnyt a korábbi kísérletből.

## E. Aktuális technikai bizonyíték — 2026-11-03

**Hitelesen visszafuttatott auditcsomag:** `Prime_Radiant_Independent_GO_NO_GO_Audit_2026-11-03.zip`, eredeti referencia: `Prime_Radiant_Nomogenesis_Protocol_V2_2026-11-03.zip`.

- Python **95/95 unit teszt PASS**, Python 3.13.5, 4,762 s (konkrét auditgép); ZIP-integritás PASS.
- Biztonsági szimuláció: 48 világ, 1 296 task, 319 opció, 4 655 pénzmozgás, jelentésben PASS; de a külön auditort sikerült becsapni, ezért a PASS **nem pénzügyi hitelesítés**.
- Jelenlegi V2 referencia főbb forrásai: `agent_economy/protocol_v2.py`, `agent_economy/keeper_v2.py`, `market_validation/v2_settlement.py`, `tests/test_protocol_v2.py`, `run_secure_demo.py`, `audit_v2.py`.
- **Nincs bizonyítva** az auditált V2-ben: NEAR Rust kód vagy WASM, NEAR sandbox, valódi testnet payment, három külön aláíró, CI, kriptográfiai kapacitásattestáció vagy valódi munkavégzési oracle.
- Egy **korábbi, eltérő Nomogenesis csere-/szintetikus claim kutatási ág** `HANDOFF_TO_GPT-6.md` fájlja testnetes Rust-demóról számol be. **NEM ugyanaz, mint az Economic Commitment Protocol V2; ne számítsd annak teljesítéseként.** A korábbi bizonyítékok külön ellenőrizendők, ha valamit újra szeretnénk használni.

## F. A legfontosabb nyitott hibák — forrás: 2026-11-03 független audit

- **PR-001 P0**: nincs bizonyított V2 NEAR-szerződés / multi-signer testnet demo / explorer receipts.
- **PR-002 P0**: hackathon code provenance és jogszerű beadás nincs teljesen igazolva.
- **PR-003 P0**: a 10 bites SHA-feladat nem hasznos, hiteles szolgáltatási bizonyíték; objektív proof kell.
- **PR-004 P1**: gazdasági fölény erős baseline-nal szemben nem robusztus; jelenleg ne kommunikáld.
- **PR-005 P1**: `premium=100`, `collateral=1` esetben a mulasztás +99 nettó szolgáltatói eredményt adhat.
- **PR-006 P1**: `certify_capacity` megbízhatónak vett attesztálója nemüres szöveggel hat slotot regisztrálhat; nincs független kapacitásbizonyítás.
- **PR-007 P1**: régi független auditor hamis +100 000 záróegyenleget is elfogadott.
- **PR-008 P1**: szimulált `keeper` csak regisztrált accounttal működik, tényleges permissionless hívás nincs.
- **PR-009 P1**: NEAR aszinkron payout / callback failure / storage költség nincs modellezve.
- **PR-010 P2**: spot-helyettesítésben nincs garantált kapacitásfoglalás.
- **PR-011 P2**: clean checkout / CI / egyparancsos bírói demó / publikálási stratégia hiányzik.

Részletes státusz és elfogadási feltételek: `docs/BUGS.md`.

## G. Határok és nem-célok

- **Nem építünk** teljes production marketplace-et vagy compliance-/fizikai kapacitásigazolási rendszert a hackathonra.
- **Nem portoljuk** a Python-optimálót Rustba; csak a kis, biztonságos és ellenőrizhető okosszerződés kerül Rustba.
- **Nem kezdünk** újabb általános Python piactesztet, amíg a minimális NEAR-tranzakciós ciklus nincs bizonyítva.
- **Nem igényelhetünk** fizetős API-t, GPU-t vagy frontend-fejlesztést.
- **Nem publikálunk** privát kulcsot, seed phrase-t, valódi pénzügyi adatot, bizalmas kutatási forrást és nem módosítunk nyilvános repó-állapotot jóváhagyás nélkül.

## H. NEAR Hackathon (időérzékeny, ellenőrizendő)

- Hivatalos oldal: https://nearhackathon.com/
- Hivatalos submit checklist: https://github.com/nearai/near-hackathon-prompt-examples/blob/main/SUBMITTING.md
- Releváns kategóriák: `agents` (Agent Economy) és `swarms` (AI Swarms). A többi track csak szabályellenőrzés után.
- Beadási határidő a 2026-11-03 ellenőrzött checklist szerint **2026-11-14 23:59 UTC**, Budapest **2026-11-15 00:59 CET**.
- Publikus repó + reprodukálható README + nyilvános X demóposzt képekkel/videóval, mainnet NEAR cím díjfizetéshez, titkok nélkül. A beadás egyszeri és utólag nem módosítható a checklist szerint.
- **Proveniencia kockázat:** „Code written since the announcement counts” — a „bejelentés” időpontja / korábbi modulok jogosultsága még tisztázandó. A Git commit history és a régi/új kód tételes elkülönítése kötelező.
- A szabályokat nevezés előtt **újra kell olvasni**, mert változhatnak.

## I. Hét kapu, 2026-11-03

| # | Kapu | Audit-állapot |
|---|---|---|
| 1 | Hackathon-kód eredete és jogszerűség | Nem igazolt |
| 2 | Indokolt NEAR-szükségesség | Nem igazolt |
| 3 | 3 külön signer, valós chain-ügylet | Bukott |
| 4 | Objektív digitális proof | Bukott |
| 5 | Clean checkout + egyparancsos bírói demo | Részleges |
| 6 | Robusztus gazdasági előny | Bukott mint bizonyító állítás |
| 7 | Privát IP és publikus kód határ | Nem igazolt |

## J. Következő kizárólagos fejlesztési feladat

**M0: új GitHub-repo, reprodukálható Rust toolchain + specifikáció.**

- Repó: `lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis` (2026-11-03 óta nyilvános; a felhasználó így hagyta jóvá).
- Első commit: repo-kompatibilis `AGENTS.md`, `PROJECT_MASTER.md`, `docs/` kontrollfájlok; ne importáljuk teljes egészében a régi Python ZIP-et a jövendő publikus Git historyba.
- A ténylegesen megírandó Rust szerződéshez először rövid, kényszerítő `docs/PROTOCOL_SPEC.md` és állapotgép-tesztvektorok. Amíg ez nincs, **nincs Nagy Generálás**.
- Következő: Cargo projekt pinelt dependencykkel, `cargo test`, `cargo near build`/WASM build, majd `near-workspaces` sandbox; a telepítés és valódi tranzakció **külön kapu**.
- Minimum elfogadási feltétel: buyer, primary, reserve külön account; permissionless timeout; slot-lock; pénzügyileg zárolt opció és objektív proof; nincs dupla payout; testnet receipts.

## K. Munkavégzési protokoll és hatásköri döntés

A felhasználó **GitHub Codespaces-t asztali VS Code-ból** használ, minimális helyi hardverrel. ChatGPT írja/ellenőrzi a forrást, specifikációt és teszteket; a felhasználó hagyja jóvá a külső fiók-, pénz-, publikálási- és nevezési műveleteket. Minden chattel **a repo aktív állapotát kell újraolvasni**. `main`-t csak tesztelt, review-zható változások módosíthatják. A fejlesztési dokumentum ne állítsa a majdani munkát már késznek.

## L. Történeti forrás-archívumok (nem tekinthetők a repó részének)

1. `Prime_Radiant_DAG_Risk_Research_2026-11-02.zip` — feladatfüggőségi gráf és kockázati optimalizálás.
2. `Prime_Radiant_Agent_Economy_Milestone_02.zip` — többügynökös szimulált gazdaság, első elszámolási motor.
3. `Prime_Radiant_Economic_Platform_Validation_2026-11-03.zip` — többvevős piaci validáció.
4. `Prime_Radiant_Nomogenesis_Protocol_V2_2026-11-03.zip` — 95 tesztes szigorított Python-referencia.
5. `Prime_Radiant_Independent_GO_NO_GO_Audit_2026-11-03.zip` — ellenpróbák, erősebb kontroll, audit, nyitott hibák.

A fájlnevek nem garantálják, hogy egy **új chat** automatikusan eléri ezeket. Ha kell egy régió/ZIP teljes tartalma, a csomagot a felhasználó újra csatolhatja, vagy privát, tartós helyre menti. Az új repó forrása ettől függetlenül elsőbbséget élvez.

## M. Kötelező repóminőség és szerzőségi integritás — ADR-006

A felhasználó elsőrendű elvárása: a Prime Radiant **nem lehet felismerhetően összecsapott, generikus, „vibe-coded” AI-projekt**. Egy külső mérnöknek és a hackathon bíráinak azonnal átlátható, következetes, tesztelt, kézzel is karbantartható mérnöki munkát kell látniuk. Az AI-eszközök használata megengedett a vonatkozó szabályok szerint, de nem állítunk hamis emberi szerzőséget, és nem hamisítunk fejlesztési előzményt.

- Minimalista, idiomatikus Rust; domain-központú elnevezések; kis modulok; érthető state machine, egyértelmű pénzügyi invariánsok.
- Nem halmozunk keretrendszereket, wrapper-rétegeket, díszítő felületeket, felesleges fájlokat és AI-generált töltelékszöveget.
- A README tiszta és tényszerű: kipróbált parancsok, kimenet, korlátok, világos projektérték; tesztek és tranzakciók bizonyítékkal.
- Minden build után funkcionális és támadási tesztek is szükségesek, ahol indokolt. Külön változatlan regresziós tesztek védik a korábbi mérföldköveket.
- A munkát a felhasználó másolt Bash/Python scaffoldokkal futtatja Codespacesben; a segédscriptek célzottak, újrafuttathatók, nem írnak felül rejtetten meglévő működő kódot.

Részletek: `docs/ENGINEERING_STANDARDS.md`, `AGENTS.md`, `docs/DECISIONS.md` ADR-006.
