# Prompt Log

Ez a napló a projekt szempontjából fontos AI-promptokat és azok eredményét követi. Nem minden beszélgetés kerül ide, csak azok, amelyek döntést, dokumentumot, kódot vagy verifikációt befolyásoltak.

| ID | Dátum | Cél | Prompt röviden | Eredmény / artefakt | Kézi módosítás | Verification |
|---|---|---|---|---|---|---|
| P-001 | 2026-06-16 | 1. mérföldkő repo-alap tervének elkészítése | A felhasználó a feltöltött PDF követelményei, a `docs/plan.md` és a `docs/milestones.md` alapján kért tervet az első mérföldkőre. | Elfogadott implementációs terv, majd repo-alap fájlok: `README.md`, `docs/00_index.md`, `.env.example`, `docs/07_ai/*`. | A scope az 1. mérföldkőre lett szűkítve; nem készül runtime app scaffold, package manager vagy Docker Compose. | V-001, V-002, V-003, V-004 |
| P-002 | 2026-06-21 | A projektirányítás összehangolása a hivatalos követelményekkel | A két hivatalos követelményfájl alapján a branch stratégia, a későbbi teszt/CI mérföldkő, az adatmodell-nevek, a restore scope és az AI Manifest javítása. | Frissített `AGENTS.md`, `docs/plan.md`, `docs/milestones.md`, kapcsolódó README-k és `docs/07_ai/*`. | A régi git history változatlan maradt; a restore egyszerű MVP-funkció lett; ismeretlen AI-modellverziók helyett „nem rögzített” jelölés került a manifestbe. | V-006 |

## Új bejegyzés sablon

| ID | Dátum | Cél | Prompt röviden | Eredmény / artefakt | Kézi módosítás | Verification |
|---|---|---|---|---|---|---|
| P-XXX | YYYY-MM-DD |  |  |  |  |  |
