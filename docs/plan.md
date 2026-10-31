# Szakdolgozati high-level terv – CloudVault

## Státusz és források

**2026-10-18-i célterv, 2026-10-20-i állapot: technikai alap és backend auth implementált; teljes termékfolyamat még nincs.**

A repository Vue/NestJS scaffoldot, központilag validált konfigurációt, health endpointot, Prisma-sémát/kezdeti migrációt, npm workspace-scripteket és PostgreSQL–MinIO Compose-környezetet tartalmaz. Jest/Vitest unit runnerek és alaptesztek létrejöttek; a tényleges futtatási eredményeket és a kézi Quickstart-próba státuszát a tesztriport rögzíti. Jelszóhash/check, backend regisztráció, login/logout/me és HttpOnly JWT-cookie implementált; fájlkezelés, import és processor még nincs. A frontend `/register` és `/login` űrlap, valamint a szerveresen ellenőrzött `/app` fiókoldal loading/error/retry kezeléssel implementált; regisztrációnál mezőhibák, jelszómegerősítés és sikerjelzés/login átvezetés is van, auto-login nélkül. Az auth valós PostgreSQL- és böngészős cookie-próbája még nyitott. A terv az októberi témavezetői visszajelzés alapján frissíti a júliusi irányt. A források összefoglalója a gyökérbeli [SKILL.md](../SKILL.md), a munkaszabályok az [AGENTS.md](../AGENTS.md) fájlban találhatók. A nyers levelek a repó melletti `emails/02-email.txt`, `emails/03-email.txt`, a kurzuskövetelmények a `coospace/coospace-szakdoga-2.txt` forrásban vannak; önálló klónozáskor ezek hiányozhatnak.

A teljes alkalmazás Docker Compose-indítása a `docker-compose.yaml` fájlban implementált, automatikus migrációval és bucket-inittel; a konténeres build/indulás tényleges próbája Docker motor hiányában még nyitott. Ez nem zárja le az auth/Quickstart evidence-kaput.

Ez a dokumentum az aktuális cél és scope-változás forrása; a [mérföldkövek](milestones.md) adják a végrehajtási sorrendet és az evidence-kapukat. A [scope contract](01_product/scope_contract.md), [ADR-ek](02_architecture/adr/README.md) és [design dokumentáció](03_design/README.md) meglévő biztonsági és életciklus-szabályai érvényes kiindulópontok, de az új import-/processing-szerződésekkel még kiegészítendők. A single-PUT-only, thumbnail-Later és végleges unit-only scope nem írhatja felül az alábbi új célokat. A tervfrissítés nem jelent protokoll-, dependency- vagy implementációs jóváhagyást.

## 1. Cél és saját mérnöki hozzájárulás

A CloudVault S3-kompatibilis objektumtárolóra épülő, önállóan használható személyes médiafájl-kezelő webalkalmazás. A teljes alapfolyamat: regisztráció, belépés, képek/rövid videók feltöltése, galéria és előnézet, letöltés, tárhelyhasználat, időkorlátos megosztás, soft delete és 30 napon belüli restore.

A központi szakdolgozati probléma a részben sikeres médiaimport megbízható befejezése. Például ötven kép feltöltésekor megszakadhat a hálózat, lehet köztük sérült kép, illetve hibázhat vagy újraindulhat a feldolgozó. A rendszer tartsa meg az elkészült munkát, folytassa a részleges átvitelt, különítse el a hibákat, és ismétléskor se hozzon létre másolatokat vagy dupla tárhelyterhelést. A dolgozat saját eredménye a választott illesztés, az állapot- és elszámolási szabályok, a bővíthető feldolgozás és az összehasonlító mérés.

## 2. Négy kötelező szakmai pillér

### 2.1 Teljes médiafájl-kezelő alkalmazás

- Regisztráció, be-/kijelentkezés, védett frontend és backend ownership-ellenőrzés.
- Legfeljebb 100 MB-os kép vagy rövid videó privát MinIO/S3 tárolóban; a limit a korábbi elfogadott alap marad.
- PostgreSQL-metaadatok és elkülönített bináris tárolás, storage adapteren keresztül.
- Cursor-lapozott saját galéria, biztonságos preview/download és érthető betöltési, üres, sikeres és hibaállapotok.
- Következetes kvótafoglalás és használatkijelzés, időkorlátos hash-elt share token, soft delete és restore.
- Rövid életű backend-kontrollált tárolóhozzáférés; tartós storage credential nem kerül a frontendhez.

