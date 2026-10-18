# Product dokumentumok

**Tervezett állapot – nem implementált funkcionalitás.**

Ez a mappa a termékvízió, a scope, a képességek, a tervezett sikermetrikák és a fő felhasználói folyamatok kanonikus gyűjtőhelye. A dokumentumok célállapotot és későbbi elfogadási feltételeket írnak le; nem igazolnak futtatható alkalmazást, API-t, adatbázist vagy tesztet.

## Fázisjelölések

- **Core MVP:** a hat kötelező storage user story és az ezek biztonságos, konzisztens működéséhez szükséges keresztmetszeti képességek.
- **MVP+:** a core működéstől független, opcionális kép-metaadat-javaslat és annak emberi jóváhagyási folyamata.
- **Later:** tudatosan későbbre halasztott bővítések, például multipart upload, automatizált retention purge, cloud deployment, CI/CD, valamint integration és e2e tesztek.

## Dokumentumok és felelősségük

- [Termékvízió](vision.md): probléma, célfelhasználók, értékajánlat, négy szakmai pillér és termékalapelvek.
- [MVP scope contract](scope_contract.md): a hat core user story, elfogadási kritériumaik, keresztmetszeti követelmények és non-goals.
- [Capability map](capability_map.md): Value és Productization képességek `Core MVP`, `MVP+` és `Later` bontásban.
- [Termékmetrikák](metrics.md): a későbbi implementációhoz tartozó mérhető célok és verifikációs módszerek.
- [Fő UX-folyamatok](ux_flows.md): a core storage folyamatok, hibautak és az opcionális, human-in-the-loop MI-folyamat.

Eltérés esetén a termékvízió és az MVP elfogadási kritériumainak source of truth dokumentuma a [scope contract](scope_contract.md). Az API-, adatmodell- és hibaszerződések a `docs/03_design/`, a technikai döntések a `docs/02_architecture/adr/`, az implementációs státusz és bizonyítékok pedig a `docs/milestones.md` dokumentumban követendők.
