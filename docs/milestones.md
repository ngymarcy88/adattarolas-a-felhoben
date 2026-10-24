# Mérföldkövek – Adattárolás a felhőben / CloudVault

## Státusz és használat

**2026-10-18-i végrehajtási roadmap – kezdeti technikai scaffold létezik, termékfunkció még nincs implementálva.**

Az aktuális célt a [high-level terv](plan.md), az októberi források összefoglalóját a [SKILL.md](../SKILL.md) rögzíti. Ez a dokumentum a végrehajtási sorrend, a státusz és az evidence-kapuk forrása. A részletes product/API/adatmodell/ADR szerződések még célzott kiegészítésre várnak; az alábbi követelmények elsőbbséget élveznek a korábbi thumbnail-Later/single-PUT-only scope-pal szemben.

- `[x]`: fájlokkal és ellenőrzéssel igazolt eredmény; a történeti dokumentációs kapuk önmagukban nem működő termékek.
- `[ ]`: még nem igazolt vagy nem implementált feladat.
- **Kötelező SZD2 mag:** teljes alapalkalmazás + folytatható képimport + két processor/recovery + bizonyítás és dolgozat.
- **MVP+:** opcionális MI, a kötelező lezárás függőségi útvonalán kívül.
- **Later:** külön bővítés, például nagy videók, cloud, transzkódolás vagy automatizált végleges purge.

## Ütemezés és egyeztetendő eltérések

Az alábbi dátumok 2026-os belső célok a feltöltött forrásokból; nem automatikusan elfogadott hallgatói vállalások és nem hivatalos beadási határidők.

| Eredmény | Személyes témavezetői javaslat | Közös Coospace belső ütem | Kapcsolódó szelet |
|---|---|---|---|
| Státusz, repo-hozzáférés, scope, fejezetvázlat és teszt/UAT-terv | Folyamatos egyeztetés | Október 2. és 9. | SZD2-0 és folyamatos dolgozatírás |
| Belépés után kis képköteg, megjelenítés, első processor és dolgozatrész | Október 23. | Október 22.: már fő folyamatok és dokumentált telepítés | SZD2-1–2 |
| Folytatható upload, két processor és restart recovery, UI-ból | November 6. | Nincs külön azonos kapu | SZD2-3–4 |
| Teljes alkalmazás, mérési eredmények és teljes kézirat | November 20. | November 13. | SZD2-5–6 |
| Javítás, felhasználói próba, újrateszt és másik gépes telepítés | December 4. | December 4. | SZD2-7 |
| Véleményezett/javított belső végleges csomag | December 11. | December 11. | SZD2-7 |

Az október 22/23. és november 13/20. különbséget a hallgatónak vissza kell igazoltatnia a témavezetővel. A korábbi októberi adminisztratív feladatok teljesítésére nincs bizonyíték a repóban; ebből nem következik, hogy elmaradtak. Egyeztetendő a heti reális ráfordítás, legnehezebb rész és januári záróvizsga-szándék is. A jelenlegi induló állapotból az október 23-i cél magas kockázatú.

A tanári tájékoztatás október 31-i záróvizsga-jelentkezést és december 19-i hivatalos beadást említ. Ezek az egyéni/intézeti feltételekkel és az aktuális kari tájékoztatóval ellenőrizendők; nem helyettesítik a fenti belső review-kat. A repó vagy témavezetői e-mail nem hivatalos feltöltés. A kapcsolódó ellenőrzési forrás a [SKILL.md](../SKILL.md) fájlban található.

## Történeti dokumentációs mérföldkövek

### 1. Projektindítás és repo-alapok – lezárt

- [x] Git repository és rendezett docs-as-code struktúra.
- [x] Root README, AGENTS.md, `.gitignore` és placeholder `.env.example`.
- [x] Frontend/backend helyőrző mappák.
- [x] AI Manifest, Prompt Log és Verification Log alapjai.
- [x] Secret hygiene és dokumentációs linkek ellenőrzése.

**Evidence:** root fájlok, `docs/00_index.md`, valamint V-001–V-005 verification bejegyzések.

### 2. Termékvízió és core MVP scope – lezárt dokumentációs alap