### 2.2 Megszakításból folytatható kötegelt import

- Több fájl egy stabilan azonosított importműveletben, fájlonkénti állapottal és előrehaladással.
- A kész fájlok megmaradnak; a megszakadt átvitel a már átvett adattól folytatható. A teljes fájl újraküldése önmagában nem teljesíti ezt.
- Korlátozott párhuzamosság, külön újrapróbálható hibák és részleges siker; egy sérült fájl nem állítja le a teljes köteget.
- Tartós import-/fájl-/átviteli azonosság és idempotens műveletek; retry nem duplikál fájlt vagy kvótát.
- Dokumentált session-lejárat, jogosultságmegújítás, megszakítás, megszüntetés és részleges adatok takarítása.

Meglévő átviteli mechanizmust kell illeszteni. Az Uppy/tus a témavezető által javasolt vizsgálati kiindulás, nem kiválasztott függőség. A tus és az S3 multipart eltérő megoldás; a választást rövid PoC és ADR alapozza meg. Saját átviteli protokoll nem cél. A nagy videók későbbi multipart bővítése nem indok a kötelező képimport folytathatóságának elhalasztására.

### 2.3 Bővíthető képfeldolgozás és tartós helyreállítás

- Két beépített processor: előnézeti kép készítése és elérhető képadatok kinyerése, például képméret és készítési idő.
- Közös illesztési felület és rögzített processor-verzió; a következő feldolgozó hozzáadása ne igényelje az upload átírását.
- A hiányzó képadat szabályos, megkülönböztethető eredmény; a feldolgozási hiba ettől külön állapot.
- Tartós munkák és eredmények; worker-újraindításkor a kész munka megmarad, a félbemaradt munka helyreállítható.
- Külön processor-retry: a sikeres másik eredmény és az eredeti fájl használható marad.
- Ismételt munkakézbesítés nem hoz létre újabb előnézetet, eredményt vagy használati terhelést.
- Az eredeti, részleges és származtatott objektumok jogosultságát, kvótáját, cleanupját, törlését és restore-ját közös szabályrendszer kezeli.

Egy alkalmazás, PostgreSQL, objektumtároló és egyszerű háttérfeldolgozó elegendő. A worker megvalósítása és a feladattárolás módja még döntés; külön queue-termék vagy elosztott platform nincs kiválasztva. Felhasználó által feltölthető program vagy pluginpiactér nem része a rendszernek.

### 2.4 Mérhető eredmény, használhatóság és dolgozat

- Az újrakezdő és a folytatható upload összehasonlítása azonos képcsomagokon és feltételekkel.
- Normál futás, kontrollált hálózati megszakítás, feldolgozó-újraindítás és sérült kép vizsgálata.
- Helyes eredeti-/processor-eredményszám, újraküldött adatmennyiség és teljes befejezési idő mérése; DB/storage és kvóta ellenőrzésével.
- Egységes, segítség nélkül végigjárható UI; tényleges felhasználói próbákból származó javítások.
- Párhuzamos dolgozatírás: probléma, alternatívák, saját döntések, működés, tesztek/mérések és korlátok, valós képernyőképekkel.
- Reprodukálható, ténylegesen kipróbált telepítés és ugyanahhoz a verzióhoz tartozó leadási csomag.

## 3. Scope és megőrzendő invariánsok

| Fázis | Tartalom |
|---|---|
| Kötelező SZD2 mag | A teljes alapalkalmazás, folytatható képimport, két processor, tartós recovery, kvóta/jogosultság, tesztelés, mérés, UAT és dolgozat |
| Első bemutatható szelet | Belépés után kis képköteg feltöltése, galéria és első processor; ez még nem a teljes kötelező mag |
| Opcionális MVP+ | Képek MI-címke/leírás-javaslata, csak stabil mag és külön felhasználói/provider/privacy döntés után |
| Későbbi bővítés | Automatizált végleges purge, 100 MB feletti nagy videók, cloud deployment, transzkódolás, admin, fejlett keresés/monitoring, share-revoke és hozzáférésszám-limit |
| Későbbi külön vizsgálat | Offline import-előkészítés; a teljes offline app és nagy videók tartós böngészőtárolása nem jelenlegi cél |

