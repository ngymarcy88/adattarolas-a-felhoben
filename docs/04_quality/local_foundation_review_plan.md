# A technikai alap utólagos implementációs és ellenőrzési terve

## Cél és használat

Ez az a kisebb feladatokra bontás, amelyet a „Vue/NestJS scaffold, PostgreSQL–MinIO környezet, konfiguráció, Prisma-séma és migrációk” kérés előtt érdemes lett volna elkészíteni. A már megvalósított alap megértését és szerzői ellenőrzését segíti; nem új implementációs megbízás és nem a teljes szakdolgozati roadmap.

**Kiindulás:** a technikai alap `051188b` commitja, majd a WSL/parancsútmutató `db4062e` commitja, 2026-10-19. A [tesztriport](test_report.md) az akkori 72 sikeres unit tesztet, buildet és kézi futtatási próbákat rögzíti. Ez előzmény, nem az alábbi pontok új végrehajtása vagy a hallgató jóváhagyása. Későbbi ellenőrzéskor mindig az aktuálisan vizsgált commitot rögzítsd.

**Így haladj:** egy alkalommal egy pont promptját másold be. Először kérj magyarázatot és ellenőrzést, majd olvasd el az eredményt. Hibánál legyen külön javítási feladat, utána csak az érintett ellenőrzések ismétlése. A következő pontra te lépj tovább. A teljes unit/build kör a 14. pontban egyszer fut; előtte csak indokolt célzott teszt kell. Tiszta telepítés sem szükséges minden pontnál.

A munkát a gyökérbeli [AGENTS.md](../../AGENTS.md), a [projekt-skill](../../SKILL.md), a [Quickstart](../../README.md), az [ADR-013](../02_architecture/adr/ADR-013-local-foundation.md) és a [roadmap SZD2-1 szakasza](../milestones.md) keretezi. A projekt-skill alapján a mostani kérés dokumentációs hatókörű.

### Közös keret minden alábbi prompthoz

- Csak a megnevezett pontot ellenőrizd és magyarázd el; ne folytasd automatikusan a teljes tervet.
- A forráskódot, függőségeket és beállításokat ne módosítsd. A talált hibát és a legkisebb javasolt javítást külön add meg. Ideiglenes, elkülönített próbaadat és konfigurációmásolat létrehozható az ellenőrzéshez.
- Parancsfuttatás előtt az AGENTS.md Windows/WSL útmutatóját és a tényleges package scripteket kövesd. A futó folyamatokból ne indíts duplikátumot.
- Ne írj ki secretet, teljes `.env`-et, feloldott Compose-konfigurációt vagy hozzáférést biztosító URL-t. Negatív konfigurációs próbához ideiglenes környezetet használj, az eredeti `.env` megőrzésével.
- A kézi próbák csak lokális, szintetikus adaton történjenek. Ne legyen volume-törlés, `migrate reset`, globális gépbeállítás vagy önkényes csomagfrissítés. Saját ideiglenes objektumot/rekordot a próba végén takaríts el; meglévő adatot ne érints.
- Végül röviden add meg: mit csinál a rész, mely fájlokban van, mit futtattál, mit láttál, mi hiányzik. Állj meg az adott pont végén. Eszközhiánynál az eredmény `BLOCKED` vagy `NOT RUN`, soha nem feltételezett PASS.

## Követhető lista

A checkboxok **a saját utólagos ellenőrzést** jelentik. A megvalósított kód jelenlététől és a korábbi tesztriporttól függetlenül most mind nyitott.

- [ ] A01 – Windows/WSL környezet és parancsok
- [ ] A02 – Monorepo, npm workspaces és verziók
- [ ] A03 – Környezeti változók és biztonságos inicializálás
- [ ] A04 – Backend konfigurációvalidálás
- [ ] A05 – PostgreSQL lokális környezet
- [ ] A06 – MinIO build és futtatás
- [ ] A07 – Privát bucket és alkalmazásjogosultságok
- [ ] A08 – Prisma adatmodell
- [ ] A09 – Kezdeti migráció és SQL-védelmek
- [ ] A10 – NestJS alap és Prisma-életciklus
- [ ] A11 – Health API, CORS, request ID és hibaválaszok
- [ ] A12 – Vue/Vite/Tailwind/Router alap
- [ ] A13 – Frontend API-kliens és látható kapcsolatállapotok
- [ ] A14 – Unit tesztek, typecheck és build
- [ ] A15 – Quickstart, dokumentáció és lezáró ellenőrzés