- [x] Két persona és termékvízió.
- [x] Hat core MVP user story acceptance criteria-val.
- [x] Capability map, tervezett metrikák és három core UX-folyamat.
- [x] A 100 MB-os limit, 30 napos restore és alap share-link scope rögzítése.

**Evidence:** `docs/01_product/` és V-008. A funkciók ettől még nem implementáltak.

### 3. Architektúra és első ADR-készlet – lezárt dokumentációs alap

- [x] C4 Context, Container és Component nézet.
- [x] Quality attribute dokumentum.
- [x] ADR-001–ADR-009.
- [x] A runtime scaffold tudatos kizárása ebből a mérföldkőből.

**Evidence:** `docs/02_architecture/` és V-009–V-010. A komponensek ettől még nem futtathatók.

## Júliusi dokumentációs rebaseline – történeti lezárás

### Cél

A két korábbi, duplikált fő terv konszolidálása és a szakdolgozati irány döntéskész dokumentációvá alakítása MVP-implementáció nélkül.

### Elvárt dokumentációs eredmény

- [x] A high-level terv négy szakmai pillérre épül, részletes API/schema duplikáció nélkül.
- [x] A roadmap vertikális `MVP-0`–`MVP-7` szeleteket használ.
- [x] A product dokumentumok `Core MVP`, `MVP+`, `Later` státuszt használnak.
- [x] A C4 nézetek helyes absztrakciós szintet használnak.
- [x] Elkészülnek a tervezett API-, adatmodell-, hibakezelési, teszt- és security szerződések.
- [x] Különválik az AI-asszisztált fejlesztés és az opcionális termék-MI.
- [x] A linkek, Mermaid diagramok, státuszállítások és cross-document invariánsok ellenőrzöttek.

### Definition of Done

- [x] Nincs létrehozott runtime kód, Prisma schema, package manifest, Docker Compose vagy CI-konfiguráció.
- [x] Minden új dokumentum egyértelműen tervezett, nem implementált állapotot jelez.
- [x] A Prompt Log és Verification Log új, hozzáfűzött bejegyzést kap.
- [x] A dokumentációs ellenőrzések eredménye PASS vagy dokumentált eltérés.

A fenti checkboxok a júliusi baseline történeti állapotát őrzik; nem jelentik az októberi szerződés-kiegészítések vagy termékfunkciók elkészültét.

## Aktuális SZD2 végrehajtási sorrend

A történeti MVP-0–MVP-7 helyett az alábbi **SZD2-0–SZD2-7** az aktuális végrehajtási sorrend. A régi azonosítók nem kész termékfunkciókat jelentettek. Az új számozás a teljes, bemutatható szeleteket és a novemberi bizonyítási kaput helyezi előtérbe.

### SZD2-0: Első szelet szerződései és döntési előkészítés

**Cél:** rövid, implementálható első szelet; ne újabb általános dokumentációs kör legyen.

- [ ] A hat meglévő alapstory kiegészítési terve import/processing acceptance criteriával és a két belső ütem eltérésével.
- [x] Az első képfeltöltés init/confirm API-szerződése: owner/Origin, validáció, foglalás, init/confirm idempotencia, lejárat, hibák és storage-bizonyítási kapuk dokumentálva; nem implementáció.
- [x] Az első egyképes upload adatmodell-szerződése: UploadOperation, tartós dedupe, végleges hiba/expiry, egyszeri foglalás/release és receipt-megőrzés dokumentálva; a séma/migráció elkészült; a storage-bizonyítás és runtime-kezelés külön kapu.
- [ ] Az első slice-hoz szükséges API/adatmodell/state-machine kiegészítés: import- és fájlazonosság, processor/job/result, egyediség és ownership.
- [ ] Az első derived preview kvótafoglalásának, finalizálásának és sikertelen cleanupjának policyja; eredeti/derived delete/restore összhang.
- [ ] Uppy/tus és más meglévő S3-kompatibilis folytatható mechanizmus szűk PoC-terve; jogosultság, részleges resume és tényleges tárolási eredmény ellenőrzése.
- [ ] ADR-005/009/011 érintettsége, lejárat/megújítás és adatút nyitott döntéseinek listája; nincs előre kiválasztott protokoll vagy queue.
- [ ] Fejezetvázlat és előzetes teszt-/mérési/UAT-forgatókönyvek; heti ráfordítás egyeztetése.

