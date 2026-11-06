# Nomogenesis — folytatás

Repo:
https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis

Aktuális ellenőrzött ág:
`feat/r7-demo-03-process-outage`.

Olvasási sorrend:
AGENTS.md -> docs/CURRENT_STATE.md ->
docs/HANDOFF.md -> docs/worklog/
R7-DEMO-03-backup-driven-recovery.md

R7-DEMO-03/04B PASS:
A forrásszerver valóban leállt.
Külön megfigyelő ECONNREFUSED hibát észlelt.
Két külön backup-folyamat az atomi award után
olvasta és adta át a saját CSV-adatát.
A V2 Sandbox ellenőrizte mindkét proofot.
Két buyer beleegyezett, egy elutasított.
Két worker completion sikeres.
A pénzügyi kötelezettség 48 UNIT maradt.

26.122 másodperces helyi wall-clock mérés
a két provider-proof elfogadásáig.

Korlát: szintetikus, azonos gépen futó backupok.
Még nincs V2 public NEAR Testnet végrehajtás.
Nincs igazolt natív withdrawal vagy külső audit.

Következő egyetlen ticket: R7-TESTNET-01.
Valódi nyilvános V2 Testnet-tranzakciók,
ellenőrizhető transaction ID-k és elszámolás.

A main és a többi worktree védendő.
Nincs reset --hard vagy force push.
