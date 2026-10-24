# Adattárolás a felhőben – CloudVault

S3-kompatibilis objektumtárolóra épülő személyes médiafájl-kezelő BSc szakdolgozati projekt.

## Jelenlegi állapot

Elkészült a **lokális technikai alap**: Vue/Vite frontend, NestJS backend, validált konfiguráció, PostgreSQL–MinIO Docker Compose és a négy alapentitás Prisma-sémája/kezdeti migrációja. A kezdőoldal a backend liveness végpontját ellenőrzi. A backend regisztráció (`POST /api/v1/auth/register`) elkészült: validált adatok, scrypt hash, szerveroldali kezdőkvóta, Origin- és kezdeti terhelésvédelem; JWT/cookie kiadása nélkül. A login/logout és az aktuális user (`GET /api/v1/auth/me`) HttpOnly JWT-cookie-val is implementált, unit tesztekkel; a fájlfeltöltés, galéria, megosztás, restore, folytatható import és képfeldolgozás még nem implementált. A frontend `/register` és `/login` űrlapja mezőhibákkal, loading/disabled állapottal, biztonságos hibaüzenetekkel és sikeres regisztrációs visszajelzéssel, valamint a `/app` védett fiókútvonal is implementált; minden belépéskor a backend `/auth/me` végpontját ellenőrzi, külön loading/401/elérhetetlenségi állapottal. A health válasza nem folyamatos DB/storage readiness-vizsgálat. Az auth végpontok pontos request/response és hibaszerződése az [API-ban](docs/03_design/api.md#post-authregister) található; a pozitív auth-folyamat szerzői visszaigazolását a tesztriport rögzíti; a részletes negatív auth-, cookie- és közvetlen DB-ellenőrzés még szükséges.

Az első uploadhoz az `UploadOperation` Prisma-modell és SQL-migráció is elkészült: tartós dedupe-azonosság, állapotok és foglaláslezárási mezők. A `POST /api/v1/files/uploads/init` már implementált: cookie+Origin, szigorú képmetaadat-validáció, tartós Idempotency-Key, atomikus kvótafoglalás és rövid create-only PUT URL. Új művelet 201, azonos replay 200; confirm/cleanup és feltöltőfelület még nincs.

A backend S3/MinIO adaptere is implementált: create-only presigned PUT, HEAD, korlátozott feltételes range-read, törlés és biztonságos read URL. Ez belső infrastruktúra; az init API elkészült, a teljes feltöltési folyamat és felület még nincs kész.

A kötelező SZD2 cél a teljes alkalmazás, a folytatható kötegelt képimport, két verziózott processor és restart recovery, valamint összehasonlító mérés/UAT és dolgozat. A részletes import-/processing-szerződés és átviteli technológia kiválasztása külön feladat; a termék-MI opcionális.

## Előfeltételek

- Node.js 22.23.2 (`.nvmrc`) az egyszeri env-generáláshoz. npm 10 vagy újabb csak a helyi Node fejlesztési/tesztelési módhoz kell. A `package.json` kompatibilis Node 24 ágat is enged.
- Docker Engine/Desktop és Docker Compose v2.20+; Linux konténerekkel. Windows/WSL esetén a Docker Desktop fusson, és az adott WSL-disztribúcióhoz legyen Docker-integráció.
- Szabad lokális 3000, 5173, 5432, 9000 és 9001 port; internet az első dependency/image/source letöltéshez.

A MinIO a biztonsági javítást tartalmazó, pontos upstream commitból épül, mert ez a kiadás forrásként érhető el. A buildhez nem kell helyi Go-telepítés; Docker végzi. Az első `docker compose up -d --build --wait` több perc lehet, a későbbi indítás cache-elt. Ez lokális fejlesztői környezet, nem cloud deployment. Részletek: [ADR-013](docs/02_architecture/adr/ADR-013-local-foundation.md).

## Quickstart – teljes alkalmazás Docker Compose-zal

A repository gyökerében, az első indítás előtt:

```bash
node scripts/init-env.mjs
```

Ez véletlen lokális credentialökkel hozza létre az ignore-olt `.env` fájlt, kiírásuk nélkül. Meglévő fájlt nem ír felül; a szükséges mezőket az `.env.example` mutatja. Ehhez Node kell, de helyi dependency-telepítés nem szükséges.

A teljes alkalmazás indítása a gyökérbeli `docker-compose.yaml` alapján:

```bash
docker compose up -d --build --wait
docker compose ps -a
```

A Compose felépíti a képeket és elindítja a PostgreSQL-t, MinIO-t, NestJS backendet és a buildelt Vue frontendet kiszolgáló Nginxet. A `db-migrate` egyszeri service alkalmazza a meglévő Prisma-migrációkat, a `minio-init` biztosítja a privát bucketet és az alkalmazásjogosultságot. A backend csak mindkettő sikeres lefutása után indul, a frontend megvárja a backend health-jelzését. Az egyszeri service-ek `Exited (0)` állapota normális. Nem kell külön `npm ci`, migráció vagy két dev terminál.

A backend a konténerben `0.0.0.0:3000` címen figyel; a host felől minden publikált port csak `127.0.0.1` címen érhető el. A DB URL kódolt hitelesítő adatai és adatbázisneve megmaradnak, csak a belső cím lesz `postgres:5432`. A backend belső storage-címe `http://minio:9000`. A böngészős API-cím továbbra is a host címe, nem a Docker-service neve. A frontendbe kizárólag a publikus `VITE_API_BASE_URL` kerül buildkor; credential és `.env` nem kerül a képek build contextjébe.

Nyisd meg a [frontend kezdőoldalát](http://127.0.0.1:5173). A „Regisztráció” link a `/register` űrlapra vezet: név, e-mail, legalább 15 karakteres, nagybetűt, számjegyet és speciális karaktert tartalmazó jelszó és megerősítés. A mező alatti lista gépelés közben jelzi a teljesült és hiányzó feltételeket; a jelszómezők Mutatás/Elrejtés gombbal rendelkeznek. A backend is ellenőrzi az új regisztráció szabályait; a meglévő fiókok belépése változatlan. Siker után a visszajelzésből lépj a `/login` oldalra; nincs automatikus beléptetés. A „Saját fiók” (`/app`) munkamenet nélkül szintén a loginra vezet. Kipróbáláshoz használj szintetikus adatokat. Belépés után fiókadatok és kijelentkezés jelenik meg; fájlgaléria/usage még nem. A [health endpoint](http://127.0.0.1:3000/api/v1/health) válasza `{"status":"ok"}`. Azonos hostot használj a frontend és backend URL-ben; `localhost` és `127.0.0.1` keverése CORS/cookie eltérést okoz. Egyedi port esetén az `.env` URL-jeit, portját és a Compose/Vite portbeállítását együtt módosítsd.

A MinIO konzol a [9001-es porton](http://127.0.0.1:9001) érhető el a helyi `.env` `MINIO_ROOT_*` értékeivel. A backend külön `S3_*` alkalmazásazonosságot kap, kizárólag a privát buckethez; a SPA csak `VITE_API_BASE_URL` publikus konfigurációt olvas. Valós AWS/OCI-fiók nem szükséges.

Állapot és leállítás, a tárolt adatok megtartásával:

```bash
docker compose ps -a
docker compose logs --tail=100 backend frontend db-migrate minio-init
docker compose down
```

A named volume-ok megmaradnak. A `docker compose down -v` adatot töröl, ezért nem része az alap leállításnak. Már inicializált adatbázis mellett a `.env` jelszavának cseréje önmagában nem módosítja a DB-felhasználó jelszavát.

## Opcionális fejlesztés helyi Node dev szerverekkel

Ha hot reload kell, állítsd le a teljes alkalmazást (`docker compose down`), majd csak a két infrastruktúra-service-t indítsd; a kötetek megmaradnak:

```bash
npm ci
docker compose up -d --build --wait postgres minio
docker compose run --build --rm minio-init
npm run db:generate
npm run db:migrate
```

Ezután két külön terminálban: `npm run dev:backend` és `npm run dev:frontend`. A hoston futó backendhez az `.env` `BACKEND_HOST=127.0.0.1`, `DATABASE_URL` és `S3_ENDPOINT` lokális hostcímei használatosak. A meglévő `infra:*` npm-parancsok infrastruktúra-segédek; az elsődleges teljes indítás a fenti közvetlen Compose-parancs.

## Build, typecheck és unit tesztek

```bash
npm ci
npm run db:validate
npm run typecheck
npm test
npm run build
```

A build és typecheck először generálja a Prisma Clientet. A tesztek izolált Jest/Vitest unit tesztek, nem igényelnek futó PostgreSQL-t vagy MinIO-t. A beépített konfigurációs értékek validálása és a Prisma-parancsok futtatása a Quickstart szerint létrehozott `.env`-et igényli. Valós legutóbbi eredmények: [tesztriport](docs/04_quality/test_report.md).

Épített backend indítása: `npm run start --workspace backend`. Frontend build megtekintése: `npm run preview --workspace frontend`. Migrációk normál alkalmazása `npm run db:migrate` (Prisma migrate deploy); új fejlesztői migráció generálása később `npm run db:migrate:dev -- --name <name>`. Destruktív reset nem Quickstart lépés.

## Automatikus unit tesztek (GitHub Actions)

A [Tests workflow](.github/workflows/tests.yml) a `main`-re nyitott/frissített pull requesteknél és a `main` pushainál fut. A GitHub Actions felületen kézzel is indítható, miután a workflow a default branchre került. Linux runneren az `.nvmrc` szerinti Node-verziót és a gyökérbeli lockfile-t használja: `npm ci` → `npm run db:generate` → `npm test`.

A Prisma-generálás szintetikus `DATABASE_URL` értéket kap; nem kapcsolódik adatbázishoz. Nem kell repository secret, `.env`, PostgreSQL vagy MinIO. A státusz a PR Checks fülén **Tests / Unit tests**, a részletes kimenet az Actions futásban található. Új commit megszakítja az azonos PR korábbi futását. Ez unit-teszt CI; deployment, integration/e2e, coverage-kapu és automatikus merge nem része. A kötelező merge-kapuhoz külön GitHub branch protection/ruleset beállítás szükséges.

## Hibaelhárítás

- **Docker daemon nem érhető el:** indítsd el Docker Desktopot; WSL-ben ellenőrizd a disztribúció Docker-integrációját és a `docker version` Server részét.
- **Konfiguráció hibás:** az üzenet csak változóneveket ír ki. Egyeztesd `.env.example`-lel, ne másolj credentialt hibajegybe vagy naplóba.
- **Backend nem indul:** `docker compose ps -a` és `docker compose logs --tail=100 db-migrate backend minio-init`; ellenőrizd a service-ek sikerét és a szabad lokális portokat. Sikertelen migráció után javítsd az okot, majd ismételd az indítást; ne töröld a köteteket.
- **A frontend nem éri el az API-t:** a frontend buildjekor érvényes `VITE_API_BASE_URL` és `FRONTEND_PUBLIC_URL` egyezzen a használt hosttal. Publikus frontend-konfiguráció változtatása után új build kell: `docker compose up -d --build --wait`. A helyi Vite dev szervert elég újraindítani.
- **MinIO-init újrafuttatás:** `docker compose run --build --rm minio-init`; idempotensen biztosítja a privát bucketet és az alkalmazásjogosultságot. A hozzáférési adatok nem kerülnek logba.

A szerző 2026-10-20-án működő indulást és sikeres fióklétrehozást jelzett. A szerzői belépés/védett fiókoldal/kijelentkezés és újraindítás utáni ismételt belépés eredménye a tesztriportban rögzítve van. A részletes negatív auth-, cookie-, DB/storage- és jelszó-UX próbák külön kapuk. Az AI korábbi saját Docker-próbáját a nem elérhető motor blokkolta. A sikeres Compose-config ellenőrzés nem helyettesíti a build/indítás és a regisztráció → login → védett oldal → logout valós DB-s próbáját. Részletek: [tesztriport](docs/04_quality/test_report.md), [ADR-015](docs/02_architecture/adr/ADR-015-full-app-compose.md).

## Stack és struktúra

Vue 3 / Vite / TypeScript / Tailwind CSS / Vue Router; NestJS / Prisma / PostgreSQL; helyben MinIO. Egy npm workspace és gyökérbeli lockfile van, almappákban nincs külön install vagy lockfile. Nincs Pinia vagy integration/e2e tesztkörnyezet; GitHub Actions futtatja a meglévő unit teszteket, deployment nincs.

```text
/
├── AGENTS.md, SKILL.md   # munkaszabályok és témavezetői célok
├── package.json         # npm workspace és gyökérparancsok
├── docker-compose.yaml  # teljes lokális alkalmazás, migráció és bucket-init
├── Dockerfile           # backend és frontend build/runtime célok
├── scripts/             # credentialt nem kiíró env inicializálás
├── infra/minio/         # rögzített upstream build és alkalmazáspolicy
├── backend/             # NestJS, Prisma schema/migrations és Jest unit tesztek
├── frontend/            # Vue/Vite és API-layer unit tesztek
└── docs/                # szakdolgozati tervek és ellenőrzési bizonyítékok
```

Belépési pontok: [dokumentációs index](docs/00_index.md), [terv](docs/plan.md), [mérföldkövek](docs/milestones.md), [API](docs/03_design/api.md), [adatmodell](docs/03_design/data_model.md), [AI-naplók](docs/07_ai/ai_manifest.md). A részletes dokumentáció a megvalósított alapot és a tervezett termékfunkciókat külön jelöli.

## Upload-séma migráció

A normál `docker compose up -d --build --wait` a `db-migrate` service-en keresztül alkalmazza a `20261023000100_upload_operations` migrációt is. Hoston futó Node-fejlesztésnél a szokásos `npm run db:migrate` használandó. Nincs volume-reset vagy új credential.

A migráció írásblokkoló User → FileObject zárolással, egyetlen tranzakcióban fut; korábbi `PENDING_UPLOAD` sor vagy bármely nem nulla `reservedStorageBytes` esetén biztonságosan leáll. Nem talál ki régi idempotenciakulcsot és nem enged el foglalást. Ilyenkor az érintett állományokat és a storage-állapotot külön, kézzel jóváhagyott rendezésnek kell tisztáznia; a hiba miatt ne töröld az adatbázist vagy a köteteket.

Ha a Prisma hibás migrációként rögzítette ezt a leállást, csak az ok rendezése **és a teljes SQL-rollback ellenőrzése után** jelöld visszagörgetettnek a `prisma migrate resolve --rolled-back 20261023000100_upload_operations` paranccsal (a backend workspace-ben), majd ismételd a normál deployt. A resolve önmagában nem javít adatot, és nem jogosít az ellenőrzés megkerülésére. A sémában nem leírt SQL CHECK-eket őrizd meg későbbi migrációknál is.

## Storage adapter kézi ellenőrzése

Az `S3_ENDPOINT` a backend által elérhető cím (Compose-ban `http://minio:9000`); az `S3_PUBLIC_ENDPOINT` a böngésző által elérhető origin (helyben `http://127.0.0.1:9000`). Hiányzó publikus változó host fejlesztésben az endpointot örökli; Compose külön állítja. Az aláírt URL hostját utólag átírni tilos. Távoli gépen a publikus címet és a CORS-origint is a valós eléréshez kell igazítani.

Működő MinIO és lefuttatott `minio-init`, root `.env`, valamint telepített workspace dependencyk mellett:

```bash
npm run storage:verify
```

Ez explicit kézi provider-próba, nem része az `npm test`/CI futásnak. Backend build után szintetikus PNG-t tölt fel véletlen kulcsokra, ellenőrzi a tiltott felülírást, méret/header módosításának elutasítását, HEAD/range/download, bucket-hozzáférés és CORS működését; végül csak a saját próbaobjektumait törli. A parancs nem módosít DB-t vagy kvótát, és nem naplóz hozzáférési URL-t. Az in-flight PUT-ok biztos lezárását és a valódi böngészős uploadot nem bizonyítja. Részletek: [tesztriport](docs/04_quality/test_report.md).

Az upload-init csak a foglalási lépés: jelenleg szintetikus fejlesztői próbára használható az [API-szerződés](docs/03_design/api.md) alapján. Automatikus takarítás hiányában a pending foglalás megmarad, lejárattal sem szabadul fel; a hibás/késői PUT biztos lezárása a confirm/cleanup szelet előtti nyitott kapu. A valós DB-s init/replay/kvóta és rollback ellenőrzése a tesztriportban szerepel.
