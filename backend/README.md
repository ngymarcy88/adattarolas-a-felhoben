# Backend

Ez a mappa a későbbi backend API helye. Jelenleg csak dokumentációs placeholder; nincs NestJS scaffold, package manifest, Prisma schema vagy futtatható kód.

Tervezett stack:

- Node.js
- TypeScript
- NestJS
- Prisma
- PostgreSQL
- AWS SDK v3 S3-kompatibilis storage adapterhez
- Jest unit tesztek

Tervezett modulhatárok: `auth`, `users`, `files`, `storage`, `sharing`, `audit`, `health`, `config` és `common`; az opcionális `ai-metadata` csak MVP+ fázisban kerülhet hozzájuk.

A pontos telepítési, fejlesztői, migrációs és tesztparancsok csak a backend későbbi inicializálása és kézi ellenőrzése után kerülhetnek ide és a root `README.md` Quickstart részébe.
