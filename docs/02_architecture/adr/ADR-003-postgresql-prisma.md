# ADR-003: PostgreSQL + Prisma metadata store

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

Tervezett állapot – nincs Prisma schema, migráció vagy futó adatbázis.

## Context

A bináris média object storage-ban él, de az alkalmazás relációs és tranzakciós metaadatot igényel: user, ownership, fájlállapot, usage/reservation, share-link, audit és opcionális MI-javaslat. A kvótaelszámolás és az idempotens állapotátmenetek konzisztens tranzakciókat igényelnek.

## Decision

Az alkalmazási metadata store PostgreSQL, Prisma ORM hozzáféréssel. Core entitások: `User`, `FileObject`, `ShareLink`, `AuditEvent`. Az opcionális MVP+ `AiMetadataSuggestion` külön entitás, hogy a javaslat, provenance és emberi döntés ne keveredjen a kanonikus fájlmetaadattal.

A `User` külön `usedStorageBytes` és `reservedStorageBytes` számlálót tartalmaz. A `FileObject` core állapotai `PENDING_UPLOAD`, `ACTIVE` és `SOFT_DELETED`; a későbbi purge `PURGE_FAILED` állapotot és terminális `PURGED` eseményt használhat.

## Alternatives considered

- MongoDB: rugalmas, de ownership, állapotátmenet és számlálótranzakció szempontjából kevésbé természetes.
- SQLite: egyszerűbb lokális indulás, de eltérne a célkörnyezettől és a concurrency viselkedéstől.
- Kizárólag object metadata: nem alkalmas auth, share token, audit és tranzakciós kvóta kezelésére.
- AI-mezők közvetlenül a `FileObject` rekordban: egyszerűbb, de elveszítené a suggestion provenance-t és az emberi döntés elkülönítését.

## Consequences

- Az állapot- és számlálóváltozások Prisma tranzakcióban kezelhetők.
- A dokumentált adatmodell és a későbbi Prisma schema kötelezően szinkronban tartandó.
- A denormalizált számlálókhoz idempotens use case-ek és reconciliation terv szükséges.
- A ShareLink későbbi revoke/access-limit mezői nem jelentenek Core MVP API-képességet.
- PostgreSQL és Prisma provider-specifikus migrációs fegyelmet igényel.

## Verification

- A későbbi `schema.prisma` mezőit tételesen össze kell vetni a `docs/03_design/data_model.md` dokumentummal.
- Unit tesztek fedik a state transition, quota reservation és exactly-once accounting logikát.
- Az opcionális MI entitás hiánya nem akadályozhat Core MVP migrációt vagy működést.
