# Test report

**Tervezett állapot – nem implementált funkcionalitás.**

## Baseline

| Mező | Érték |
|---|---|
| Dátum | 2026-07-12 |
| Projektállapot | Dokumentáció-only |
| Backend test runner | Nincs |
| Frontend test runner | Nincs |
| Package manifest | Nincs |
| Alkalmazáskód | Nincs |
| Unit tesztek száma | 0 |
| Integration/contract/e2e tesztek száma | 0 |
| Futtatott alkalmazásteszt-parancs | Nincs |
| Alkalmazásteszt-eredmény | **NOT RUN – nincs futtatható tesztkörnyezet** |

## Értelmezés

A `NOT RUN` nem PASS és nem FAIL. A repository jelenlegi mérföldköve dokumentációs szerződéseket készít elő; nem áll rendelkezésre olyan `package.json`, script vagy forráskód, amelyen Jest/Vitest futtatható lenne.

A Markdown-link, Mermaid, whitespace, secret- és konzisztenciaellenőrzések dokumentációs verifikációk. Ezek eredménye a `docs/07_ai/verification_log.md` fájlba kerül, és nem számít automata alkalmazástesztnek.

## Tervezett első frissítés

A riport az első backend/frontend scaffold után frissíthető, ha már létezik:

- tényleges teszt runner és package script;
- legalább egy megvalósított, unit tesztelhető use case;
- rögzített Node/npm és dependency verzió;
- reprodukálható parancs és teljes parancskimenet;
- dátum, környezet, PASS/FAIL darabszám és ismert korlát.

## Kötelező jövőbeli formátum

| Dátum | Környezet | Parancs | Passed | Failed | Skipped | Következtetés |
|---|---|---|---:|---:|---:|---|
| YYYY-MM-DD |  |  | 0 | 0 | 0 |  |

Hibás vagy skipped tesztet nem szabad elhallgatni. Coverage csak tényleges reportból, a használt konfigurációval együtt rögzíthető.