A CI és integration/contract/e2e ellenőrzések a befejezést megelőző külön minőségi fázisba kerülnek tervezési feladatként, nem opcionális termékextraként. A konkrét végső kapu és a bevezetés felhatalmazása tisztázandó; unit-only fejlesztési szakasz alapján nem nyilvánítható késznek az SZD2.

Megőrzendő szabályok:

- A backend minden védett műveletnél ellenőriz felhasználót, tulajdonost és állapotot; a workerre és származtatott objektumokra is érvényes az owner-határ.
- `used + reserved + requested` alapján tranzakciós foglalás; validált confirmkor pontosan egyszeri reserved→used átvezetés.
- Méret, MIME allowlist és magic-number ellenőrzés; az eredeti fájlnév csak display metadata. A dekódoló processor erőforráskorlátait a részletes tervben rögzíteni kell.
- Hiányzó vagy sikeresen takarított objektum után oldható foglalás; cleanup-hibánál a foglalás és retry-lehetőség megmarad.
- Soft delete alatt a létező bináris objektum továbbra is foglal; restore nem dupláz használatot. Korábbi share-link nem éledhet újra.
- Származtatott előnézet nem lehet elszámolatlan storage-kiskapu; a thumbnail v1 pontos rezervációs/elszámolási terve már rögzített az ADR-016-ban és az adatmodellben; runtime és write-closure proof még nincs.
- Rövid életű read URL és biztonságos Content-Disposition; veszélyes tartalom nem szolgálható ki inline.
- Titok, token, hozzáférést adó URL, fájltartalom vagy szükségtelen személyes/EXIF-helyadat nem kerül logba.

## 4. Célarchitektúra és nyitott döntések

A stack változatlan: Vue 3 + Vite + TypeScript + Tailwind CSS + Vue Router; Node.js + TypeScript + NestJS; PostgreSQL + Prisma; helyben MinIO, később S3-kompatibilis cél. Az auth meglévő ADR-je egyórás JWT-t ír le HttpOnly cookie-ban; ezen a tervfrissítés nem változtat.

| Elem | Tervezett felelősség |
|---|---|
| Vue SPA | Auth, import és fájlonkénti progress/hiba/folytatás, galéria, fájlműveletek és usage |
| NestJS API | Auth/ownership, importvezérlés, kvóta, validáció, lifecycle, sharing és audit |
| Átviteli illesztés | Meglévő resumable mechanizmus összekötése az engedélyezett S3-tárolási műveletekkel; elhelyezése a PoC/ADR eredményétől függ |
| PostgreSQL | Felhasználó, fájl, kvóta és share metaadat mellett tartós import-, munka- és verziózott eredményállapot |
| Storage adapter + MinIO/S3 | Eredeti, részleges és származtatott adatok hozzáférése és takarítása; providerhívások elkülönítése |
| Egyszerű worker | Közös interfészű képfeldolgozók, részhibák és újraindítás utáni recovery |

Az API tartós állapota ne kizárólag folyamatmemóriában legyen. A korábbi közvetlen presigned PUT/GET adatút jó baseline, de az, hogy a resumable adatfolyam mely komponensen halad át, még nem lezárt architektúradöntés. Nem írható elő egyszerre kivétel nélküli közvetlen PUT és egy még nem vizsgált tus-illesztés.

| Nyitott döntés | Kötelező döntési bizonyíték |
|---|---|
| Átviteli mechanizmus és upload-adatút | PoC: részleges folytatás, jogosultság, tényleges S3-eredmény és újraküldött bájt; ADR-005/009/011 felülvizsgálata |
| Import-/fájl-/job-/eredményazonosság | Állapotgép, egyediségi szabályok és retry/ismételt kézbesítés esetei |
| Worker-feladatfoglalás és recovery | Hogyan ismerhető fel és folytatható a megszakadt munka konkurens duplázás nélkül; ne legyen elvárt „exactly once delivery” infrastruktúra |
| Részleges és derived storage policy | Foglalás/finalizálás, limit, retry, sikertelen cleanup, törlés/restore és későbbi purge összhangja |
| Lejáratok és megújítás | A korábbi 5 perces URL és 15 perces pending alapérték összehangolása a session-, auth- és folytathatósági időkkel |
| Képdekódolás és metaadatkezelés | Támogatott formátumok, erőforráskorlátok, hiányzó adat és privacy-szabályok; thumbnailhez Sharp választott az ADR-016-ban; metadata-processor későbbi, telepítés/PoC még nincs |

