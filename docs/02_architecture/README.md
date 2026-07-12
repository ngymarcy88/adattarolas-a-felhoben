# Architektúra dokumentumok

## Státusz

**Tervezett állapot – nem implementált funkcionalitás.**

Ez a mappa a célarchitektúrát és a fő technikai döntéseket dokumentálja. A repository jelenleg nem tartalmaz futtatható frontend/backend alkalmazást, adatbázissémát vagy object storage integrációt.

## Dokumentumok

- [C4 Context](c4_context.md): felhasználók, rendszerhatár, object storage és opcionális MI-provider.
- [C4 Container](c4_container.md): Vue SPA, NestJS API, PostgreSQL és MinIO/S3 futtatható egységek.
- [C4 Component](c4_component.md): a NestJS API belső moduljai, Prisma és adapterhatárok.
- [Quality Attributes](quality_attributes.md): security, privacy, reliability, consistency, scalability, maintainability, testability, observability és reprodukálhatóság.
- [ADR-ek](adr/README.md): elfogadott architekturális döntések és verifikációs elvárások.

## Architektúra-szerződések

- A frontend nem tárol S3/MinIO credentialt és nem hoz authorization-döntést.
- A bináris tartalom object storage-ban, az alkalmazási metadata PostgreSQL-ben él.
- Az API stateless; tartós alkalmazási állapot nem lehet folyamatmemóriához kötve.
- A fájllista determinisztikus cursor paginationt használ.
- A storage adapter fedi a presign, metadata, bounded range-read és delete műveleteket.
- Soft delete alatt a fájl továbbra is beleszámít a használatba.
- Az automatizált purge és multipart upload Later scope.
- Az opcionális `ai-metadata` modul MVP+ képesség; kiesése nem blokkolhat core storage műveletet.

## Dokumentációs szintek

- A C4 Container nézetben csak önállóan futtatható vagy külső rendszeregység szerepel.
- Prisma, storage adapter és MI-provider adapter a NestJS API komponensei, nem C4 containerek.
- Az endpointok, DTO-k és response shape-ek kanonikus helye a [design dokumentáció](../03_design/README.md).
