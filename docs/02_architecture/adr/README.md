# Architecture Decision Records

## Státusz

Az ADR-ek elfogadott **tervezési döntéseket** rögzítenek. Elfogadott státuszuk nem jelenti azt, hogy a döntés már implementálva vagy futtatással verifikálva van; ezt minden ADR külön jelzi.

## ADR lista

- [ADR-001: Vue 3 + Vite + TypeScript frontend](ADR-001-frontend-stack.md)
- [ADR-002: NestJS backend](ADR-002-backend-framework.md)
- [ADR-003: PostgreSQL + Prisma metadata store](ADR-003-postgresql-prisma.md)
- [ADR-004: S3-compatible object storage és lokális MinIO](ADR-004-s3-compatible-storage-minio.md)
- [ADR-005: Backend-controlled presigned upload/download flow](ADR-005-backend-controlled-presigned-flow.md)
- [ADR-006: Soft delete és delayed purge strategy](ADR-006-soft-delete-delayed-purge.md)
- [ADR-007: Denormalized storage usage and reservation counters](ADR-007-denormalized-storage-usage.md)
- [ADR-008: Magic-number based post-upload validation](ADR-008-magic-number-validation.md)
- [ADR-009: Multipart upload deferred to later phase](ADR-009-defer-multipart-upload.md)
- [ADR-010: Short-lived JWT HttpOnly cookie authentication](ADR-010-jwt-http-only-cookie-auth.md)
- [ADR-011: Idempotent upload confirmation and quota reservation](ADR-011-idempotent-upload-confirm-reservation.md)
- [ADR-012: Optional human-in-the-loop AI metadata suggestions](ADR-012-optional-ai-metadata-suggestions.md)

## Kanonikus döntési határok

- Core MVP: ADR-001–ADR-011 releváns döntései.
- MVP+: ADR-012, külön implementációs go/no-go kapuval.
- Later: ADR-009 multipart upload és ADR-006 automatizált purge része.

## Kötelező ADR-forma

- cím és egyedi azonosító;
- status és date;
- implementation status;
- context;
- decision;
- alternatives considered;
- consequences;
- verification.

Új ADR vagy státuszfrissítés szükséges, ha a stack, auth, storage flow, adatmodell, purge/worker technológia vagy MI-provider stratégia érdemben változik.

## Lokális technikai alap

- [ADR-013: Reproducible local foundation and initial schema](ADR-013-local-foundation.md) – workspace, lokális környezet, Prisma-alap és source-built MinIO; a termékfunkciók ettől még tervezettek.

## Jelszóhash-elési alap

- [ADR-014: Asynchronous scrypt password hashing](ADR-014-password-hashing.md) – külön hash/check service, auth endpointok nélkül.
