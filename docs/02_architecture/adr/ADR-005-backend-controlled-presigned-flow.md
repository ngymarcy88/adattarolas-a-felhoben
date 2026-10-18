# ADR-005: Backend-controlled presigned upload/download flow

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

Tervezett állapot – nincs implementált API vagy storage adapter.

## Context

A browsernek médiaobjektumot kell mozgatnia anélkül, hogy tartós storage credentialt kapna vagy az authorizationt saját maga döntené el. A közvetlen bináris adatút tehermentesíti a backendet, de pending rekordot, confirm lépést, storage-oldali ellenőrzést és hibás objektum cleanupot igényel.

## Decision

A Core MVP backend-kontrollált presigned flow-t használ:

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
- Multipart upload azonnal: a Core MVP scope-jához túl nagy komplexitás; ADR-009 szerint Later.

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
