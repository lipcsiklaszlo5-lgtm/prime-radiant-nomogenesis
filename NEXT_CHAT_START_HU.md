# Nomogenesis — folytatás

Repo: https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis

Aktuális fejlesztési ág:
`feat/r7-demo-03-process-outage`.

Olvasd el:
- AGENTS.md
- docs/CURRENT_STATE.md
- docs/HANDOFF.md legfelső bejegyzése
- docs/worklog/R7-DEMO-03-process-outage.md

A main már az ellenőrzött R7-REPO-01 V2 állapotot tartalmazza.
A teljes helyi V2 Sandbox-demó valóban leállított,
külön futó HTTP forrásszerver után sikeresen lefutott.

Két buyer pontosan 6-6 UNIT mentést engedélyezett,
egy elutasított. Két proof és két worker completion
sikerült. A kötelezettségek összege 48 UNIT maradt.

Korlát: a backup payloadok még a demo-controller
előre kiszámított helyi CSV-adataiból származnak.
A megfigyelő csak kérésre vizsgál, nem folyamatosan.

Következő egyetlen lépés: R7-DEMO-03/04.
Két különálló backup adatszolgáltató saját fájlokkal,
és outage utáni, valódi adatlekérés.

Nincs V2 public Testnet vagy mainnet bizonyíték.
Az eredeti munkakönyvtár nem commitált fájljait
ne töröld. Nincs force push vagy reset --hard.
