# Design dokumentumok

**Tervezett állapot – nem implementált funkcionalitás.**

Ez a mappa az alkalmazás tervezett technikai szerződéseinek kanonikus helye. A dokumentumok nem igazolnak létező API-t, adatbázissémát vagy hibakezelő implementációt.

- [API-szerződés](api.md): a `/api/v1` tervezett endpointjai, hitelesítés, request/response példák és authorization szabályok.
- [Adatmodell](data_model.md): entitások, mezők, relációk, állapotgépek, tranzakciós és indexelési invariánsok.
- [Hibakezelés](error_handling.md): egységes nested error wrapper, hibakódok, HTTP-leképezés és biztonságos provider-hibamapping.
- [Traceability mátrix](traceability.md): szakmai pillérek, capabilityk, user storyk, endpointcsoportok, entitások és tervezett unit tesztek kapcsolata.

Eltérés esetén a termék-scope source of truth dokumentuma a `docs/01_product/scope_contract.md`, a technikai döntéseké a `docs/02_architecture/adr/`. Implementáció kezdetekor e dokumentumokat a tényleges controller-, DTO- és Prisma-szerződéssel együtt kell frissíteni.
