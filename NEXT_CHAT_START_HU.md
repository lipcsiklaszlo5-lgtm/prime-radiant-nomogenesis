# Másold be ezt új chat indításakor

Repo: https://github.com/lipcsiklaszlo5-lgtm/prime-radiant-nomogenesis

Először `git fetch origin --prune`, `git status -sb`,
`git branch -avv`, `git rev-parse HEAD`. A legújabb ellenőrzött
munkaág: `feat/r7-demo-02-recovery`, alap `1103b7c`.
Ne a régi M0 `main`-ből kezdd a fejlesztést.

Olvasási sorrend: `AGENTS.md` -> `docs/CURRENT_STATE.md` ->
`docs/HANDOFF.md` legelső aktuális bejegyzése ->
`docs/worklog/R7-DEMO-02-recovery-lifecycle.md`.
A pontos új commit SHA-t a munkaág távoli HEAD-jéből olvasd ki.

A helyi Sandbox demó igazolta a kontrollált HTTP 503 kiesést,
két önálló buyer jóváhagyását, egy elutasítást, az atomi V2
mentést, két CSV provider proofot, két befejezett munkát és
48 UNIT végső elszámolást. Public V2 Testnet, valós külső
kiesés és natív withdrawal nem igazolt.

Következő egyetlen ticket: `R7-REPO-01`: ágak, README és
clean-checkout kapu; majd a `main` ellenőrzött felzárkóztatása.
Az eredeti feature munkakönyvtár nem commitált fájljait ne töröld.
Teszt-PASS-t csak konkrét futásból állíts.