## 5. Célzott dokumentációs átvezetés

A friss high-level terv nem jelenti a részletes szerződések teljes elkészültét. A következő engedélyezett szelet előtt csak az érintett részeket kell kiegészíteni:

| Dokumentumcsoport | Még szükséges átvezetés |
|---|---|
| Product scope/capability/UX | Import és processing acceptance criteria, részleges siker és folytatás képernyőállapotai; a hat meglévő storage story megőrzése |
| C4 és ADR-ek | Import/worker felelősségek, kiválasztott adatút, recovery és derived quota; a thumbnail-Later/single-PUT korlát felülvizsgálata |
| API és adatmodell | Import/session, fájlonkénti állapot, job és verziózott derived eredmény; resume/retry/cancel/expiry/cleanup szerződés |
| Error, threat, privacy és runbook | Processor- és átviteli részhibák, jogosultság, dekódolási korlátok, metadata privacy, restart/retry diagnosztika |
| Traceability és minőség | Új követelmény → use case → API/entitás → unit/folyamat/mérés/UAT evidence; tényleges eredmények később |

A kezdeti technikai alap runtime kódja és Prisma-sémája már létrejött; ez nem zárja le a későbbi import-/processing-szerződéseket vagy a transfer-választást. Az első szelethez szükséges szerződésfrissítést a működő eredményhez kell méretezni; ne váljon újabb általános dokumentációs projektté.

## 6. Bizonyítás és dolgozat

A [metrikaterv](01_product/metrics.md) és [tesztstratégia](04_quality/test_strategy.md) alapján 10 és 50 saját, nem érzékeny kép javasolt összehasonlító bemenet. A kísérleti jegyzőkönyv előre rögzítse a fájlokat/méreteket, azonos szoftver- és környezetverziót, hálózati feltételeket, megszakítási pontokat, sérült mintát és ismétléseket. Ne ígérjen előre gyorsulást; az eredményekből következzen az értékelés.

A teljes kötegidő magában foglalja az átvitelt és a kijelölt processing befejezését; az API-latency ettől külön mérés. A sikeres UI-állapotot tényleges objektumokkal, adatbázisrekordokkal, egyediséggel és számlálókkal is igazolni kell. A mockolt unit teszt nem helyettesíti a recovery valós próbáját.

A dolgozat folyamatosan készül: először probléma, követelmények és alternatívák; a működő szeletekkel megvalósítás, valós screenshotok és ellenőrzési eredmények; végül összehasonlítás, UAT, korlátok és saját hozzájárulás. A fejlesztési MI-ről külön fejezet és rövid napló kell, konkrét elfogadott/módosított/elvetett javaslatokkal és hibákkal.

## 7. Következő lépés és kockázatok

A technikai alap ellenőrzését a 2026-10-19-i tesztriport rögzíti. A következő implementációs cél az auth, majd kis képköteg → validált tárolás → galéria → első processor. Elsőként az előnézetkészítő javasolt; a tanár csak az első feldolgozó látható eredményét kéri. A teljes folytathatóság és a második processor a következő kapu része; az első verzió nem nevezhető emiatt kész SZD2 alkalmazásnak.

Az október 23-i első eredmény a kezdeti technikai alap állapotából öt napon belüli, magas kockázatú cél. Heti tényleges ráfordítás nélkül nem adható hiteles kapacitásígéret. A legnagyobb technikai kockázat a resumable/storage illesztés, a job-recovery és az eredeti/derived kvóta. Ezeket korai, szűk döntéssel és próbával kell csökkenteni.

A tanári és közös belső dátumokat a [roadmap ütemezési táblája](milestones.md) külön kezeli; az október 22/23. és november 13/20. eltérést egyeztetni kell. Ha a novemberi működő mag elmarad, a januári befejezést újra kell ütemezni a témavezetővel. Az MI-MVP+ nem előfeltétele a kötelező lezárásnak.

## Első thumbnail-szelet szerződésállapota – 2026-10-29

