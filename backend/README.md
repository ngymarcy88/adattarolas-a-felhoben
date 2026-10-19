# Backend

NestJS 12 + TypeScript API-alap, központilag validált konfigurációval, Prisma 7/PostgreSQL kapcsolattal, request ID middleware-rel és globális hibakezeléssel. Jelenleg egyetlen endpoint létezik: a publikus `GET /api/v1/health`, válasza `{"status":"ok"}`. Ez API-liveness jelzés, nem folyamatos adatbázis-/MinIO-readiness vizsgálat.

## Futtatás és konfiguráció

A gyökérbeli README Quickstart részét kövesd. Node.js 22.23.2 és npm 10 az induló környezet; a két workspace egyetlen gyökérbeli lockfile-t használ. A függőségeket a repógyökérből telepítsd: `npm ci`.

A backend a root `.env` fájlt olvassa, központilag validálja a szükséges változókat, majd `127.0.0.1:3000` címen indul az alapkonfigurációval. Hibás konfiguráció és sikertelen indulás nem ad vissza credentialt vagy providerüzenetet. A frontend origin alapértéke `http://127.0.0.1:5173`; a CORS credentialt és pontos origint használ, wildcard nélkül.

A repógyökérből, a helyi infrastruktúra indítása után:

```bash
npm run db:generate
npm run db:validate
npm run db:migrate
npm run dev:backend
```

A `db:migrate` a verziózott migrációkat alkalmazza; új fejlesztői migráció készítéséhez a `db:migrate:dev` script használható. A Prisma-kliens CommonJS formátumban a `src/generated/prisma` mappába generálódik; nem commitolt buildtermék. A PostgreSQL-kapcsolat a Prisma pg adapterén át történik.

További workspace-parancsok:

```bash
npm run typecheck --workspace backend
npm run test --workspace backend
npm run build --workspace backend
npm run start --workspace backend
```

A `start` már létező buildet és generált klienst igényel. A teljes workspace-buildet a root `npm run build` készíti elő. A build/teszt és a kézi indítás tényleges ellenőrzési állapota a [tesztriportban](../docs/04_quality/test_report.md) található; a scaffold létrehozása önmagában nem telepítési bizonyíték.

## Hatókör

A kezdeti Prisma-modellek: `User`, `FileObject`, `ShareLink`, `AuditEvent`. A séma és migráció az adatbázisalapot adják; regisztráció, login, kvótaműveletek, upload, sharing, import és processor még nincs implementálva. A storage adapter és az AWS SDK sincs még bevezetve. Az új import-/processing-entitásokat a részletes szerződés lezárása után külön migráció adja hozzá.

A Jest unit tesztek a konfigurációt, request ID-t, generikus hibamappinget és health választ fedik; a hálózati/adatbázis-együttműködés valós próbáját ezek nem helyettesítik. CI, integration és e2e suite nincs.