**Elfogadás:** az első szelet állapotai és számlálói ellenőrizhetők, a nyitott resumable döntés nem rejtett feltételezés. A PoC tényleges végrehajtása és az implementáció külön engedélyezett munka. Nem szükséges minden későbbi endpointot most részletezni.

### SZD2-1: Reprodukálható lokális alap és auth

**Függőség:** SZD2-0 első szelethez szükséges szerződései.

- [x] PostgreSQL és MinIO Docker Compose és privát bucketet létrehozó init-konfiguráció. A futtatási próba külön kapu.
- [ ] A majd kiválasztott upload-adatúthoz szükséges storage CORS-konfiguráció; ez nem azonos a scaffold API-CORS-beállításával.
- [x] Vue/NestJS scaffold, centralizált és validált config, `.env.example`, publikus health endpoint kódja és npm workspace-scriptek. A tényleges futtatási ellenőrzést a tesztriport rögzíti.
- [x] Kezdeti Prisma schema és migráció: `User`, `FileObject`, `ShareLink`, `AuditEvent`.
- [x] PostgreSQL–MinIO indítás, privát bucket, elkülönített bucket-szintű app user és ismételt init ellenőrzése; a tényleges eredmények a tesztriportban.
- [ ] Az első import/processor tartós állapotigényének külön, szerződésalapú migrációja; ez nincs benne a kezdeti négy modellben.
- [x] Külön jelszóhash/check service és izolált unit tesztjei; endpoint és DB-írás nélkül (ADR-014).
- [x] Backend regisztráció: DTO-validáció, scrypt, email unique conflict, szerverkvóta és biztonságos válasz; unit tesztelt, valós DB-próba még nyitott.
- [x] Backend login, logout és aktuális user; HttpOnly JWT-cookie, Origin-védelem, egységes login hiba, unit tesztek. Valós PostgreSQL- és browser-próba még nyitott.
- [x] Védett frontend `/app` a meglévő védett `/auth/me` végponttal, `/login` és logout UI; loading/401/kiesés/retry, unit és template-render tesztek. A valós DB-/böngészős elfogadás még nyitott.
- [x] Regisztrációs és belépési felület: `/register` és `/login`, mezőhibák, loading/disabled, biztonságos hibák, retry és regisztrációs siker; unit/template bizonyíték, valódi browser/DB-elfogadás még nyitott.
- [x] Teljes alkalmazás Compose-indításának konfigurációja és README (`docker-compose.yaml`); konténeres build/indítás még nem igazolt.
- [ ] Teljes, authot is tartalmazó Quickstart; a technikai scaffold indítási próbája a tesztriportban külön szerepel.

**Státusz:** SZD2-1 részben implementált; a technikai scaffold futtatási próbája elkészült, az auth és az azt tartalmazó teljes Quickstart-kapu még nyitott. **Unit evidence:** configuration/health/request-ID/error alaptesztek létrejöttek, futtatási eredményük a tesztriportban; a jelszóhash/check külön unit tesztelt; a regisztráció validációja, Origin-, kezdeti rate/concurrency-védelme és mockolt DB-írása unit tesztelt; generic login hiba, token/cookie és aktuális user guard unit tesztelt; fájl-ownership és valós auth-próba még későbbi feladat. **Manuális evidence:** tiszta indulás, health és belépés. **Dolgozat:** problémafelvetés, célfelhasználók, követelmények és fő tervezési döntések érdemi szövege.

### SZD2-2: Első használható képköteg, galéria és processor

**Függőség:** SZD2-1 és az első processor kvóta-/eredményszerződése. **Tanári cél:** október 23.

