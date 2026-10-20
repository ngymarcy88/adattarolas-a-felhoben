# ADR-005: Backend-controlled presigned upload/download flow

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

Tervezett upload/download – a health/auth API létezik, de nincs implementált upload/download végpont vagy storage adapter.

## Context

A browsernek médiaobjektumot kell mozgatnia anélkül, hogy tartós storage credentialt kapna vagy az authorizationt saját maga döntené el. A közvetlen bináris adatút tehermentesíti a backendet, de pending rekordot, confirm lépést, storage-oldali ellenőrzést és hibás objektum cleanupot igényel.

## Decision

Az első képszelet tervezett backend-kontrollált presigned flow-ja (a teljes resumable SZD2 adatútját nem választja ki):

1. Az authenticated init kérés validálja a deklarált metaadatot és kvótát.
2. A backend `PENDING_UPLOAD` rekordot hoz létre, kvótát foglal, és ötperces presigned PUT URL-t ad.
3. A browser közvetlenül a privát MinIO/S3 bucketbe tölt.
4. A kliens confirmot kér.
5. A backend `HEAD` művelettel ellenőrzi a tényleges méretet és metadata-t, majd bounded range-readből magic-number vizsgálatot végez.
6. Csak siker esetén aktivál és könyvel usage-ot, idempotens módon.

Preview és download előtt a backend ownershipet vagy share tokent ellenőriz, majd külön, rövid életű read URL-t ad a megfelelő response headerekkel.

A backend proxy nem automatikus CORS-fallback. A lokális MinIO CORS beállítása a presigned böngészős adatút előfeltétele.

## Alternatives considered

- Frontend tartós credentialdel: elfogadhatatlan security és authorization kockázat.
- Backend proxy minden bináris adathoz: erősebb központi kontroll, de felesleges API-terhelés és rosszabb skálázhatóság.
- Nyilvános bucket: egyszerű demo, de nem felel meg a privát alapállapotnak.
- Multipart az első képszeletben: most nincs kiválasztva; a kötelező resumable képimporthoz külön PoC/ADR kell. Csak a nagyvideós bővítés marad egyértelműen Later (ADR-009).

## Consequences

- A backend marad az authorization és metadata igazságforrása.
- A browser csak szűk és rövid életű storage-jogot kap.
- Szükséges a CORS, pending expiry, idempotens confirm és cleanup dokumentált kezelése.
- A presigned URL nem kerülhet logba, audit metadata-ba vagy MI-provider provenance mezőbe.
- A `HEAD` és bounded range-read műveletek a storage adapter kötelező részei.

## Verification

- Unit teszt ellenőrzi az init authorizationt, quota reservationt és presign paraméterezést.
- Unit teszt ellenőrzi a confirm validationt és exactly-once transitiont.
- Manuális log review igazolja, hogy URL vagy credential nem kerül naplóba.
- A későbbi lokális smoke check igazolja a MinIO CORS és presigned PUT/GET működését; ez nem része a jelen dokumentációs körnek.

## Első képfeltöltési szerződés pontosítása – 2026-10-20

A kanonikus request/response és hibaút az [API Upload részében](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) található. Az init kötelező ownerhez kötött `Idempotency-Key` alapján egyetlen fájlt/foglalást hoz létre; a normalizált payload és a határidők replaykor változatlanok. A tartós nyilvántartás konkrét adatmodellje külön következő feladat.

A szokásos presigned PUT többször használható és felülírhatja a már ellenőrzött objektumot; a korábbi egyszerű HEAD→ACTIVE leírás ezt önmagában nem zárja ki. Az API elvárt create-only iránya az aláírt `If-None-Match: *`, de a tényleges MinIO/S3 kompatibilitás, megkerülhetetlenség, méretkikényszerítés és a HEAD/range objektumazonosság még implementáció előtti bizonyítási kapu. Belső storage URL nem helyettesíthet böngészőből elérhető, helyesen aláírt publikus URL-t; CORS szükséges.

A késői in-flight PUT és cleanup versenyénél puszta URL-lejárat/HEAD 404 nem elég a reservation felszabadításához. Biztonságos íráslezárás és confirm/cleanup kizárás szükséges; ennek adapteres bizonyítéka külön feladat. Amíg a kapuk nem teljesülnek, ez dokumentált követelmény, nem igazolt biztonsági képesség. A teljes képintegritás/processor eredményét a magic-number ellenőrzés nem garantálja.
