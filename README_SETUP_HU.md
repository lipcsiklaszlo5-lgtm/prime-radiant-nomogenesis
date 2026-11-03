# Prime Radiant — Kontextus és biztonságos fejlesztés

Ez egy GitHub-repóba szánt **munkaátadás és fejlesztési kormányzás**, nem maga a Rust-projekt. Nem tartalmazza a korábbi Python-kódot. Minden fájl publikálható tényeket vagy fejlesztési szabályokat tartalmaz; **a privát kutatási teljes master külön ZIP-ben van**.

**Telepítés az előkészített, nyilvános repóba:** bontsd ki a `Prime_Radiant_Repo_Context_Starter_2026-11-03_public_v3.zip` tartalmát közvetlenül a repó gyökerébe, a `README` mellé. Első commitként: `docs: establish Prime Radiant project source of truth`. Ezután rögzítsd a valódi URL-t és commit SHA-t a `docs/STATUS.md` / `docs/HANDOFF.md` dokumentumokba.

**Több chat között:** új chat első üzeneteként használd a `NEXT_CHAT_START_HU.md` tartalmát, töltsd ki a GitHub URL-t. ChatGPT nem feltétlenül látja automatikusan a GitHubot, a link és az olvasási utasítás ezért szükséges.

**Nagyon fontos:** amit commitolsz egy később nyilvánossá tett repóba, azt nem lehet biztonságosan „eltüntetni” egy utolsó törlő committal: a korábbi Git historyban megmaradhat. **A privát teljes mastert és a régi Python-kódos archive ZIP-eket NE másold ide.** Tartsd ezeket egy külön privát repo-ban vagy a saját biztonságos felhőfájl-gyűjteményedben. A projektben soha nem lehet seed phrase/private key.

**A fejlesztői logika:** (1) specifikáció, (2) kis branch, (3) teszt, (4) commit, (5) dokumentált handoff. Eltérő chat párhuzamos munkája esetén külön branch, nem közös felülírás.
