# Prompt Log

Ez a napló a projekt szempontjából fontos AI-promptokat és azok eredményét követi. Nem minden beszélgetés kerül ide, csak azok, amelyek döntést, dokumentumot, kódot vagy verifikációt befolyásoltak.

| ID | Dátum | Cél | Prompt röviden | Eredmény / artefakt | Kézi módosítás | Verification |
|---|---|---|---|---|---|---|
| P-001 | 2026-06-16 | 1. mérföldkő repo-alap tervének elkészítése | A felhasználó a feltöltött PDF követelményei, a `docs/plan.md` és a `docs/milestones.md` alapján kért tervet az első mérföldkőre. | Elfogadott implementációs terv, majd repo-alap fájlok: `README.md`, `docs/00_index.md`, `.env.example`, `docs/07_ai/*`. | A scope az 1. mérföldkőre lett szűkítve; nem készül runtime app scaffold, package manager vagy Docker Compose. | V-001, V-002, V-003, V-004 |
| P-002 | 2026-06-21 | A projektirányítás összehangolása a hivatalos követelményekkel | A két hivatalos követelményfájl alapján a branch stratégia, a későbbi teszt/CI mérföldkő, az adatmodell-nevek, a restore scope és az AI Manifest javítása. | Frissített `AGENTS.md`, `docs/plan.md`, `docs/milestones.md`, kapcsolódó README-k és `docs/07_ai/*`. | A régi git history változatlan maradt; a restore egyszerű MVP-funkció lett; ismeretlen AI-modellverziók helyett „nem rögzített” jelölés került a manifestbe. | V-006 |
| P-003 | 2026-06-21 | A Copilot-javítások után kialakult PR-konfliktus feloldása | A Copilot által normalizált Markdown fájlok és a közben `main`-re került npm-standardizálás konfliktusának feloldása a követelményjavítások elvesztése nélkül. | A friss `main` beolvasztása a `docs/requirements-alignment` branchbe; a `docs/plan.md` tartalmi konfliktusának kézi feloldása. | A követelmény-, adatmodell- és restore-javítások megmaradtak, miközben a `pnpm` hivatkozások npm-re, a workspace fájl pedig `package-lock.json`-ra változott. | V-007 |
| P-004 | 2026-06-22 | A 2. mérföldkő termékvízió- és MVP-dokumentációjának elkészítése | A felhasználó a jóváhagyott terv alapján kérte a két personát, hat user story-t, capability mapet, mérhető célokat és három UX-folyamatot tartalmazó dokumentáció implementálását. | Elkészült a `docs/01_product/` öt termékdokumentuma; frissült a README, a dokumentációs index, a high-level fájlméret-döntés és a mérföldkőlista. | A felhasználó döntése alapján az alap időkorlátos share-link és a 100 MB-os limit MVP lett; a linkvisszavonás, access limit és automatizált purge későbbi scope-ban maradt. | V-008 |
| P-005 | 2026-06-25 | A 3. mérföldkő architektúra- és ADR-dokumentációjának elkészítése | A felhasználó a korábban elfogadott terv implementálását kérte: C4 nézetek, quality attribute-ok, 9 Accepted ADR, indexfrissítések és AI verification bejegyzések. | Elkészültek a `docs/02_architecture/` C4 és quality dokumentumai, a kilenc ADR, valamint frissült a README, a dokumentációs index, a mérföldkőlista és az AI log. | Runtime scaffold, Prisma schema, Docker Compose és API implementáció tudatosan nem készült, mert a 3. mérföldkő dokumentációs hatókörű. | V-009 |

## Új bejegyzés sablon

| ID | Dátum | Cél | Prompt röviden | Eredmény / artefakt | Kézi módosítás | Verification |
|---|---|---|---|---|---|---|
| P-XXX | YYYY-MM-DD |  |  |  |  |  |