- [ ] Belépés után kis képköteg indítása, fájlonként azonosítható progress, siker és hiba; egy fájl hibája nem ejti el a többit.
- [x] Belső MinIO/S3 adapter: presign, HEAD, bounded read és törlés; unit és kézi provider-próba. A késői íráslezárás és valódi böngészős upload még nyitott.
- [x] Az első upload Prisma-sémája és tranzakciós migrációja: UploadOperation, dedupe/owner FK, NULL-biztos CHECK-ek és biztonságos legacy-preflight.
- [x] Upload-init backend: Origin/session és DTO, tartós owner+kulcs replay, tranzakciós kvótafoglalás, rövid presigned URL és unit tesztek.
- [x] Confirm backend: ownership, HEAD/16-bájtos magic signature, idempotens aktiválás/kvóta és egyetlen audit.
- [x] Cleanup worker és operátori batch: lejárat, tartós terminális okok, backoff, proof nélküli biztonságos blokkolás.
- [ ] Cleanup fizikai törlés/release provider-proofja; a jelenlegi adapterrel még nem igazolt, foglalás megmarad.
- [ ] Backend-kontrollált privát upload, méret/MIME/magic-number validáció, foglalás és idempotens confirm.
- [ ] Saját galéria és jogosult előnézet/letöltés; betöltési, üres és hibaállapotok.
- [ ] Közös processor-interfész és első beépített processor, verziózott eredménnyel. Elsőként az előnézetkészítő javasolt; ez végrehajtási javaslat, a tanár általánosan első processort kér.
- [ ] Eredeti és derived storage konzisztens elszámolása; minimális tartós job/result és audit, titkok nélkül.
- [ ] Bemutatható commit, valós képernyőkép, tesztriport, kipróbált lokális telepítés és aktuális dolgozatrész.

**Unit evidence:** quota/confirm egyszeriség, fájlvalidáció, ownership, processor-result identity és hibakezelés. **Manuális elfogadás:** belépés → kis csomag → galéria → első processor eredménye; hibás fájl mellett a jó fájlok használhatók.

Ez egy kezdeti vertikális szelet. Az egyszeri PUT-tal vagy teljes fájl retry-jával működő első verzió nem nevezhető végleges folytatható importnak. A teljes resume a következő kapu követelménye.

### SZD2-3: Valódi folytatható import

**Függőség:** SZD2-2; a transfer PoC és ADR döntése a resumable implementáció előtt. **Tanári cél:** SZD2-4-gyel együtt november 6.

- [ ] Meglévő mechanizmus PoC-ja: kontrollált megszakítás után a már átvett adat megmarad, a folytatás tényleges MinIO/S3 eredményt hoz létre.
- [ ] A választás, adatút és kompromisszumok rögzítése; major dependency/multipart esetén az AGENTS.md szerinti külön felhatalmazás.
- [ ] Tartós import-, fájl- és sessionazonosság; befejezett fájlok nem indulnak újra.
- [ ] Fájlonkénti resume/retry/cancel és partial-success UI, korlátozott párhuzamossággal.
- [ ] Backend auth/owner check folytatáskor is; session-, URL- és auth-lejárat, megújítás és quota-retention összehangolása.
- [ ] Részleges adat takarítása; cleanup-hibánál foglalásmegtartás és retry, kvótakiskapu nélkül.
- [ ] Azonos import ismétlése nem duplikál fájlt vagy számlálót.

**Unit evidence:** identitás, állapotátmenet, reservation/retry/expiry/cancel invariánsok. **Valós működési evidence:** hálózat megszakítása és UI-ból folytatás, átvett/újraküldött bájtok és kész fájlok DB/storage ellenőrzése. A teljes baseline-összehasonlítás SZD2-6 része, a resume működésbizonyítása már itt szükséges.

### SZD2-4: Két processor és worker-restart helyreállítás

**Függőség:** SZD2-2 processor-alapjai; SZD2-3-mal közös november 6-i kapu, részben párhuzamosan készíthető.

- [ ] Előnézet és képadatkinyerés ugyanazon processor-interfészen; eredményenként azonosítható processor-verzió.
- [ ] Képméret és rendelkezésre álló készítési idő kezelése; hiányzó metadata szabályos eredmény, sérült/dekódolhatatlan kép elkülönített hiba.
- [ ] Tartós job-állapot, biztonságos munkafoglalás, retry és félbemaradt munka recoveryja worker-újraindítás után.
- [ ] Ismételt munkavégrehajtásból nem keletkezik második eredmény/preview vagy dupla kvótaterhelés.
- [ ] Csak a hibás lépés újrapróbálása a UI-ról; eredeti és sikeres másik eredmény közben elérhető.
- [ ] Decoder erőforráskorlátok, derived ownership és metadata privacy ellenőrzése.