A sorrend egyben előfeltétellista: az infrastruktúra a helyi env után, a backend a migráció/generálás után próbálható. Az A10–A11-hez futó PostgreSQL és generált Prisma Client, az A13-hoz futó backend és frontend kell. Ha csak későbbi pont promptját másolod be, előbb az előfeltételeit ellenőriztesd; ne induljon automatikusan az összes korábbi lépés.

## A01 – Windows/WSL környezet és parancsok

**Eredeti implementációs szelet:** Az AI és a hallgató ugyanabból a munkakönyvtárból, azonos Node/npm és Docker útvonalakkal tudjon dolgozni.

**Bemenet:** az [AGENTS.md](../../AGENTS.md) Execution environment/Commands részei, `.nvmrc`, `package.json` és a README előfeltételei. Ellenőrizendő a Git-ág, az aktuális gyökér, `command -v node`, `command -v npm`, verziók és a Docker Server elérése. A Docker CLI puszta létezése nem elég; WSL-integráció hiányában az ismert `docker.exe` kerülőutat kell használni.

**Elfogadás/bizonyíték:** rögzített gyökér és commit, Linux Node/npm, működő Docker-parancs vagy pontosan azonosított blokkoló előfeltétel. A `/mnt/c` alatti lassabb futás nem vezet párhuzamos újratelepítésekhez.

**Másolható prompt:**