Az [ADR-016](02_architecture/adr/ADR-016-thumbnail-processing.md), [API](03_design/api.md#első-thumbnail-processor-api--implementált-2026-10-31) és [adatmodell](03_design/data_model.md#első-thumbnail-processor--tervezett-szerződés-2026-10-29) lezárja az első thumbnail tervezési választásait: Sharp, statikus512 WebP, közös interfész, verziózott job/attempt/result, PostgreSQL-claim/fence, bounded retry/recovery és pontos derived reservation. E részre a fenti „nyitott” táblák most implementációs/verifikációs kaput jelentenek; a teljes import-/metadata-szerződés továbbra is nyitott. Ugyanazon backend-kódból futó külön erőforrás-limitált worker szerep tervezett, nem új queue-platform. Sharp 0.35.5, a közös interfész és explicit thumbnail-transzformáció implementált; worker és új API nincs; a tartós processor-adatmodell sémája/migrációja és a bounded original-read/create-only derived-write adapter külön szeletekben elkészült. Derived full-read/adoption és a kvótakezelő orchestration még nincs. A bizonytalan írások closure-proofjának hiánya explicit CLEANUP_BLOCKED állapot, nem megoldott recovery/cleanup.


2026-10-30-i részlépés: explicit ProcessingStateService/ProcessingPublicationService kezeli a tartós jobokat, claim/fence/lease/retry állapotot, pontos derived foglalást és atomikus result/accounting/audit véglegesítést. Bizonytalan candidate megtartja a foglalását; pozitív R-re nincs proof nélküli release. Ez nem automatikus pipeline: worker/confirm-hook/API, full-read adoption és provider closure továbbra nyitott, a galéria még eredetit használ.


2026-10-31-i részlépés: az új ACTIVE upload confirm a meglévő tranzakcióban menti az egyedi QUEUED thumbnail-jobot, így az aktiválás után nincs elveszíthető enqueue-ablak. ACTIVE replay nem backfill és nem resetel jobot. Worker/processorfuttatás/új processing API, derived recovery és provider closure változatlanul nyitott.


2026-10-31-i worker-szelet: külön, erőforrás-korlátozott thumbnail-worker a meglévő backend image-ben, PostgreSQL-claim/fence, heartbeat, bounded retry/probe és full-read restart adoption. Nincs új queue, legacy backfill vagy thumbnail UI/API. Valódi restart/cgroup/OOM és DB/storage együttműködési bizonyíték továbbra a tesztriport nyitott manuális kapuja; provider-closure és pozitív R-release sincs megoldva.


2026-10-31-i API-szelet: implementált saját ACTIVE képek összevont processing statusa, kész thumbnail rövid életű megtekintési URL-je és külön, revision-CAS alapú korlátozott kézi retry. A fájllista/original-preview változatlan; thumbnail UI, valódi HTTP/DB/MinIO és restart bizonyíték továbbra nyitott.


2026-10-31-i galéria-szelet: kész thumbnail a kártyán, nagy előnézetben eredeti; elkülönített státusz/hiba/kézi processor-retry, összevont maximum20 ID/10s/egy in-flight polling, visibility/unmount abort, közös négyes memory-only URL-sor. Implementált unit/template szinten; valós pipeline/böngésző és restart elfogadás továbbra külön nyitott kapu.


2026-10-31-i tényleges helyi ellenőrzés: HTTP/DB/MinIO confirm/job/thumbnail, sérült kép, két worker/confirm-replay, bounded retry, kvóta, ownership és SIGKILL utáni STORED-adoption sikeres a tesztriport konkrét eseteiben. A teljes galéria-elfogadás **FAIL (TH-01)**: kész státusz mellett nincs thumbnail URL-kérés/kártyakép; az eredeti modal működik. Javítás/reteszt szükséges, más recovery-pontok és külső UAT nyitott.


2026-10-31-i javítás/reteszt: TH-01 két watcher közti invalidálási verseny reprodukálva és javítva; új UI-feltöltésből kész thumbnail a kártyán, eredeti a modalban, Escape/fókusz és A/B elkülönítés ténylegesen ellenőrizve. TH-02 szöveg javítva. A korábbi FAIL történeti evidence marad; teljes SZD2/recovery/UAT továbbra a nyitott kapuk szerint.
