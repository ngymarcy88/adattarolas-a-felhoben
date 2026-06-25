# ADR-ek

Ez a mappa az Architecture Decision Record fájlok helye. A 3. mérföldkő első ADR-készlete `Accepted` státuszú, és a későbbi implementáció technikai alapjait rögzíti.

## ADR lista

- [ADR-001: Vue 3 + Vite + TypeScript frontend](ADR-001-frontend-stack.md)
- [ADR-002: NestJS backend](ADR-002-backend-framework.md)
- [ADR-003: PostgreSQL + Prisma metadata store](ADR-003-postgresql-prisma.md)
- [ADR-004: S3-compatible object storage és lokális MinIO](ADR-004-s3-compatible-storage-minio.md)
- [ADR-005: Backend-controlled presigned upload/download flow](ADR-005-backend-controlled-presigned-flow.md)
- [ADR-006: Soft delete és delayed purge strategy](ADR-006-soft-delete-delayed-purge.md)
- [ADR-007: Denormalized User.usedStorageBytes](ADR-007-denormalized-storage-usage.md)
- [ADR-008: Magic number based file validation](ADR-008-magic-number-validation.md)
- [ADR-009: Multipart upload deferred to later phase](ADR-009-defer-multipart-upload.md)

## Forma

Minden ADR tartalmazza:

- cím, dátum, státusz;
- context;
- decision;
- legalább két alternatíva;
- következmények;
- verification terv vagy evidence link.
