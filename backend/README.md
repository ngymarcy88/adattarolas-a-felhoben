# Backend

NestJS 11 + TypeScript API-alap, központilag validált konfigurációval, Prisma 7/PostgreSQL kapcsolattal, request ID middleware-rel és globális hibakezeléssel. Jelenleg egyetlen endpoint létezik: a publikus `GET /api/v1/health`, válasza `{"status":"ok"}`. Ez API-liveness jelzés, nem folyamatos adatbázis-/MinIO-readiness vizsgálat.

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

A kezdeti Prisma-modellek: `User`, `FileObject`, `ShareLink`, `AuditEvent`. A séma és migráció az adatbázisalapot adják; kvótaműveletek, upload, sharing, import és processor még nincs implementálva. A storage adapter és az AWS SDK sincs még bevezetve. Az új import-/processing-entitásokat a részletes szerződés lezárása után külön migráció adja hozzá.

A Jest unit tesztek a konfigurációt, request ID-t, generikus hibamappinget és health választ fedik; a hálózati/adatbázis-együttműködés valós próbáját ezek nem helyettesítik. CI, integration és e2e suite nincs.

## Jelszóhash/check primitív

A `src/auth/password.service.ts` `PasswordService.hash(password)` és `verify(password, storedHash)` metódusai Node beépített aszinkron scryptjét használják, új npm-függőség nélkül. Véletlen salt és verziózott hash-formátum; hibás rekord nem választhat drága KDF-paramétert. Jelszóváltoztatás/csonkolás nincs, a technikai korlát 1024 UTF-8 bájt. A pontos formátumot, hibákat és terhelési korlátokat az [ADR-014](../docs/02_architecture/adr/ADR-014-password-hashing.md) rögzíti.

Célzott unit teszt a repógyökérből: `npm run test --workspace backend -- --runTestsByPath test/password.service.spec.ts`. A service az AuthModule regisztrációs végpontjába van kötve. A `POST /api/v1/auth/register` validál, normalizál, scrypt hash-t ment, és csak publikus usermezőket ad. A `DEFAULT_USER_STORAGE_LIMIT_BYTES` szerverkonfiguráció defaultja 1 GiB; used/reserved kezdetben a DB defaultja szerint nulla. Az Origin, input, kezdeti peer-rate-limit és egyidejű hash-védelem részletei az [API-ban](../docs/03_design/api.md#post-authregister) vannak. A login/logout/me HttpOnly JWT-cookie-val implementált; frontend, audit, valós DB- és browser-próba külön feladat. A regisztrációs unit tesztek mockolt Prisma/hash függőségekkel futnak; a valódi scryptet a külön password suite teszteli.


## Login, logout és aktuális felhasználó

- `POST /api/v1/auth/login`: email/password DTO, egységes 401, scrypt verify; 200 publikus userrel és `cloudvault_access` cookie-val.
- `POST /api/v1/auth/logout`: 204, azonos attribútumú cookie-törlés; hiányzó/lejárt cookie mellett is idempotens, Origin kötelező.
- `GET /api/v1/auth/me`: JWT- és DB-user-ellenőrzés, 200 publikus user vagy 401/503.

A regisztráció és login ugyanazon 5/60s peer-korlátot és egyetlen drága credential-művelet/folyamat kapacitást osztja meg. Logout csak Origin-guardot használ. A cookie host-only, `Path=/api/v1`, `HttpOnly`, `SameSite=Lax`, productionben `Secure`; JWT soha nem kerül JSON-ba. Az ADR-010 szerinti stateless logout nem vonja vissza a korábban másolt JWT-t. `JWT_EXPIRES_IN` alapja 1h, támogatott egész s/m/h/d, 1 másodperc–24 óra; frontend/backend same-site, production HTTPS szükséges. Részletes claim-, input- és hibaszabályok az API-ban. Új kis auth-függőség: rögzített `jsonwebtoken@9.0.3` és fejlesztési típusa; nincs cookie-parser, session store vagy új framework.
