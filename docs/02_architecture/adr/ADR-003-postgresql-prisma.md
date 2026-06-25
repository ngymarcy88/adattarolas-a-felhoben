# ADR-003: PostgreSQL + Prisma metadata store

## Status

Accepted

## Date

2026-06-25

## Context

A binaris fajlokat object storage tarolja, de az alkalmazasnak strukturalt metaadatokra van szuksege: felhasznalok, fajlok, tulajdonjog, statusz, share linkek, audit es tarhelyhasznalat. Ezek relacios kapcsolatokat es konzisztens tranzakcios frissiteseket igenyelnek.

## Decision

Az alkalmazasi metadata store PostgreSQL lesz, Prisma ORM-mel. A tervezett fo entitasok: `User`, `FileObject`, `ShareLink` es `AuditEvent`.

## Alternatives considered

- MongoDB vagy mas dokumentum-adatbazis: rugalmas, de a kapcsolatok, ownership es usage accounting miatt kevesbe termeszetes.
- SQLite: egyszeru lokalis fejleszteshez, de a celrendszerhez es szakdolgozati architekturahoz gyengebb illeszkedes.
- Kizarolag object storage metadata: nem alkalmas auth, share link, audit es tranzakcios usage kezelesre.

## Consequences

- A relacios modell jol dokumentalhato es megfelel a metadata jellegu adatoknak.
- Prisma tipusos hozzaferest es migracios alapot ad.
- A `usedStorageBytes` tranzakcios frissitese service retegbeli Prisma transactionben tortenhet.
- A kesobbi adatmodell dokumentumot es Prisma schemat szinkronban kell tartani.

## Verification

- A kesobbi `prisma/schema.prisma` mezoi osszhangban lesznek a `docs/03_design/data_model.md` dokumentummal.
- Usage accounting valtozasok unit teszttel ellenorizhetok.
- Direkt, ad hoc SQL hasznalat csak indokolt esetben kerulhet be.