> Az utólagos technikai alap terv A01 pontját végezd el a `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint. Magyarázd el a Windows-lemez és a WSL Bash szerepét, ellenőrizd a gyökeret, ágat, Node/npm verziót és a Docker Server elérését. Add meg a nálam használandó parancsfuttatási módot. Ne telepíts és ne változtass gépbeállítást; itt állj meg.

## A02 – Monorepo, npm workspaces és verziók

**Eredeti implementációs szelet:** gyökérmanifest, két workspace, közös lockfile, rögzített stack és használható gyökérscriptek; termékfunkció nélkül.

**Bemenet:** [package.json](../../package.json), [backend/package.json](../../backend/package.json), [frontend/package.json](../../frontend/package.json), `package-lock.json`, `.npmrc`, `.nvmrc`, `.gitignore`. Nézd meg a script → workspace script láncot és a kapcsolótovábbítást. Példa: `npm run db:migrate:dev -- --help` a Prisma súgóját adja. A lockfile npm-forrásai ne egy korábbi privát proxyhoz kössék a telepítést.

**Elfogadás/bizonyíték:** egy root lockfile és telepítés; a dokumentált parancsok léteznek. Szükség esetén egyetlen `npm ci` egy elkülönített, az aktuális commitból készült tiszta checkoutban igazolja a telepítést. A kiinduláskor már meglévő uncommitted módosításokat ez ne veszítse el. Build/node_modules nincs verziózva.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A02 pontot ellenőrizd a terv közös kerete szerint. Mutasd meg, hogyan kapcsolódik a root npm workspace a backendhez és frontendhez, miért egy lockfile van, és melyik script mit indít. Ellenőrizd a verziókat és a migrációs kapcsolótovábbítást. Indokold, szükséges-e most tiszta npm ci; ne telepíts újra automatikusan. Kódot ne módosíts, majd állj meg.

## A03 – Környezeti változók és biztonságos inicializálás

**Eredeti implementációs szelet:** biztonságos `.env.example`, helyi credentialgenerálás és ignore-szabályok.

**Bemenet:** [.env.example](../../.env.example), [scripts/init-env.mjs](../../scripts/init-env.mjs), `.gitignore`. Válaszd külön a publikus `VITE_API_BASE_URL`-t a DB/JWT/MinIO/S3 titkoktól; a MinIO admin és alkalmazásazonosság is külön legyen. A JWT beállítása előkészítés, még nem működő auth.

**Elfogadás/bizonyíték:** `npm run env:init` egy ideiglenes elkülönített másolatban létrehozza a hiányzó fájlt. Második futtatás előtt/után a tartalom hash-e egyezik; értéket nem ír ki. `git check-ignore .env` sikeres, a sablon verziózható. A meglévő fejlesztői `.env` érintetlen marad.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A03 pontot ellenőrizd. Magyarázd el a környezeti változók csoportjait és az env:init működését. Elkülönített másolatban igazold az első létrehozást és az ismételt futtatás nem-felülíró viselkedését; credentialt és hash-értéket sem kell kiírnod, elég az egyezés. Ellenőrizd a Git-ignore-t. Az eredeti .env-et ne módosítsd, majd állj meg.

## A04 – Backend konfigurációvalidálás

**Eredeti implementációs szelet:** egy helyen beolvasott, típusos és ellenőrzött konfiguráció, szétszórt `process.env` használat helyett.

**Bemenet:** [config modul](../../backend/src/config/app-config.module.ts), [típusok](../../backend/src/config/app-config.ts), [validátor](../../backend/src/config/environment.ts), [unit tesztek](../../backend/test/environment.spec.ts). Vizsgáld az URL-eket, portot, credential-placeholdereket, MIME allowlistet, fájlméretet és TTL-t. A validálás nem bizonyítja a szolgáltatások elérését vagy a fájltartalom biztonságát.

**Elfogadás/bizonyíték:** a megengedett beállítások típusos configgá alakulnak; hiányos/hibás bemenet elutasítva, a hiba csak változóneveket közöl. Negatív esethez szintetikus tesztadatot használj. A központi betöltés forrásból és buildből is a root `.env`-re mutat.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A04 pontot ellenőrizd. Vezesd végig, hogyan lesz a .env-ből validált AppConfig, és mutass a meglévő tesztekből érvényes és hibás példákat. Ellenőrizd a titokmentes hibákat és a forrás/build környezeti fájlútvonalát. Csak indokolt célzott unit tesztet futtass; ne módosíts kódot, majd állj meg.

## A05 – PostgreSQL lokális környezet

**Eredeti implementációs szelet:** adatbázis Docker Compose-ban, healthcheckkel, tartós volume-mal, lokális porttal.

**Bemenet:** [compose.yaml](../../compose.yaml) `postgres` szolgáltatása és a sablon `POSTGRES_*`/`DATABASE_URL` mezői. Kapcsolat: WSL backend → `127.0.0.1:5432` → konténer.

**Elfogadás/bizonyíték:** Compose config valid (`config --quiet`), PostgreSQL healthy, hitelesített egyszerű SQL-kérés sikeres. Saját szintetikus próbarekord újraindítás után megmarad, majd csak ez a rekord eltávolítva. Normál leállítás nem töröl volume-ot; meglévő volume esetén az env-jelszócsere nem egyenlő DB-jelszócserével.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A05 pontot ellenőrizd. Magyarázd el a PostgreSQL Compose-beállításait, ellenőrizd a health állapotot és egy hitelesített egyszerű lekérdezést. Ha a saját lokális adatbázisunk biztonságosan újraindítható, saját próbaadattal ellenőrizd a megmaradást, majd takarítsd el azt; egyébként ezt jelöld nyitottnak. Volume-ot és meglévő adatot ne törölj, jelszót ne írj ki, majd állj meg.

## A06 – MinIO build és futtatás

**Eredeti implementációs szelet:** S3-kompatibilis lokális tárhely, szerver/kliens build, tartós adatok és healthcheck.

**Bemenet:** [Dockerfile](../../infra/minio/Dockerfile), Compose `minio`/`minio-init`, ADR-013. Magyarázd el a rögzített upstream forráscommitokat és a két build targetet, a loopback 9000/9001 portot, volume-ot és a nem root szerverusert. A MinIO-admin konzol külön szolgáltatás a CloudVault frontendtől.

**Elfogadás/bizonyíték:** image-ek elérhetők vagy felépülnek, a szerver healthy. Cache-elt ismételt indításhoz nem kell új dependency vagy valódi cloud-fiók. Az első source build költsége, a változható base image tagek és a karbantartottsági/licenc korlátok érthetők. Most nem kell új image-et vagy stackalternatívát választani.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A06 pontot ellenőrizd. Mutasd meg, hogyan épül és fut a MinIO szerver és mc kliens, és miért ezt a buildmegoldást használjuk. Ellenőrizd a helyi image-eket, portokat, volume-ot és health állapotot; meglévő megfelelő image esetén ne építs újra indokolatlanul. Ne cserélj stacket vagy image-verziót, majd állj meg.

## A07 – Privát bucket és alkalmazásjogosultságok

**Eredeti implementációs szelet:** idempotens init, privát bucket, külön bucketre korlátozott S3-identitás. Ez még nem backend storage adapter.

**Bemenet:** [init.sh](../../infra/minio/init.sh), Compose init env-je és MinIO CORS-beállítása. Az admincredential csak a lokális inithez/konzolhoz kell; a SPA egyiket sem kaphatja meg.

**Elfogadás/bizonyíték:** ismételt init sikeres; alkalmazásazonossággal saját bucketben ideiglenes objektum PUT/GET/tartalomegyezés/DELETE sikeres. Anonymous object read és app-admin művelet megtagadva; meglévő más buckethez sem jár jog (ha van biztonságos elkülönített próbakörnyezet, ezt is bizonyítsd). Saját próbaobjektum újraindítás után megmarad, majd törölhető. A konfigurált frontend CORS preflightja külön ellenőrizendő; ez nem authorization vagy kész upload-adatút.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A07 pontot ellenőrizd. Magyarázd el a privát bucketet, az admin és az app identity különbségét, és a policy megengedett műveleteit. Saját szintetikus objektummal ellenőrizd a pozitív app-műveleteket és a tiltott anonymous/admin hozzáférést, ismételt initet és biztonságosan elvégezhető megmaradási próbát. Takarítsd el a saját próbaadatot; credentialt ne mutass, meglévő adatot ne érints. Ne implementálj storage adaptert, majd állj meg.

## A08 – Prisma adatmodell

**Eredeti implementációs szelet:** négy alapentitás és kapcsolataik; import/job/derived modell nélkül.

**Bemenet:** [schema.prisma](../../backend/prisma/schema.prisma), [adatmodell](../03_design/data_model.md), [prisma.config.ts](../../backend/prisma.config.ts). A `User` tárolja a used/reserved/limit értékeket; a `FileObject` a metaadatot és állapotot, nem a bináris tartalmat. A `ShareLink` hash-t tárol, az `AuditEvent` eseményszerkezetet ad. Nézd meg a BigInt, UUID, timestamp, index és összetett owner-FK döntéseket.

**Elfogadás/bizonyíték:** minden mező és kapcsolat szerepe elmagyarázható; a séma és dokumentáció összhangban van. `npm run db:validate` és `npm run db:generate` sikeres, a generált CJS kliens ignore-olt. A meglévő séma nem bizonyít kész authot, atomikus kvótaelszámolást, soft-delete-et vagy sharinget.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A08 pontot ellenőrizd. Magyarázd el a négy Prisma modell szerepét, kapcsolatait és fontos típusait/indexeit a jelenlegi kód alapján. Vesd össze az adatmodell-dokumentummal, és ellenőrizd a validate/generate parancsokat. Külön sorold fel, mely üzleti szabályokhoz kell még későbbi service-logika. Új modellt ne adj hozzá, majd állj meg.

## A09 – Kezdeti migráció és SQL-védelmek

**Eredeti implementációs szelet:** verziózott SQL migráció, amely valóban létrehozza a sémát, indexeket, FK-kat és CHECK-eket.

**Bemenet:** [kezdeti migráció](../../backend/prisma/migrations/20261018000100_initial_core/migration.sql), `migration_lock.toml`, schema és adatmodell. A CHECK-ek nem mind ábrázolhatók a Prisma-sémában; ezért a `prisma validate` önmagában nem elég.

**Elfogadás/bizonyíték:** elkülönített üres próbaadatbázison a migráció alkalmazható; ismételt `npm run db:migrate` nem hoz létre új változást. Élő DB/schema drift nincs, és a CHECK-ek tényleges megléte külön ellenőrzött. Rollbackelt szintetikus SQL-próbák elutasítják a hibás kvótát/méretet/state dátumokat, más owner megosztását és rossz hash/expiry értékeket. Már alkalmazott migrációt ne írj át; reset helyett külön új migráció lehet későbbi javítás.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A09 pontot ellenőrizd. Mutasd meg, mit hoz létre a kezdeti SQL migráció a Prisma-sémán túl. Ellenőrizd a meglévő migráció állapotát, az ismételt alkalmazást, a driftet és a tényleges DB-constraint-eket; negatív SQL-próbához rollbackelt tranzakciót használj. Üres DB-s próbához külön adatbázis kell, a meglévőt ne reseteld. Hiányzó előfeltételt jelölj, majd állj meg.

## A10 – NestJS alap és Prisma-életciklus

**Eredeti implementációs szelet:** backend belépési pont, modulok, config injection és egy kezelt Prisma-példány.

**Bemenet:** [AppModule](../../backend/src/app.module.ts), [main.ts](../../backend/src/main.ts), [PrismaService](../../backend/src/prisma/prisma.service.ts), [életciklus-tesztek](../../backend/test/prisma.service.spec.ts), tsconfig és manifest. Magyarázd el a modulbetöltés → config → Prisma kapcsolat → listen sorrendet és a shutdown hookokat, valamint a CJS/NestJS/Prisma verziók kapcsolatát.

**Elfogadás/bizonyíték:** a backend a migrált adatbázissal elindul; kezelt leállításkor lezárja a kapcsolatot. Kapcsolódási hiba biztonságos üzenetet ad; a meglévő mockolt lifecycle-teszt ezt izoláltan ellenőrzi. A valódi DB-hibapróba csak elkülönített folyamatban történjen, a meglévő szerver és `.env` károsítása nélkül. Buildet a 14. pontban, vagy hiányzó artifact esetén indokoltan itt futtass.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A10 pontot ellenőrizd. Vezesd végig a NestJS indulását és a Prisma connect/disconnect életciklust a tényleges fájlokon. Ellenőrizd az indíthatóságot és a hibák maszkolását, a meglévő mockolt tesztet különítsd el a valós DB-próbától. Ne adj hozzá authot vagy storage adaptert, és ne indíts második szervert azonos portra. Itt állj meg.

## A11 – Health API, CORS, request ID és hibaválaszok

**Eredeti implementációs szelet:** egyetlen publikus health endpoint és egységes HTTP-alapok; üzleti endpointok nélkül.

**Bemenet:** [HealthController](../../backend/src/health/health.controller.ts), `main.ts`, `backend/src/common/`, [API](../03_design/api.md), [hibaszerződés](../03_design/error_handling.md). Nézd meg a `/api/v1` prefixet, frontend origin allowlistet, a request ID kezelését és a nested error shape-et.

**Elfogadás/bizonyíték:** health 200, `{"status":"ok"}`; megengedett origin CORS-válasza helyes, idegen origin 403. Hiányzó/érvénytelen request ID helyett biztonságos új ID készül. Ismeretlen útvonal és hibás JSON biztonságos 404/400, stack és parserüzenet nélkül. A health **liveness**, nem folyamatos DB/storage readiness; a CORS nem bejelentkezés vagy tulajdonosi ellenőrzés.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A11 pontot ellenőrizd. Magyarázd el a health útvonalat, a CORS-t, request ID-t és a globális hibakezelést. A futó API-n ellenőrizd a sikeres választ, tiltott origint, ismeretlen útvonalat és hibás JSON-t; csak biztonságos válaszokat rögzíts. Mutasd meg, mit nem bizonyít a health és a CORS. Új endpointot ne implementálj, majd állj meg.

## A12 – Vue/Vite/Tailwind/Router alap

**Eredeti implementációs szelet:** elinduló Vue alkalmazás TypeScripttel, stílusokkal, route-tal és egy minimális kezdőoldallal.

**Bemenet:** [Vite config](../../frontend/vite.config.ts), [main.ts](../../frontend/src/main.ts), [App.vue](../../frontend/src/App.vue), [router](../../frontend/src/router/index.ts), [HomePage.vue](../../frontend/src/pages/HomePage.vue), `style.css`, frontend tsconfig/manifest. A képernyő végleges vizuális csiszolása külön feladat is lehetett volna; a scaffold kapuja a működő alap, nem egy teljes termékfelület.

**Elfogadás/bizonyíték:** `npm run dev:frontend` indítható, az oldal/route betöltődik, a Vue és Tailwind valóban működik. A 127.0.0.1 host és a Vite envDir illeszkedik a backendhez. Nincs hardcoded titok, felesleges globális store vagy úgy megjelenített belépés/fájlkezelés, mintha már működne.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A12 pontot ellenőrizd. Magyarázd el a Vue belépési pont, App, Router, oldal, stílus és Vite config kapcsolatát. Ellenőrizd az oldal betöltését és a frontend env-határt. Ha nincs működő böngészőeszköz, ne tekintsd a HTML HTTP 200-at renderelt UI-bizonyítéknak; adj kézi ellenőrzési lépést. Ne alakítsd át a dizájnt, majd állj meg.

## A13 – Frontend API-kliens és látható kapcsolatállapotok

**Eredeti implementációs szelet:** külön health API-kliens és a loading/siker/hiba/újrapróbálás állapotai a felületen.

**Bemenet:** [health kliens](../../frontend/src/api/health.ts), `HomePage.vue`, [unit tesztek](../../frontend/tests/health.spec.ts). Kövesd a `VITE_API_BASE_URL` → fetch → ellenőrzött válasz → UI állapot láncot, az AbortControllert és az 5 másodperces időkorlátot.

**Elfogadás/bizonyíték:** böngészőben látszik az elérhető API; csak a saját backendfolyamat leállítása és újraellenőrzés után érthető hiba; újraindítás és újrapróbálás után siker. A loading látható például böngészős lassítással, és a gomb közben letiltott. Mobil szélességen használható a képernyő. A meglévő Vitest csak a klienst ellenőrzi, nem a Vue DOM-állapotait. Ez az eredeti riportban nyitott vizuális próba volt.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A13 pontot ellenőrizd. Magyarázd el a health kliens és a Vue kapcsolatállapotainak működését. Ellenőrizd böngészőben a loading, siker, hiba és újrapróbálás állapotokat, valamint egy keskeny képernyőt; a saját szervert a végén állítsd vissza. Ha a böngésző blokkolt, add meg a hallgató kézi lépéseit és maradjon NOT RUN a vizuális rész. Ne adj hozzá új funkciót vagy tesztkeretrendszert, majd állj meg.

## A14 – Unit tesztek, typecheck és build

**Eredeti implementációs szelet:** Jest és Vitest runner, az elkészült viselkedések unit tesztjei és fordítható két workspace.

**Bemenet:** `backend/test/`, `frontend/tests/`, Jest/Vitest és TypeScript konfiguráció, [tesztstratégia](test_strategy.md). A config/health/error/request-ID/Prisma lifecycle/frontend kliens tesztcsoportok közül mindegyiknél legyen érthető, milyen hibát fogna meg és mit mockol.

**Elfogadás/bizonyíték:** az aktuális commiton `npm test`, `npm run typecheck`, `npm run build` sikeres. A root build/typecheck generálja a Prisma Clientet. Korábbi baseline: 54 Jest + 18 Vitest = 72; az aktuális darabszámot mérni kell, nem ehhez igazítani a teszteket. Hiba/skipped esetet is rögzíteni kell. Nincs kitalált coverage, új CI vagy integration/e2e suite; a unit teszt nem helyettesíti a DB/storage kézi próbát.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A14 pontot végezd el. Magyarázd el a meglévő unit tesztcsoportokat és mockjaikat, majd a repógyökérből egyszer futtasd a teljes unit, typecheck és build ellenőrzést. Add meg a tényleges eredményeket, darabszámokat és korlátokat; hibánál javaslatot adj, ne javíts automatikusan. Ne telepíts újra indokolatlanul, és ne vezess be új tesztszintet. Itt állj meg.

## A15 – Quickstart, dokumentáció és lezáró ellenőrzés

**Eredeti implementációs szelet:** más által is követhető átadás, a megvalósított és tervezett állapot pontos szétválasztása.

**Bemenet:** README, AGENTS.md, ADR-013, [API](../03_design/api.md), [adatmodell](../03_design/data_model.md), tesztriport, [privacy/licensing](../05_security_ops/privacy_licensing.md), AI-naplók, SZD2-1 státusz. Nézd meg a Git-diffet, ignore-szabályokat, dokumentációs linkeket és a buildelt frontend titokmentességét.

**Elfogadás/bizonyíték:** a Quickstart önmagában követhető; a korábbi pontok parancsai újabb indokolatlan futtatás nélkül hivatkozhatók. Új tiszta checkoutos indítás csak akkor kell, ha még nincs rá használható bizonyíték; a másik gépes próba külön státusz. `npm audit --omit=dev` és teljes `npm audit` eredménye külön értékelendő, automatikus `audit fix --force` nélkül. A korábbi dev advisory és MinIO licenc/build korlát ismert; nem ígérhető teljes sérülékenység- vagy licenmentesség. Fontos új hibát külön kell javítani, majd célzottan újraellenőrizni.

**Másolható prompt:**

> A `docs/04_quality/local_foundation_review_plan.md` közös kerete szerint csak az A15 pontot ellenőrizd. Vesd össze az eddigi eredményeket a Quickstarttal, dokumentációval és SZD2-1 státusszal. Ellenőrizd az ignore/link/secret és frontend-bundle határokat, valamint az aktuális audit kimenetét automatikus javítás nélkül. Különítsd el a kész alapot, a kézi ellenőrzésre váró részeket és a későbbi funkciókat. Adj rövid lezárási listát; ne kezdj authot, és ne mergelj. Itt állj meg.

## Az eredmények rögzítése és lezárás

Minden pont után elég egy rövid bejegyzés az alábbi mintával; új dokumentum pontonként nem szükséges. A checkboxot a hallgató akkor jelölje, ha az eredményt átnézte és érti a rész szerepét. A hibás és blokkolt pont maradjon nyitott.

```text
Pont: Axx
Dátum / vizsgált commit / környezet:
Állapot: PASS | FAIL | BLOCKED | NOT RUN
Vizsgált fájlok és futtatott parancsok:
Elvárt / tényleges eredmény (titkok nélkül):
Mit értettem meg ebből:
Nyitott hiba / kézi teendő / külön javítás:
```

Az új eredmények a hallgató kérésére átvezethetők a tesztriport dátumozott új szakaszába; korábbi evidence-t ne írjunk át utólag. Ha egy javítás új commitot hoz létre, jelöld, mely korábbi ellenőrzéseket érinti. E terv elkészítésekor egyik pontot sem futtattuk újra, alkalmazáskód nem változott.

**A technikai alap utólagos ellenőrzése lezárható**, ha az A01–A15 eredménye ismert, nincs nyitott működést blokkoló hiba, a korábban hiányzó vizuális próbát elvégeztük, és a hallgató a részek szerepét el tudja magyarázni. A külső UAT és másik gépes teljes telepítés státusza ettől még külön marad. Blokkolt UI-próbával az ellenőrzés részlegesnek nevezendő.

Ez nem zárja le az egész SZD2-1-et: regisztráció, login/logout, védett frontend és üzleti authorization továbbra is külön implementáció. Storage adapter, feltöltés, kvótatranzakciók, soft delete/restore, megosztás, import és processor sem része e visszaellenőrzésnek. A következő fejlesztési kérés már szűk, egyenként elfogadható szelet legyen.
