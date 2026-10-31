# Adattárolás a felhőben – CloudVault

S3-kompatibilis objektumtárolóra épülő személyes médiafájl-kezelő BSc szakdolgozati projekt.

## Jelenlegi állapot

Elkészült a **lokális technikai alap**: Vue/Vite frontend, NestJS backend, validált konfiguráció, PostgreSQL–MinIO Docker Compose és a négy alapentitás Prisma-sémája/kezdeti migrációja. A kezdőoldal a backend liveness végpontját ellenőrzi. A backend regisztráció (`POST /api/v1/auth/register`) elkészült: validált adatok, scrypt hash, szerveroldali kezdőkvóta, Origin- és kezdeti terhelésvédelem; JWT/cookie kiadása nélkül. A login/logout és az aktuális user (`GET /api/v1/auth/me`) HttpOnly JWT-cookie-val is implementált, unit tesztekkel; megosztás, restore, valódi folytatható import még nem implementált; a thumbnail-worker aktuális határát az alábbi új fejezet rögzíti; a képgaléria és eredeti-preview már működő szelet. A frontend `/register` és `/login` űrlapja mezőhibákkal, loading/disabled állapottal, biztonságos hibaüzenetekkel és sikeres regisztrációs visszajelzéssel, valamint a `/app` védett fiókútvonal is implementált; minden belépéskor a backend `/auth/me` végpontját ellenőrzi, külön loading/401/elérhetetlenségi állapottal. A health válasza nem folyamatos DB/storage readiness-vizsgálat. Az auth végpontok pontos request/response és hibaszerződése az [API-ban](docs/03_design/api.md#post-authregister) található; a pozitív auth-folyamat szerzői visszaigazolását a tesztriport rögzíti; a részletes negatív auth-, cookie- és közvetlen DB-ellenőrzés még szükséges.

Az első uploadhoz az `UploadOperation` Prisma-modell és SQL-migráció is elkészült: tartós dedupe-azonosság, állapotok és foglaláslezárási mezők. A `POST /api/v1/files/uploads/init` már implementált: cookie+Origin, szigorú képmetaadat-validáció, tartós Idempotency-Key, atomikus kvótafoglalás és rövid create-only PUT URL. Új művelet 201, azonos replay 200; A `POST /api/v1/files/{fileId}/confirm` már ellenőrzi a méretet és képszignatúrát, egyszer aktivál és könyvel; a `/app` oldalon többfájlos feltöltőfelület is van. A `GET /api/v1/files` már cursor-lapozva adja a saját ACTIVE képek metaadatait; az eredeti képhez a `GET /api/v1/files/{fileId}/preview-url` is implementált; a `/app` oldalon metaadatkártyás galéria is van; képes és nagy eredeti-előnézet is van. A cleanup íráslezárási bizonyíték nélkül megtartja az objektumot/foglalást.

A backend S3/MinIO adaptere is implementált: create-only presigned PUT, HEAD, korlátozott feltételes range-read, törlés és biztonságos read URL. Ez belső infrastruktúra; az init/confirm API elkészült, a felület implementált, a teljes böngészős folyamat tényleges próbája még nyitott.

A kötelező SZD2 cél a teljes alkalmazás, a folytatható kötegelt képimport, két verziózott processor és restart recovery, valamint összehasonlító mérés/UAT és dolgozat. A részletes import-/metadata-processing szerződés és átviteli technológia kiválasztása külön feladat; a termék-MI opcionális.

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

Nyisd meg a [frontend kezdőoldalát](http://127.0.0.1:5173). A „Regisztráció” link a `/register` űrlapra vezet: név, e-mail, legalább 15 karakteres, nagybetűt, számjegyet és speciális karaktert tartalmazó jelszó és megerősítés. A mező alatti lista gépelés közben jelzi a teljesült és hiányzó feltételeket; a jelszómezők Mutatás/Elrejtés gombbal rendelkeznek. A backend is ellenőrzi az új regisztráció szabályait; a meglévő fiókok belépése változatlan. Siker után a visszajelzésből lépj a `/login` oldalra; nincs automatikus beléptetés. A „Saját fiók” (`/app`) munkamenet nélkül szintén a loginra vezet. Kipróbáláshoz használj szintetikus adatokat. Belépés után fiókadatok, kijelentkezés és a „Képek feltöltése” panel jelenik meg; fájlgaléria/usage még nem. A [health endpoint](http://127.0.0.1:3000/api/v1/health) válasza `{"status":"ok"}`. Azonos hostot használj a frontend és backend URL-ben; `localhost` és `127.0.0.1` keverése CORS/cookie eltérést okoz. Egyedi port esetén az `.env` URL-jeit, portját és a Compose/Vite portbeállítását együtt módosítsd.

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

A backend feltöltési API-ja init → presigned PUT → body nélküli confirm sorrendben használható az [API-szerződés](docs/03_design/api.md) alapján, szintetikus fejlesztői adatokkal. Confirm után a tárhely egyszer kerül reservedből used-ba; a signature-ellenőrzés nem teljes képdekódolás. A feltöltőfelület és az eredeti képeket megjelenítő galéria nagy előnézettel implementált.

A háttér-cleanup percenként legfeljebb 50 esedékes műveletet vizsgál. Azonnali, egyköteges operátori futtatás host Node-környezetből, a szokásos `.env`, dependencyk és futó PostgreSQL/MinIO mellett:

```bash
npm run uploads:cleanup
```

A parancs build/generálás után csak aggregált eredményt ír. A jelenlegi adapter nem tudja bizonyítani a korábbi in-flight PUT-ok végét: ilyen műveleteknél `blocked` és `WRITE_CLOSURE_UNPROVEN` várható, az objektum és a foglalás megmarad, növekvő retry-idővel. Ez nem sikeres fizikai cleanup. Ne töltsd ki kézzel a `writesClosedAt` mezőt, ne nullázd a számlálókat és ne töröld a köteteket a kapu megkerülésére. Új protokoll/adapteres bizonyítás külön döntés; a worker nem állítja elő ezt a tényt lejáratból vagy HEAD 404-ből.

## Kis képköteg feltöltése – első UI-szelet

Belépés után a `/app` oldalon válassz legfeljebb 20 JPEG/PNG/WebP/GIF képet (legfeljebb 100 MiB/fájl; a szerver szigoríthat), majd kattints a **Feltöltés indítása** gombra. Legfeljebb két fájl fut párhuzamosan. Fájlonként előkészítés, átviteli százalék, ellenőrzés, siker vagy magyar hiba látható. A 100%-os átvitel még nem siker: az alkalmazás csak az ACTIVE confirm után jelzi késznek a fájlt. Egy hibás fájl nem állítja le a többit.

Átmeneti hibánál a fájl saját **Újrapróbálás** gombja rövid, növekvő várakozás után használható; 429-nél legalább 60 másodperc. Ugyanaz az init-kulcs/fileId marad, bizonytalan PUT után először confirm történik, és csak hiányzó objektumnál, élő eredeti joggal indulhat új teljes PUT. Kész fájlt a retry nem küld újra. Terminális tartalom-/típus-/méret-/lejárati hibánál nincs vak retry. Munkamenet-lejárat leállítja az új fájlok indítását, a felület login linket ad.

A köteg memóriában, egyetlen megnyitott oldalon él; legfeljebb 20 sor, ugyanazon kiválasztott fájl ismételt hozzáadását kihagyja. Frissítés/navigáció után nincs helyi állapot-visszaállítás; a korábbi reservation nem szűnik meg ettől. A futó kéréseket komponenselhagyáskor megszakítjuk, de ez nem bizonyítja a szerver/storage írásainak végét. Nincs cancel endpoint, processor vagy bájtszintű resume. A teljes kézi UI → DB/storage ellenőrzés a 7. pont feladata.

A storage PUT XHR-rel ad átviteli progress-t, `withCredentials=false` mellett, a frontendtől eltérő storage originre; ugyanazon origint elutasítja, mert ott ez a beállítás nem zárná ki a cookie-t. Az API cookie-s kérései ettől elkülönülnek. Capability/File csak memóriában marad, nem kerül renderelt sorba vagy localStorage-ba.

### Eltérő kiterjesztésű képek kezelése

A feltöltés indításakor a frontend legfeljebb 16 fejlécbájtból ismeri fel a JPEG/PNG/GIF/WebP típust; a böngésző MIME-jelzése és a kiterjesztés nem döntő. Például JPEG-tartalmú `kep.png` automatikusan `kep.jpg` feltöltési nevet és `image/jpeg` típust kap, a sorban magyarázó jelzéssel. A bájtok, méret és a helyi fájl változatlanok; nem történik konvertálás. A helyes `.jpg`/`.jpeg` és más támogatott kiterjesztés megmarad (kis-/nagybetűtől függetlenül). Hiányzó vagy hibás kiterjesztés javítható; az új név legfeljebb 255 Unicode-kódpont.

A név-/méretellenőrzés a fejléc olvasása előtt történik, ismeretlen fejlécnél nincs init/kvótafoglalás. A korrigált metaadat ugyanazon init-kulcs mellett retry során is változatlan. A backend továbbra is saját HEAD/signature ellenőrzést végez és a deklarált/detektált eltérést elutasítja. A felismerés nem teljes képdekódolás. A javított display/download név `originalName`-ként tárolódik; a letöltési végpont továbbra is külön feladat.

## Saját képek listája – backend-szelet

Bejelentkezett cookie-val a `GET /api/v1/files?limit=20` a saját ACTIVE, ellenőrzött JPEG/PNG/WebP/GIF metaadatait adja; a konfiguráció tovább szűkítheti. A következő oldal a kapott nextCursorral kérhető. A limit 1–100, alapértéke 20; sorrend createdAt DESC/id DESC. A lista hét nyilvános mezőt ad, storage key és signed URL nélkül, MinIO-hívás nélkül. Per-user 60 kérés/perc; 429-nél Retry-After. Részletek: [API](docs/03_design/api.md#fájllista-és-lifecycle). A végpont unit tesztelt, a valós SQL/HTTP és a galéria/előnézet felületi elfogadása külön kapu.

## Eredeti kép előnézeti URL-je – backend-szelet

A `GET /api/v1/files/{fileId}/preview-url` bejelentkezett cookie-val csak saját ACTIVE, ellenőrzött JPEG/PNG/WebP/GIF eredeti képhez ad rövid presigned GET-et. A storage HEAD és a méret ellenőrzése után inline/no-store fejlécekkel írja alá, majd újra ellenőrzi az owner/állapot/MIME és metaadatok változatlanságát. Csak url és expiresAt tér vissza, legfeljebb 300 másodperces (konfiguráció/provider által rövidíthető) lejárattal. A már kiadott jog a TTL alatt session nélkül is használható; logout nem vonja vissza.

Hiányzó/idegen/pending/törölt fájl 404, saját ACTIVE nem támogatott tényleges típus 415, storage/presign hiba 503; nincs publikus fallback URL. Nincs quota/file update, download endpoint, thumbnail vagy frontend-megjelenítés ebben a szeletben. A végpont és az inline adapterparaméterek unit teszteltek; a valós DB/MinIO/browser próba külön kapu. [API](docs/03_design/api.md#preview-és-download).

## Saját képek metaadatgalériája

Belépés után a `/app` oldalon a **Képgaléria** a GET /files első húsz elemét kéri le. Kártyánként fájlnév, olvasható méret és a böngésző helyi időzónájában megjelenített létrehozási idő látható. A **További képek** gomb cursorral lapoz; a meglévő kártyák loading/hiba közben is megmaradnak, az ismételt ID-k nem kapnak új kártyát. Üres lista feltöltési linket, hiba magyar üzenetet és kézi újrapróbálást ad. Érvénytelen/ismétlődő cursornál frissítés az első oldaltól indul, nem folytatja a régi láncot. 429-nél a Retry-After várakozás a frissítésre is érvényes.

A **Lista frissítése** új első oldalt kér; sikerig a korábbi kártyák megmaradnak, sikerkor lecserélődnek. Sikeres ACTIVE confirm után a köteg leürülésekor automatikus frissítés indul, részleges siker esetén is. A párhuzamos sikerek egy jelzést adnak; a galéria 300 ms-os ablakban összevonja a jelzéseket és megvárja a futó lekérést. Az első oldal új cursorláncot kezd, nem fűzi az új fájlokat a régi lapokhoz. Hiba/429 esetén nincs automatikus újrapróbálási hurok; a Lista frissítése használható. A kliens állapota fiókonként/komponensenként memóriában él, 401-kor ürül és a loginra vezet; unmount/új kérés figyelmen kívül hagyja a régi választ. Nincs localStorage-cache. A képes előnézet működését a következő bekezdés írja le. A unit/template ellenőrzés eredménye a [tesztriportban](docs/04_quality/test_report.md) szerepel; teljes böngészős/DB elfogadás külön kapu.

### Képek és nagy előnézet

A látható kártyák a preview-url végponttal kérnek eredeti képet, legfeljebb négy párhuzamos URL-kéréssel. Kattintás vagy Enter/Space nagy, natív dialógust nyit; Escape és Bezárás visszaadja a fókuszt a nyitógombnak (eltűnt kártyánál a lista frissítésének). A natív modális dialógus a fókuszt a megnyitott nézetben tartja.

A signed URL csak memóriában él, nem kerül naplóba vagy tartós tárolóba; a storage GET külön originre, anonymous CORS és no-referrer mellett megy. A kép hibája külön üzenetet és kézi újrapróbálást ad. Nincs időzített URL-megújítás vagy automatikus hibahurok; 429 esetén kivárjuk a Retry-After értékét. A sikeres kézi listafrissítés feloldja a korábbi preview-hibákat, de megtartja a használható képeket. IntersectionObserver nélkül csak megnyitásra indul kérés. Ez eredeti kép, nem thumbnail; nagy fájlok eredeti méretben töltődnek. A valódi böngészős CORS/kép/keyboard elfogadás még ellenőrizendő.

## Első thumbnail-processor – explicit belső transzformáció

A 2026-10-29-i [ADR-016](docs/02_architecture/adr/ADR-016-thumbnail-processing.md) Sharpot választ: eredeti JPEG/PNG/WebP/GIF-ből statikus, aránytartó maximum512×512 WebP, felnagyítás és bemeneti metadata nélkül. Az animációból csak az első frame készül el; nagy előnézet továbbra is eredeti. A [tervezett API](docs/03_design/api.md#első-thumbnail-processor-api--tervezett-2026-10-29) és [adatmodell](docs/03_design/data_model.md#első-thumbnail-processor--tervezett-szerződés-2026-10-29) tartós verziózott jobot, bounded worker/retry/recoveryt és derived kvótát ír le. Sharp 0.35.5 és az explicit hívható közös Processor/ThumbnailProcessor implementált. Bounded bináris inputból maximum512×512,512KiB WebP-t és hash/geometria/build metaadatot ad; nincs DB/storage-hozzáférése. A confirm már tartós jobot ment; a külön thumbnail-worker az alábbi Compose-szerepben fut. Új thumbnail/status HTTP-végpont nincs. A külön posteres APNG v1-ben nem támogatott, a default-frame-zero változat igen. A processor-adatmodell külön migrációja már elkészült. A metadata-processor későbbi szelet, az ambiguous-write cleanup proofja továbbra is külön kapu. A jelenlegi galéria eredeti képeket használ.

### Processor-adatmodell – implementált alap, 2026-10-29

A [séma és új migráció](docs/03_design/data_model.md#adatbázis-és-későbbi-service-közötti-határ--2026-10-29) hozzáadja a ProcessingJob/ProcessingAttempt/DerivedObject táblákat, tartós version/fence/retry/proof/reservation mezőkkel, compound ownership FK-kkal és egyedi logikai eredménnyel. Nincs automatikus job vagy képgenerálás; a meglévő API változatlan. Normál indításkor a meglévő migrációs út alkalmazza; nincs backfill vagy kvótamódosítás.

Külön opt-in migrációellenőrzés (nem a normál unit/CI része): előbb `npm run db:generate` és `npm run build --workspace backend`, majd `node scripts/verify-processing-schema.mjs`. A verifier csak egy friss, véletlen nevű, loopback-portos PostgreSQL-konténert indít a már helyben meglévő postgres:17.9-bookworm image-ből; végül eltávolítja saját konténerét/ideiglenes adatait. A projekt adatbázisát/volume-jait nem érinti, alkalmazáscredentialt nem használ. Docker Server és Linux Node/npm kell; nincs új tesztdependency vagy CI-service. Windows CLI fallback esetén: `CLOUDVAULT_DOCKER_CLI='/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe' node scripts/verify-processing-schema.mjs`. A valódi constraint-esetek nem helyettesítik a későbbi processor/worker/API és job/könyvelési próbákat.

### Thumbnail storage I/O – implementált adapter, processor nélkül

A storage adapter `readOriginal` művelete teljes, ETag-hez kötött range-olvasást végez legfeljebb `min(MAX_UPLOAD_BYTES,32 MiB)` méretben, előre allokált bufferrel. A `writeDerived` maximum512 KiB bájtot ír fix WebP/no-store metaadattal, pontos hosszal, SHA-256 checksum és `If-None-Match: *` feltétellel. Külön SDK-kliens egyetlen írási próbálkozást enged. Mindkettő teljes10s határidőt és caller abortot kezel; stream hiba/timeout esetén lezárul, későn érkező GET-body sem marad nyitva.

A canonical derived kulcs `derived/<owner>/<file>/<job>/<attempt>.webp`; csak szerveres kisbetűs UUID-azonosítókból készül. HEAD/delete/read-presign már kezeli ezt a prefixet, derived read MIME csakWebP. Browser-upload/prefix-read továbbra csakoriginalra használható. Nincs új HTTP-végpont, decoder, job/worker vagy kvótakezelés; az adapter nem igazol ownershipöt vagy előzetes reservationt. Írási timeout/409/412/hibás success-válasz után nincs automatikus retry/törlés/release; az eredményt későbbi orchestrationnek kell rendeznie. `writeClosureEvidence=unproven` változatlan. A derived candidate recoveryhez szükséges teljes derived-visszaolvasás még külön bővítés. Valódi provider/worker/browser próba nem része a unit-bizonyítéknak.


## Thumbnail worker és restart recovery – 2026-10-31

A teljes `docker compose up -d --build --wait` már a `thumbnail-worker` szolgáltatást is indítja ugyanabból a backend image-ből, új queue nélkül. A HTTP backend importált ProcessingModule-ja csak service-eket biztosít; a decoder a külön worker szerepben fut. Normál host `dev:backend` indítás nem indít processing workert. Az image/volume migrációkat a meglévő db-migrate lépés alkalmazza.

V1-ben processzenként egy job/decoder,2s poll,15s heartbeat,60s attempt és90s DB-lease van. A Compose512MiB RAM+swap plafont,1CPU-t és64PID-et konfigurál,45s leállási türelmi idővel. Ezek konfigurált korlátok; a tényleges cgroup/OOM/restart próba még nyitott. Több workerreplikát ugyanaz a DB-fence véd, nem memóriabeli flag.

```bash
docker compose ps -a
docker compose logs --tail=100 thumbnail-worker
docker compose stop -t 45 thumbnail-worker
docker compose up -d thumbnail-worker
```

A worker először a lejárt candidate helyreállítását próbálja: teljes bounded original+derived read, ETag/size/type/SHA/WebP-header egyezés, új recovery fence, egyszeri finalization új PUT/foglalás nélkül. Nem lejárt lease nem vehető át. Hiányzó/sérült candidate irreverzibilisen CLEANUP_BLOCKED, régi R megmarad; új generálás csak saját kulccsal és új foglalással. Külön recovery-probe keret3/ciklus,5s/30s backoff; generation továbbra3/ciklus,9összesen és2kézi új ciklus. FAILED/BLOCKED_QUOTA/CANCELLED job nem indul újra magától.

A megerősített képekhez tartósan ütemezett thumbnail keletkezhet; régi job nélküli képek backfillje nincs. A galéria még eredeti képet mutat, nincs új thumbnail/status végpont. Proof nélküli cleanup továbbra nem töröl és nem szabadít pozitív foglalást. A valódi restart ellenőrzőlistája a [tesztriportban](docs/04_quality/test_report.md) nyitott; a unitok nem helyettesítik ezt. A worker csak rögzített safe event/code üzenetet naplóz, kulcsot, képet vagy nyers hibát nem.
