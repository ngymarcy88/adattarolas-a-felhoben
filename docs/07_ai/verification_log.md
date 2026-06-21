# Verification Log

Ez a napló azt követi, hogy az AI-val vagy kézzel készült fontos állítások hogyan lettek ellenőrizve.

| ID | Dátum | Állítás / kockázat | Ellenőrzés módja | Eredmény | Következtetés / változás |
|---|---|---|---|---|---|
| V-001 | 2026-06-16 | A repo tartalmazza az 1. mérföldkőhöz szükséges alapfájlokat. | `rg --files --hidden -g '!.git/**'` | PASS: a lista tartalmazza a root README-t, `.gitignore`-t, `.env.example`-t, `frontend/`, `backend/`, `docs/00_index.md` és `docs/07_ai/*` fájlokat. | A repo-alap struktúrája ellenőrizhető. |
| V-002 | 2026-06-16 | A `README.md` UTF-8 szövegként olvasható, nincs UTF-16 BOM. | `file README.md` és `xxd -g 1 -l 4 README.md` | PASS: `README.md: Unicode text, UTF-8 text`; az első byte-ok `23 20 41 64`, nem UTF-16 BOM. | A README normalizálva lett UTF-8 Markdownra. |
| V-003 | 2026-06-16 | A `.gitignore` tiltja a lokális secret és build artifact fájlokat, miközben engedi a `.env.example` sablont. | `git check-ignore` próba `.env`, `.env.local`, `node_modules/foo.js`, `dist/app.js`, `.vscode/settings.json`, `.env.example` mintákkal. | PASS: `.env`, `.env.local`, `node_modules/`, `dist/`, `.vscode/` ignore-olt; `.env.example` `git check-ignore -q` exit kódja `1`, tehát trackelhető. | A secret és artifact hygiene alapjai rendben vannak. |
| V-004 | 2026-06-16 | Nincs nyilvánvaló valódi secret a repo-ban; a `.env.example` csak placeholder értékeket tartalmaz. | `rg --hidden -n -i "token|password|secret|access[_-]?key|private[_-]?key" -g '!.git/**'` és kézi átnézés. | PASS: találatok csak dokumentációs/policy szövegek, adatmodell-mezők vagy `change-me-*` placeholder értékek. | Nem került valódi credential a repóba. |
| V-005 | 2026-06-16 | A README és a docs index linkjei létező repo-fájlokra mutatnak. | Scriptelt Markdown link ellenőrzés a `README.md` és `docs/00_index.md` fájlokon. | PASS: `All checked Markdown links exist.` | A belépési dokumentumok belső linkjei működnek. |

## Új bejegyzés sablon

| ID | Dátum | Állítás / kockázat | Ellenőrzés módja | Eredmény | Következtetés / változás |
|---|---|---|---|---|---|
| V-XXX | YYYY-MM-DD |  |  |  |  |