**Unit evidence:** job/result egyediség, külön retry, hiányzó metadata, owner boundary, derived accounting. **Valós elfogadás:** tényleges worker leállítása/felállítása és ismételt job mellett ugyanannyi helyes objektum/eredmény és helyes használat; UI-ból követhető recovery. **Dolgozat:** import/feldolgozás állapotai, szekvencia és saját döntések, működő képekkel.

**November 6-i döntési kapu:** SZD2-3 és SZD2-4 együttes demonstrációja. Ha ez nem készül el, a januári befejezést és a hátralévő ütemet a témavezetővel felül kell vizsgálni.

### SZD2-5: Teljes alapalkalmazás és egységes UX

**Függőség:** SZD2-2; a végső elszámolás és lifecycle SZD2-3–4 eredményeivel együtt fogadható el.

- [ ] Determinisztikus `createdAt + id` cursor pagination és használható galéria kép-/rövidvideó-kezeléssel a meglévő limitig.
- [ ] Biztonságos preview/download, inline allowlist és backend ownership; videótranszkódolás nélkül.
- [ ] `usedStorageBytes`/`reservedStorageBytes` és derived policy szerinti usage kijelzés, retry közben is konzisztensen.
- [ ] Soft delete, trash és 30 napos restore; eredeti és derived adatokhoz igazított hozzáférés/processing, újraéledő régi share-link nélkül.
- [ ] Időkorlátos megosztás hash-elt tokennel, lejárat- és állapotellenőrzéssel, biztonságos publikus hibákkal.
- [ ] Alap audit és request ID; érthető empty/loading/error/success állapotok és használati útmutató.

**Unit evidence:** lapozás, retention-határ, share-expiry/hash, jogosulatlan hozzáférés, származtatott lifecycle és usage-invariánsok. **Manuális elfogadás:** egy felhasználó végigviszi a teljes folyamatot; más user adataihoz nem fér hozzá. Az automatizált végleges purge továbbra is Later.

### SZD2-6: Mérések, minőségi kapu és első teljes dolgozat

**Függőség:** SZD2-3–5. A tervezés és a tesztelés előkészítése már a korábbi szeletek alatt indul. **Tanári cél:** november 20.; a Coospace november 13-i teljesleadási céljával egyeztetendő.

- [ ] Kontrollált újrakezdő/folytatható összehasonlítás kis/nagy képcsomaggal (10/50 kép javaslat), azonos feltételekkel és dokumentált ismétlésekkel.
- [ ] Normál futás, hálózati megszakítás, worker-restart és sérült kép; helyes fájl-/eredményszám, újraküldött bájt és teljes kötegidő.
- [ ] DB/storage egyediség, tárhelyhasználat és tiltott mellékhatások tényleges ellenőrzése; eredményeket és korlátokat tartalmazó riport.
- [ ] Unit tesztek a megvalósított logikára, negatív és concurrency/idempotencia esetekkel; valós tesztriport.
- [ ] A végső integration/contract/e2e ellenőrzések és CI követelményeinek egyeztetése, majd bevezetése a megfelelő felhatalmazással. Javasolt kapu: reprodukálható build, lint/typecheck és tesztek, DB/storage együttműködés és fő user-flow bizonyítékokkal.
- [ ] Threat/privacy review, runbook és minimális megfigyelhetőség; a korábbi hibák újratesztelése.
- [ ] Első teljes dolgozat és véleményezhető projektcsomag, képernyőképekkel, kipróbált telepítéssel, mérési/tesztbizonyítékokkal és nyitott hibalistával.

**Fontos:** e mérföldkő tervbe foglalása nem engedélyez most CI-t vagy integration/e2e implementációt. A régi v1.2 darabszám-/tesztmix-/CI feltételek és a frissebb eredményközpontú Coospace végső alkalmazását tisztázni kell; a korábbi feltételek nem tekinthetők eltöröltnek. A felhasználóval kell rendezni a bevezetés kapuját még a lezárás előtt.

