# Adattárolás a felhőben – CloudVault

S3-kompatibilis objektumtárolóra épülő személyes médiafájl-kezelő BSc szakdolgozati projekt.

## Jelenlegi állapot

Elkészült a **lokális technikai alap**: Vue/Vite frontend, NestJS backend, validált konfiguráció, PostgreSQL–MinIO Docker Compose és a négy alapentitás Prisma-sémája/kezdeti migrációja. A kezdőoldal a backend liveness végpontját ellenőrzi. A backend regisztráció (`POST /api/v1/auth/register`) elkészült: validált adatok, scrypt hash, szerveroldali kezdőkvóta, Origin- és kezdeti terhelésvédelem; JWT/cookie kiadása nélkül. A login/logout és az aktuális user (`GET /api/v1/auth/me`) HttpOnly JWT-cookie-val is implementált, unit tesztekkel; a védett frontend, fájlfeltöltés, galéria, megosztás, restore, folytatható import és képfeldolgozás még nem implementált. A health válasza nem folyamatos DB/storage readiness-vizsgálat. Az auth végpontok pontos request/response és hibaszerződése az [API-ban](docs/03_design/api.md#post-authregister) található; valós adatbázisos auth- és böngészős cookie-próba még szükséges.

A kötelező SZD2 cél a teljes alkalmazás, a folytatható kötegelt képimport, két verziózott processor és restart recovery, valamint összehasonlító mérés/UAT és dolgozat. A részletes import-/processing-szerződés és átviteli technológia kiválasztása külön feladat; a termék-MI opcionális.

## Előfeltételek

- Node.js 22.23.2 (`.nvmrc`) és npm 10 vagy újabb. A `package.json` kompatibilis Node 24 ágat is enged.
- Docker Engine/Desktop és Docker Compose v2.20+; Linux konténerekkel. Windows/WSL esetén a Docker Desktop fusson, és az adott WSL-disztribúcióhoz legyen Docker-integráció.
- Szabad lokális 3000, 5173, 5432, 9000 és 9001 port; internet az első dependency/image/source letöltéshez.

A MinIO a biztonsági javítást tartalmazó, pontos upstream commitból épül, mert ez a kiadás forrásként érhető el. A buildhez nem kell helyi Go-telepítés; Docker végzi. Az első `infra:up` több perc lehet, a későbbi indítás cache-elt. Ez lokális fejlesztői környezet, nem cloud deployment. Részletek: [ADR-013](docs/02_architecture/adr/ADR-013-local-foundation.md).

## Quickstart

A repository gyökerében:

```bash
npm ci
npm run env:init
npm run infra:up
npm run db:generate
npm run db:migrate
```

Az `env:init` véletlen lokális credentialökkel hozza létre az ignore-olt `.env` fájlt, kiírásuk nélkül. Meglévő `.env`-et nem ír felül; korábbi fájlnál egyeztesd a szükséges mezőket az `.env.example`-lel. A minta placeholder értékei nem futtatási credentialök.

Két külön terminálban:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Nyisd meg a [frontend kezdőoldalát](http://127.0.0.1:5173). A [health endpoint](http://127.0.0.1:3000/api/v1/health) válasza `{"status":"ok"}`. Azonos hostot használj a frontend és backend URL-ben; `localhost` és `127.0.0.1` keverése CORS/cookie eltérést okoz. Egyedi port esetén az `.env` URL-jeit, portját és a Compose/Vite portbeállítását együtt módosítsd.

A MinIO konzol a [9001-es porton](http://127.0.0.1:9001) érhető el a helyi `.env` `MINIO_ROOT_*` értékeivel. A backend külön `S3_*` alkalmazásazonosságot kap, kizárólag a privát buckethez; a SPA csak `VITE_API_BASE_URL` publikus konfigurációt olvas. Valós AWS/OCI-fiók nem szükséges.

Állapot és leállítás, a tárolt adatok megtartásával:

```bash
npm run infra:status
npm run infra:down
```

A named volume-ok megmaradnak. A `docker compose down -v` adatot töröl, ezért nem része az alap leállításnak. Már inicializált adatbázis mellett a `.env` jelszavának cseréje önmagában nem módosítja a DB-felhasználó jelszavát.

## Build, typecheck és unit tesztek

```bash
npm run db:validate
npm run typecheck
npm test
npm run build
```

A build és typecheck először generálja a Prisma Clientet. A tesztek izolált Jest/Vitest unit tesztek, nem igényelnek futó PostgreSQL-t vagy MinIO-t. A beépített konfigurációs értékek validálása és a Prisma-parancsok futtatása a Quickstart szerint létrehozott `.env`-et igényli. Valós legutóbbi eredmények: [tesztriport](docs/04_quality/test_report.md).

Épített backend indítása: `npm run start --workspace backend`. Frontend build megtekintése: `npm run preview --workspace frontend`. Migrációk normál alkalmazása `npm run db:migrate` (Prisma migrate deploy); új fejlesztői migráció generálása később `npm run db:migrate:dev -- --name <name>`. Destruktív reset nem Quickstart lépés.

## Hibaelhárítás

- **Docker daemon nem érhető el:** indítsd el Docker Desktopot; WSL-ben ellenőrizd a disztribúció Docker-integrációját és a `docker version` Server részét.
- **Konfiguráció hibás:** az üzenet csak változóneveket ír ki. Egyeztesd `.env.example`-lel, ne másolj credentialt hibajegybe vagy naplóba.
- **Backend nem indul:** `npm run infra:status`, majd `npm run db:migrate` és `npm run db:generate`; ellenőrizd a lokális portokat.
- **A frontend nem éri el az API-t:** a Vite indításakor érvényes `VITE_API_BASE_URL` és `FRONTEND_PUBLIC_URL` egyezzen a használt hosttal. `.env` változtatás után indítsd újra a dev szervereket.
- **MinIO-init újrafuttatás:** `docker compose run --build --rm minio-init`; idempotensen biztosítja a privát bucketet és az alkalmazásjogosultságot. A hozzáférési adatok nem kerülnek logba.

## Stack és struktúra

Vue 3 / Vite / TypeScript / Tailwind CSS / Vue Router; NestJS / Prisma / PostgreSQL; helyben MinIO. Egy npm workspace és gyökérbeli lockfile van, almappákban nincs külön install vagy lockfile. Nincs Pinia, CI/CD vagy integration/e2e tesztkörnyezet.

```text
/
├── AGENTS.md, SKILL.md   # munkaszabályok és témavezetői célok
├── package.json         # npm workspace és gyökérparancsok
├── compose.yaml         # lokális PostgreSQL, MinIO és bucket-init
├── scripts/             # credentialt nem kiíró env inicializálás
├── infra/minio/         # rögzített upstream build és alkalmazáspolicy
├── backend/             # NestJS, Prisma schema/migrations és Jest unit tesztek
├── frontend/            # Vue/Vite és API-layer unit tesztek
└── docs/                # szakdolgozati tervek és ellenőrzési bizonyítékok
```

Belépési pontok: [dokumentációs index](docs/00_index.md), [terv](docs/plan.md), [mérföldkövek](docs/milestones.md), [API](docs/03_design/api.md), [adatmodell](docs/03_design/data_model.md), [AI-naplók](docs/07_ai/ai_manifest.md). A részletes dokumentáció a megvalósított alapot és a tervezett termékfunkciókat külön jelöli.