### SZD2-7: Felhasználói próbák, javítások és végleges átadás

**Függőség:** SZD2-6 teljes változata. **Belső cél:** december 4-i javított csomag, december 11-i lezárás.

- [ ] Tényleges, lehetőleg célcsoportot képviselő felhasználói próbák: forgatókönyv, szerep, tapasztalat és javítás; személyes azonosítók nélkül.
- [ ] Javítások utáni újrateszt, a részleges siker/hiba/folytatás UX ismételt kipróbálása.
- [ ] Dokumentált tiszta környezetes, másik gépes telepítési próba és szükség szerint javított Quickstart.
- [ ] Véleményezett, visszajelzések alapján javított dolgozat PDF-ben.
- [ ] Azonosítható végleges commit/kiadás; ezzel egyező screenshotok, API/adatmodell, teszt/mérési/UAT-riport és használati útmutató.
- [ ] Demo script, release notes, self-assessment és ismert korlátok; fontos MI-javaslatok és emberi ellenőrzések naplója.
- [ ] A belső csomagtól külön a hivatalos feltöltés követelményeinek ellenőrzése a hallgató által.

**Elfogadás:** a teljes alkalmazás egyeztetett környezetben bemutatható és leírás alapján újra felépíthető; fizetős cloud nem feltétel. Saját fejlesztői ellenőrzés nem külső UAT. A dolgozat önállóan is értelmezhető, és ugyanazt a tényleges verziót mutatja, mint a szoftver.

## Párhuzamos dolgozatírás és kapcsolattartás

| Szoftverállapot | Egyidejű dolgozati eredmény |
|---|---|
| SZD2-0–1 | Probléma, meglévő megoldások, scope, követelmények, alternatívák és tervezés |
| SZD2-2 | Első működő folyamat leírása és valós screenshotok; október 23-i dolgozatrész |
| SZD2-3–4 | Saját transfer-/processing-döntések, állapotok, retry/recovery és kvóta; november 6-i köztes verzió |
| SZD2-5–6 | Teljes megvalósítás, reprodukálható mérések, tesztek, korlátok és első teljes kézirat |
| SZD2-7 | UAT, javítások, végső következtetés és témavezetői visszajelzések beépítése |

Minden érdemi előrelépésről a hallgató küldjön commitot, bemutatható eredményt, ellenőrzést, aktuális kéziratot és akadályt a témavezetőnek; az AI csak külön felhasználói utasításra küldhet üzenetet. A commit feltöltése önmagában nem konzultációs értesítés.

## Opcionális MVP+ és későbbi bővítések

Az MI nem előfeltétele egyik kötelező kapunak sem. Csak a kötelező mag stabilizálása és külön felhasználói/provider/privacy/dependency döntés után tervezhető harmadik processorként: aktív képre explicit indítás, címke/leírás-javaslat, accept/edit/reject és core-tól független hibakezelés. Arcfelismerés, biometria és érzékeny következtetés tiltott.

Later marad az automatizált végleges purge/reconciliation, nagyvideós multipart és 100 MB feletti limit, AWS/OCI-deployment, offline előkészítés, transzkódolás, admin, fejlett keresés/monitoring, share-revoke/access limit. Thumbnail és a kötelező képresume nem Later; a leadás előtti minőségterv nem opcionális termékbővítés.

## Közös Definition of Done

- A szelet acceptance criteriája működő UI/backend/storage eredménnyel teljesül; a dokumentációs feladat saját dokumentációs eredménye külön kezelendő.
- A változó üzleti logika releváns unit tesztjei futnak; a szelet valós próbájának verziója, környezete és eredménye rögzített.
- A követelmény, use case, kód, API/adatmodell és teszt/evidence megfeleltethető; nincs jelöletlen terv/implementáció eltérés.
- Nincs valódi secret vagy szükségtelen PII/token/presigned URL/fájltartalom a repóban és logokban.
- A dolgozat, használati/telepítési leírás és AI-napló az adott készültséghez igazodik; nem állít jövőbeli képességet megvalósultnak.
- Review és a projekt branch/commit szabályai teljesülnek; a teljes SZD2 csak a minőségi, UAT- és átadási kapukkal együtt zárható le.
