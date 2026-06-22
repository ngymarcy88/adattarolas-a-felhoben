# plan.md

# Szakdolgozati high-level terv

**Szakdolgozat címe:** Adattárolás a felhőben  
**Projekt munkacíme:** CloudVault / Cloud Media Storage  
**Dokumentum státusza:** Véglegesített high-level terv, kritikus termékminőségi finomításokkal kiegészítve, későbbi részletes MVP- és ADR-dokumentumok alapja  
**Nyelv:** A tervezési dokumentum magyar nyelvű, a kód, commitok, API nevek és technikai azonosítók angol nyelvűek legyenek.

---

## 1. Kiinduló elképzelés

A szakdolgozat célja egy olyan webes alkalmazás elkészítése, amely felhasználói fájlok, elsősorban képek és videók felhőalapú tárolását, megtekintését, letöltését és megosztását biztosítja.

A rendszer fő fókusza nem egyszerűen egy fájlfeltöltő alkalmazás, hanem annak bemutatása, hogy egy termékminőségű rendszer hogyan használ felhőalapú objektumtárolást, hogyan kezeli a felhasználói jogosultságokat, hogyan tárol metaadatokat adatbázisban, és hogyan biztosít átlátható, tesztelhető, dokumentált működést.

A projekt AI-asszisztált fejlesztési módszertannal készül, de az AI által adott javaslatokat, kódot és dokumentációt ellenőrizni, tesztelni és dokumentálni kell.

---

## 2. Felülvizsgált koncepció és ellenajánlat

Az eredeti elképzelés jó alap: AWS vagy Oracle Cloud S3-kompatibilis objektumtárolás, felhasználókezelés, frontend UI, képek/videók megtekintése, megosztás, adathasználat jelzése.

Az ellenajánlatom az, hogy a frontend **ne közvetlenül kezelje az S3-hozzáférést**, hanem a rendszerben legyen egy backend réteg, amely:

- ellenőrzi a felhasználó jogosultságát,
- létrehozza a feltöltési vagy letöltési jogosultságot,
- kezeli a fájlok metaadatait,
- tárolja a megosztási szabályokat,
- számolja a felhasználói tárhelyhasználatot,
- egységes hibakezelést és naplózást biztosít.

Ez termékminőség szempontból jobb, mert a bucket nem lesz közvetlenül nyilvános, az üzleti logika nem kerül a frontendbe, és később könnyebb AWS S3, Oracle Cloud Object Storage vagy MinIO között váltani.

A fejlesztés első fázisában a rendszer **lokálisan MinIO-val** fusson, mert ez S3-kompatibilis, könnyen indítható Docker Compose-ból, és nem igényel valódi cloud credentialt a napi fejlesztéshez. A későbbi fázisban lehet AWS S3 vagy Oracle Cloud Object Storage integrációt készíteni ugyanarra az absztrakcióra.

---

## 3. Javasolt technológiai stack

### 3.1 Frontend

**Választott technológia:** Vue 3 + Vite + TypeScript + Tailwind CSS

Indoklás:

- A Vue 3 kezdőbarátabb és gyorsabban produktív, mint az Angular.
- A Vite gyors fejlesztői környezetet ad.
- A TypeScript segíti a típusbiztonságot és az AI által generált kód ellenőrzését.
- A Tailwind CSS gyors UI építést tesz lehetővé, ami szakdolgozati projektben előnyös.
- A Vue ökoszisztéma elég érett egy dashboard/jellegű fájlkezelő alkalmazáshoz.

Lehetséges fő frontend könyvtárak:

- Vue Router: oldalak és útvonalak kezelése.
- Pinia: állapotkezelés, ha szükséges.
- Axios vagy Fetch wrapper: API kommunikáció.
- Tailwind CSS: layout és komponens styling.
- Vitest: frontend unit tesztek.

### 3.2 Backend

**Választott technológia:** Node.js + TypeScript + NestJS

Indoklás:

- A NestJS strukturáltabb, mint egy egyszerű Express projekt.
- Jól illeszkedik moduláris architektúrához.
- Támogatja a dependency injectiont, ami tesztelésnél hasznos.
- Könnyebb dokumentálni a modulhatárokat, kontrollereket, service-eket és use case-eket.
- Jó alap OpenAPI/Swagger dokumentációhoz.

Lehetséges backend könyvtárak:

- NestJS core modulok.
- Prisma ORM.
- Passport/JWT vagy saját auth guard.
- AWS SDK v3 S3 client, amely MinIO-val és S3-kompatibilis storage-dzsal is használható.
- Zod vagy class-validator validációhoz.
- Vitest vagy Jest backend unit tesztekhez.

### 3.3 Adatbázis

**Választott technológia:** PostgreSQL + Prisma

Indoklás:

- A rendszerben sok relációs adat van: felhasználó, fájlmetaadat, tulajdonos, megosztási link, jogosultság, tárhelyhasználat.
- A PostgreSQL jobb választás ehhez, mint egy dokumentum-alapú NoSQL adatbázis.
- A Prisma fejlesztőbarát, jól generálható TypeScript típusokat ad, és támogatja a migrációkat.
- A relációs modell jól dokumentálható a szakdolgozatban.
- A későbbi riportok, storage usage számítások és lekérdezések SQL-ben természetesebbek.

Miért nem NoSQL az elsődleges választás?

- A fájlok bináris tartalma nem az adatbázisban lesz, hanem object storage-ban.
- Az adatbázis főleg strukturált metaadatokat tárol.
- A jogosultságok, owner kapcsolat, share linkek és usage számítások relációs modellben tisztábban kezelhetők.
- NoSQL akkor lenne erősebb jelölt, ha nagyon változékony, félig strukturált dokumentumokat kellene tárolni.

### 3.4 Object storage

**Választott lokális megoldás:** MinIO  
**Későbbi cloud cél:** AWS S3 vagy Oracle Cloud Object Storage S3-kompatibilis API-val

Indoklás:

- A MinIO lokálisan könnyen futtatható.
- S3-kompatibilis API-t biztosít.
- Nem kell fejlesztés közben valódi cloud kulcsokat használni.
- A backendben kialakítható egy storage adapter réteg, amely később AWS S3-ra vagy OCI Object Storage-ra cserélhető.

Fontos tervezési döntések:

- A bucket alapértelmezetten privát legyen.
- A frontend ne kapjon hosszú életű cloud credentialt.
- A backend adjon ki rövid életű feltöltési/letöltési URL-t, vagy proxyzza a fájlelérést.
- A fájlok törlését nem szabad csak adatbázis-szinten kezelni: tervezni kell az S3/MinIO objektumok életciklusát is.
- A fájltípus-ellenőrzés ne csak kiterjesztés és frontend által küldött `Content-Type` alapján történjen, hanem magic number alapú backend validációval is.
- A nagy fájlok, főleg videók esetén a sima egy URL-es feltöltés mellett későbbi fejlesztési irányként szerepeljen az S3 Multipart Upload.
- A végleges döntéseket ADR-ben kell rögzíteni.

---

## 4. Célfelhasználók és probléma

### 4.1 Elsődleges célfelhasználó

Egy átlagos webes felhasználó, aki képeket és videókat szeretne feltölteni egy saját tárhelyre, majd ezeket biztonságosan megtekinteni, letölteni és megosztani.

### 4.2 Másodlagos célfelhasználó

Egy technikai érdeklődésű vagy kis csapatban dolgozó felhasználó, akinek fontos, hogy lássa a tárhelyhasználatot, és kontrollálni tudja, mit osztott meg másokkal.

### 4.3 Megoldandó probléma

A felhasználók gyakran szeretnének fájlokat felhőben tárolni, de egy termékminőségű fájltároló rendszer nem csak a feltöltésből áll. Szükség van jogosultságkezelésre, metaadat-kezelésre, biztonságos megosztásra, hibakezelésre, tárhelyhasználat követésére és dokumentált működésre.

---

## 5. Termékvízió

A projekt egy olyan webes fájl- és médiakezelő alkalmazás, amely bemutatja, hogyan lehet felhasználói tartalmakat S3-kompatibilis objektumtárolóban tárolni úgy, hogy közben az alkalmazás termékminőségű marad: futtatható, tesztelhető, dokumentált, biztonságosabb alapokra épül, és a felhasználó számára értelmezhető funkciókat nyújt.

A rendszer nem egy teljes Google Drive vagy Dropbox alternatíva kíván lenni, hanem egy szakdolgozati scope-ba illeszthető, jól dokumentált MVP, amely a cloud object storage köré épül.

---

## 6. Kritikus termékminőségi finomítások

Az alábbi finomítások a projektet erősebbé teszik szakdolgozati és mérnöki szempontból. Ezek nem önálló látványos feature-ök, hanem olyan tervezési döntések, amelyek bizonyítják, hogy a rendszer nem csak demo szinten működik, hanem figyelembe veszi az adattárolás életciklusát, a teljesítményt és a biztonságot.

### 6.1 Soft delete és S3 objektum-életciklus

A fájl törlése nem csak azt jelenti, hogy a `FileObject` rekord kap egy `deletedAt` értéket. A bináris tartalom továbbra is ott maradhat az S3/MinIO bucketben, ami tárhelypazarlást, költségnövekedést és árván maradt objektumokat okozhat.

A tervezett megoldás:

- A felhasználói törlés első lépésben soft delete legyen: a fájl eltűnik a normál listából, de az adatbázisban megmarad.
- A `FileObject` kapjon `deletedAt` és `purgeAfter` mezőt.
- A soft delete után a fájl például 30 napig visszaállítható maradhat.
- A végleges törlést egy háttérfolyamat végezze, például NestJS `@nestjs/schedule` alapú cron job.
- A purge job törölje az objektumot MinIO/S3-ból, majd frissítse vagy végleg törölje az adatbázis rekordot.
- Későbbi cloud környezetben S3 Lifecycle Policy is használható kiegészítő védőhálóként, de az alkalmazásoldali cleanup továbbra is fontos, mert az adatbázis-metaadatokat is szinkronban kell tartani.

Ez jó ADR- és runbook-téma, mert bemutatja az object storage és a relációs metaadat-tárolás közötti konzisztencia problémáját.

### 6.2 Tárhelyhasználat denormalizált számlálóval

Az MVP első gondolata lehetne, hogy a tárhelyhasználat minden dashboard betöltésnél `SUM(sizeBytes)` lekérdezéssel számolódik a `FileObject` táblából. Ez kis adatmennyiségnél működik, de sok fájl esetén rosszul skálázódhat.

A tervezett megoldás:

- A `User` entitás tartalmazzon egy `usedStorageBytes` mezőt.
- Sikeres upload completion után a backend tranzakcióban növelje ezt az értéket.
- Hard delete vagy purge után a backend tranzakcióban csökkentse ezt az értéket.
- Soft delete esetén külön döntés szükséges: a törölt, de még visszaállítható fájl számítson-e kvótába. Alapértelmezett javaslat: amíg fizikailag létezik az object storage-ban, addig számítson bele, vagy külön jelenjen meg `active` és `trash/recoverable` bontásban.
- Prisma szinten ez megoldható service-layer tranzakcióval, Prisma extensionnel/middleware-rel, vagy később DB triggerrel.

MVP-ben a legátláthatóbb választás: service-layer Prisma transaction, mert egyszerűen tesztelhető unit teszttel és jól dokumentálható.

### 6.3 Biztonságos fájltípus-ellenőrzés és XSS-védelem

A fájlnevek, MIME típusok és böngészős megjelenítés biztonsági kockázatot jelenthetnek. Nem elég elfogadni azt, amit a frontend vagy a böngésző `Content-Type` mezőként küld, mert ez manipulálható.

A tervezett megoldás:

- A backend ellenőrizze a fájl első bájtjait magic number alapján, például `file-type` könyvtárral.
- Csak allowlistelt típusok legyenek engedélyezve, például JPEG, PNG, WebP, GIF, MP4, WebM.
- Az eredeti fájlnév csak display célra maradjon meg, storage key-nek soha ne azt használja a rendszer.
- A fájlneveket UI-ban escape-elve kell megjeleníteni.
- Signed URL generáláskor a backend állítsa vagy kényszerítse a megfelelő `Content-Type` és `Content-Disposition` viselkedést.
- Ismeretlen vagy potenciálisan veszélyes tartalom esetén `attachment` letöltési mód legyen, ne `inline` megjelenítés.
- A jogosulatlan fájlmegtekintés ne szivárogtasson információt más felhasználók fájljairól.

Ez security és privacy szempontból erősíti a projektet, és külön verification log bejegyzést is érdemel.

### 6.4 Nagy fájlok és Multipart Upload

Mivel a projekt képek mellett videókat is kezel, a nagy fájlok feltöltése külön tervezési kérdés. Egy egyszerű presigned PUT URL működhet kisebb fájlokra, de instabil hálózaton vagy 500 MB - 1 GB méretű videóknál problémás lehet.

MVP döntés:

- Az első MVP-ben a fájlméret-limit 100 MB legyen.
- A sima presigned upload elegendő az MVP demonstrációhoz.
- A dokumentációban és ADR-ben szerepeljen, hogy nagy fájlokra később S3 Multipart Upload szükséges.

Későbbi fázis:

- Backend multipart upload sessiont indít.
- Frontend darabokra bontva tölti fel a fájlt.
- Backend vagy frontend összegyűjti a part ETag-eket.
- Backend complete multipart upload műveletet hív.
- Sikertelen feltöltésnél abort multipart upload szükséges.

Ez kifejezetten jó szakdolgozati bővítési irány, mert cloud object storage-specifikus, termékminőségű gondolkodást mutat.

---

## 7. Tervezett MVP

Az MVP célja, hogy a rendszer végig demonstrálja a legfontosabb felhasználói és technikai folyamatokat:

1. Felhasználó regisztrál és bejelentkezik.
2. Felhasználó képet vagy videót tölt fel.
3. A fájl privát object storage bucketbe kerül.
4. A fájl metaadatai PostgreSQL adatbázisba kerülnek.
5. A felhasználó listázni és megtekinteni tudja a saját fájljait.
6. A felhasználó látja az aktuális tárhelyhasználatát.
7. A felhasználó meg tud osztani egy fájlt időkorlátos megosztási linkkel.
8. A felhasználó soft delete-tel törölni tudja a saját fájlját.
9. A rendszer a törölt fájlok életciklusát kezeli: `deletedAt`, `purgeAfter`, visszaállítás a megőrzési időn belül, későbbi háttér cleanup.
10. A rendszer alapvető hibákat kezel: túl nagy fájl, nem támogatott fájltípus, magic number alapján érvénytelen fájl, lejárt megosztási link, jogosulatlan hozzáférés.

### 7.1 MVP user story javaslatok

#### US-01: Regisztráció és bejelentkezés

Felhasználóként szeretnék saját fiókot létrehozni és bejelentkezni, hogy a fájljaim elkülönüljenek más felhasználók fájljaitól.

Elfogadási kritériumok:

- Új felhasználó tud regisztrálni email címmel és jelszóval.
- Bejelentkezés után a felhasználó hozzáfér a saját dashboardjához.
- Hibás jelszó vagy nem létező email esetén érthető hibaüzenet jelenik meg.
- A jelszó nem plain text formában tárolódik.

#### US-02: Fájl feltöltése

Felhasználóként szeretnék képet vagy videót feltölteni, hogy azt felhőalapú tárhelyen tárolhassam.

Elfogadási kritériumok:

- A felhasználó tud képet vagy videót kiválasztani és feltölteni.
- A rendszer validálja a fájl méretét és típusát.
- A backend nem csak a kiterjesztést és `Content-Type` mezőt ellenőrzi, hanem magic number alapján is validálja a fájlt.
- Sikeres feltöltés után a fájl megjelenik a saját fájllistában.
- Sikertelen feltöltés esetén a felhasználó érthető hibaüzenetet kap.
- Nagy videók esetén az MVP fájlméret-limitet alkalmaz; a multipart upload későbbi fejlesztési irányként dokumentált.

#### US-03: Saját fájlok megtekintése

Felhasználóként szeretném látni a feltöltött képeimet és videóimat, hogy könnyen megtaláljam és megnyithassam őket.

Elfogadási kritériumok:

- A felhasználó csak a saját fájljait látja.
- A képek előnézetként megjeleníthetők.
- A videók lejátszhatók vagy megnyithatók.
- Üres állapot esetén a rendszer jelzi, hogy még nincs feltöltött fájl.

#### US-04: Tárhelyhasználat megjelenítése

Felhasználóként szeretném látni, mennyi tárhelyet használok, hogy kontrollálni tudjam a feltöltéseimet.

Elfogadási kritériumok:

- A dashboardon megjelenik az összes használt tárhely.
- A rendszer mutat egy előre beállított kvótát.
- A rendszer jelzi, ha a felhasználó közel van a kvóta eléréséhez.
- A tárhelyhasználat MVP-ben denormalizált `usedStorageBytes` mezőből olvasható ki, amelyet a backend tranzakcióban frissít upload completion és purge esetén.
- A dokumentáció leírja, hogyan kezeli a rendszer a soft delete alatt álló, de még fizikailag létező fájlok méretét.

#### US-05: Fájl megosztása

Felhasználóként szeretnék egy fájlt időkorlátos linken megosztani, hogy más is elérhesse anélkül, hogy bejelentkezne.

Elfogadási kritériumok:

- A felhasználó létre tud hozni egy megosztási linket saját fájlhoz.
- A link lejárati idővel rendelkezik.
- Lejárt link esetén a fájl nem érhető el.
- Más felhasználó privát fájlja nem osztható meg jogosulatlanul.

#### US-06: Fájl törlése

Felhasználóként szeretnék fájlt törölni, hogy kezelni tudjam a tárhelyemet.

Elfogadási kritériumok:

- A felhasználó csak saját fájlt törölhet.
- Törlés után a fájl soft delete állapotba kerül és eltűnik a normál listából.
- A rekord `deletedAt` és `purgeAfter` mezőt kap.
- A felhasználó a 30 napos megőrzési időn belül vissza tudja állítani a fájlt.
- A soft delete és a visszaállítás nem módosítja a `usedStorageBytes` értékét; az csak a végleges purge után csökken.
- A rendszer kezeli, ha a storage-ból végleges törlés közben hiba történik.
- A későbbi háttérfolyamat véglegesen törli az objektumot MinIO/S3-ból és frissíti az adatbázist.

---

## 8. Nem célok az első MVP-ben

Az MVP tudatosan nem tartalmazza az alábbiakat:

- Teljes Dropbox/Google Drive szintű fájlkezelés.
- Mappák és komplex jogosultsági hierarchia.
- Valós idejű kollaboráció.
- Mobilalkalmazás.
- Fizetés vagy előfizetés kezelés.
- Több régiós cloud deployment.
- Automatikus videó transzkódolás.
- Teljes körű admin panel.
- Komplex keresőmotor.
- Fejlett trash-kezelés, például tömeges visszaállítás vagy egyedi megőrzési idő. Az MVP egyszerű listázást és egyedi visszaállítást biztosít.
- Multipart upload teljes implementáció az első MVP-ben; ez későbbi szakdolgozati bővítés.
- CI/CD pipeline az első fejlesztési fázisban.
- Integrációs és e2e tesztek az első fejlesztési fázisban.

Ezek közül néhány később stretch feature lehet, de nem képezik az első MVP részét.

---

## 9. Stretch feature ötletek

A későbbi bővítésekhez ajánlott funkciók:

- Fájlok címkézése.
- Albumok vagy gyűjtemények létrehozása.
- Keresés fájlnév, típus vagy feltöltési dátum alapján.
- Megosztási link visszavonása.
- Thumbnail generálás képekhez.
- Videó metaadatok megjelenítése.
- Audit log: feltöltés, törlés, megosztás események.
- Egyszerű admin dashboard.
- Storage provider váltás konfigurációból.
- Oracle Cloud Object Storage konkrét integráció.
- AWS S3 konkrét integráció.
- Lifecycle policy dokumentáció.
- Fejlett trash/restore UI, például tömeges műveletekkel.
- Háttérben futó purge job NestJS `@nestjs/schedule` használatával.
- S3 Lifecycle Policy bevezetése cloud környezetben a véglegesen törlendő objektumokra.
- Magic number alapú fájltípus-ellenőrzés mélyebb validációval.
- Stored XSS elleni védelem fájlnév, MIME típus és `Content-Disposition` kezelésével.
- Multipart upload nagy videófájlokhoz.
- E2E teszt Playwrighttal.
- Integrációs teszt MinIO-val és PostgreSQL-lel.

---

## 10. Capability map javaslat

A végleges capability map külön dokumentumban legyen: `docs/01_product/capability_map.md`.

Kezdő capability-k:

| Capability | Kategória | MVP státusz | Megjegyzés |
|---|---|---:|---|
| Felhasználói regisztráció és bejelentkezés | Productization | MVP | Auth és ownership alap |
| Kép/videó feltöltése object storage-ba | Value | MVP | A fő domain funkció |
| Saját fájlok listázása és megtekintése | Value | MVP | Galéria nézet |
| Tárhelyhasználat megjelenítése | Value | MVP | User storage usage |
| Denormalizált usage számláló | Productization | MVP | `usedStorageBytes` frissítése tranzakcióban |
| Időkorlátos megosztási link | Value | MVP | Biztonságosabb sharing |
| Fájl soft delete és késleltetett purge | Productization | MVP/Később | DB és S3 életciklus összehangolása |
| Magic number alapú fájltípus-validáció | Productization | MVP | Ne csak kiterjesztés alapján döntsön |
| Biztonságos preview/download header kezelés | Productization | MVP | `Content-Disposition`, XSS kockázat csökkentése |
| Multipart upload nagy fájlokra | Productization | Később | Videók stabil feltöltése |
| Fájl törlése és usage frissítése | Value | MVP | Storage lifecycle alap |
| Jogosultságellenőrzés fájlműveleteknél | Productization | MVP | Backend oldali enforcement |
| Egységes hibakezelés | Productization | MVP | API és UI stabilitás |
| Secrets kezelése `.env.example` segítségével | Productization | MVP | Nincs credential a repo-ban |
| Unit tesztek core logikára | Productization | MVP | Első tesztelési szint |
| Integrációs tesztek MinIO/PostgreSQL ellen | Productization | Később | Nem első fázis |
| E2E tesztek fő user flow-kra | Productization | Később | Nem első fázis |
| CI/CD quality gates | Productization | Később | Későbbi DevOps fázis |

---

## 11. High-level architektúra

### 11.1 Komponensek

A rendszer fő komponensei:

1. **Frontend alkalmazás**
   - Vue 3 + Vite + TypeScript.
   - Felhasználói felület loginhoz, uploadhoz, galériához, previewhoz, sharinghez.
   - A backend API-val kommunikál.

2. **Backend API**
   - NestJS + TypeScript.
   - Auth, fájlmetaadat-kezelés, storage műveletek, share link kezelés, usage számítás.
   - Backend oldali jogosultságellenőrzés.

3. **PostgreSQL adatbázis**
   - Felhasználók.
   - Fájl metaadatok.
   - Megosztási linkek.
   - Tárhelyhasználat számításához szükséges adatok.

4. **S3-kompatibilis object storage**
   - Lokálisan MinIO.
   - Később AWS S3 vagy OCI Object Storage.
   - A tényleges bináris fájlok itt tárolódnak.

5. **Docker Compose lokális környezet**
   - PostgreSQL.
   - MinIO.
   - Opcionálisan backend/frontend futtatás külön terminálból vagy konténerből.

### 11.2 Javasolt adatfolyam: feltöltés

1. Felhasználó kiválaszt egy fájlt a frontend UI-ban.
2. Frontend elküldi a fájl metaadatait a backendnek.
3. Backend ellenőrzi:
   - be van-e jelentkezve a user,
   - támogatott-e a fájltípus,
   - nem túl nagy-e a fájl,
   - belefér-e a kvótába.
4. Backend létrehoz egy storage key-t, amely nem az eredeti fájlnévből származik.
5. Backend presigned upload URL-t ad vissza, vagy backend proxyként feltölti a fájlt.
6. Frontend feltölti a fájlt.
7. Backend a feltöltés véglegesítésekor validálja a tényleges fájltípust magic number alapján, ha az implementációs modell ezt lehetővé teszi.
8. Backend rögzíti vagy véglegesíti a metaadatokat az adatbázisban.
9. Backend tranzakcióban frissíti a felhasználó `usedStorageBytes` értékét.
10. Fájl megjelenik a dashboardon.

A végleges implementáció előtt ADR-ben kell eldönteni, hogy az MVP-ben presigned URL vagy backend proxy upload legyen-e. Alapértelmezett ajánlás: presigned URL, mert jobban bemutatja az object storage használatát.

### 11.3 Javasolt adatfolyam: megtekintés

1. Felhasználó megnyitja a fájllistát.
2. Frontend lekéri a fájlok metaadatait.
3. Preview esetén frontend kér egy rövid életű view/download URL-t.
4. Backend ellenőrzi a jogosultságot.
5. Backend rövid életű signed URL-t ad vissza.
6. Frontend megjeleníti a képet vagy videót.

### 11.4 Javasolt adatfolyam: megosztás

1. Felhasználó kiválaszt egy saját fájlt.
2. Létrehoz egy időkorlátos megosztási linket.
3. Backend rögzíti a share linket az adatbázisban.
4. Külső user a link alapján eléri a fájlt.
5. Backend ellenőrzi a link érvényességét és lejáratát.
6. Ha érvényes, backend rövid életű signed URL-t ad vagy streameli a fájlt.
7. Ha lejárt, a rendszer érthető hibaoldalt ad.

### 11.5 Javasolt adatfolyam: törlés és purge

1. Felhasználó törlést kér egy saját fájlra.
2. Backend ellenőrzi a tulajdonjogot.
3. Backend soft delete állapotba teszi a rekordot: `deletedAt`, `purgeAfter`, `status = SOFT_DELETED`.
4. A fájl eltűnik a normál listából.
5. A `usedStorageBytes` nem változik; a felület opcionálisan külön jelölheti az aktív és a visszaállítható fájlok méretét.
6. A háttérben futó purge job időszakosan megkeresi a `purgeAfter <= now()` rekordokat.
7. A purge job törli az objektumot MinIO/S3-ból.
8. Sikeres törlés után az adatbázis rekord `PURGED` állapotba kerül vagy végleg törlődik.
9. Ha S3 törlés közben hiba történik, a rekord retry-ra alkalmas állapotban marad, és a hiba bekerül a logba.

---

## 12. Kezdeti adatmodell

A részletes adatmodell külön dokumentumba kerüljön: `docs/03_design/data_model.md`.

Kezdeti entitások:

### User

Felhasználói fiók.

Fő mezők:

- `id`
- `email`
- `passwordHash`
- `displayName`
- `storageLimitBytes`
- `usedStorageBytes`
- opcionálisan `deletedStorageBytes` vagy `recoverableStorageBytes`, ha külön szeretnénk mutatni a soft deleted fájlok méretét
- `createdAt`
- `updatedAt`

### FileObject

Feltöltött fájl metaadata.

Fő mezők:

- `id`
- `ownerId`
- `originalName`
- `storageKey`
- `bucket`
- `mimeType`
- `sizeBytes`
- `checksum`
- `status` (`UPLOADING`, `ACTIVE`, `SOFT_DELETED`, `PURGE_FAILED`, `PURGED`)
- `contentDisposition`
- `detectedMimeType`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `purgeAfter`

### ShareLink

Fájlmegosztási link.

Fő mezők:

- `id`
- `fileObjectId`
- `createdByUserId`
- `tokenHash`
- `expiresAt`
- `maxAccessCount`
- `accessCount`
- `revokedAt`
- `createdAt`

### StorageUsage

A tárhelyhasználatot nem érdemes minden dashboard betöltésnél `SUM(sizeBytes)` lekérdezéssel számolni.

Javasolt MVP megoldás:

- `User.usedStorageBytes` mező denormalizált számlálóként.
- Upload completion esetén növelés Prisma tranzakcióban.
- Hard purge esetén csökkentés Prisma tranzakcióban.
- Soft delete esetén dokumentált quota-szabály szükséges: vagy továbbra is beleszámít, amíg fizikailag létezik, vagy külön `active` és `trash` bontásban jelenik meg.

Későbbi alternatívák:

- Prisma extension/middleware.
- PostgreSQL trigger.
- Külön `StorageUsage` tábla audit célokra.

### AuditEvent későbbi fázisban

Nem MVP-kötelező, de később hasznos lehet:

- `id`
- `actorUserId`
- `action`
- `resourceType`
- `resourceId`
- `createdAt`
- `metadata`

### MultipartUploadSession későbbi fázisban

Nagy videófájlokhoz később szükséges lehet multipart upload session tárolása.

Lehetséges mezők:

- `id`
- `fileObjectId`
- `ownerId`
- `uploadId`
- `storageKey`
- `partSizeBytes`
- `status`
- `createdAt`
- `expiresAt`
- `completedAt`
- `abortedAt`

---

## 13. API high-level terv

A részletes API dokumentáció külön fájl legyen: `docs/03_design/api.md`.

Javasolt API csoportok:

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Files

- `POST /api/v1/files/init-upload`
- `POST /api/v1/files/complete-upload`
- `GET /api/v1/files`
- `GET /api/v1/files/:id`
- `GET /api/v1/files/:id/view-url`
- `DELETE /api/v1/files/:id`
- `POST /api/v1/files/:id/restore`

### Sharing

- `POST /api/v1/files/:id/share-links`
- `GET /api/v1/share/:token`
- `DELETE /api/v1/share-links/:id`

### Usage

- `GET /api/v1/usage`

### Multipart upload későbbi fázisban

- `POST /api/v1/files/multipart/init`
- `POST /api/v1/files/multipart/:uploadId/parts/:partNumber/sign`
- `POST /api/v1/files/multipart/:uploadId/complete`
- `POST /api/v1/files/multipart/:uploadId/abort`

### Health

- `GET /api/v1/health`

---

## 14. Hibakezelési elvek

A hibakezelési dokumentum külön fájl legyen: `docs/03_design/error_handling.md`.

Alapelvek:

- A backend egységes error objectet adjon vissza.
- A frontend ne nyers stack trace-t jelenítsen meg.
- A hibák legyenek user-friendly módon megfogalmazva.
- A backend logoljon diagnosztikai információkat, de ne logoljon jelszót, tokeneket, fájltartalmat vagy személyes adatot feleslegesen.
- A jogosultsági hibák ne árulják el, hogy más user fájlja létezik-e.

Javasolt error object:

```json
{
  "code": "FILE_TOO_LARGE",
  "message": "A fájl mérete meghaladja a megengedett limitet.",
  "requestId": "req_123"
}
```

Fontos hibakategóriák:

- validációs hiba,
- auth hiba,
- jogosultsági hiba,
- fájl nem található,
- lejárt megosztási link,
- storage provider hiba,
- adatbázis hiba,
- nem támogatott fájltípus,
- magic number validációs hiba,
- kvóta túllépés,
- purge job hiba,
- multipart upload részfeltöltési hiba későbbi fázisban.

---

## 15. Kezdeti mappastruktúra

A projekt egyetlen Git repo-ban készüljön. A dokumentáció a `docs/` mappában éljen, a kód és a konfiguráció ugyanabban a repo-ban legyen.

Javasolt struktúra:

```text
/
├── README.md
├── plan.md
├── AGENTS.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── package.json
├── package-lock.json
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   └── tests/
│       └── unit/
│
├── backend/
│   ├── package.json
│   ├── nest-cli.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── files/
│   │   ├── storage/
│   │   ├── sharing/
│   │   ├── usage/
│   │   ├── lifecycle/
│   │   ├── file-validation/
│   │   ├── health/
│   │   └── common/
│   └── tests/
│       └── unit/
│
├── docs/
│   ├── 00_index.md
│   ├── 01_product/
│   │   ├── vision.md
│   │   ├── scope_contract.md
│   │   ├── capability_map.md
│   │   └── ux_flows.md
│   ├── 02_architecture/
│   │   ├── c4_context.md
│   │   ├── c4_container.md
│   │   ├── quality_attributes.md
│   │   └── adr/
│   │       ├── 0001-use-vue-vite-typescript.md
│   │       ├── 0002-use-nestjs-backend.md
│   │       ├── 0003-use-postgresql-prisma.md
│   │       ├── 0004-use-s3-compatible-object-storage.md
│   │       ├── 0005-use-private-bucket-and-signed-urls.md
│   │       ├── 0006-use-monorepo-structure.md
│   │       ├── 0007-soft-delete-and-object-purge-strategy.md
│   │       ├── 0008-denormalized-storage-usage-counter.md
│   │       ├── 0009-secure-file-type-validation-and-content-disposition.md
│   │       └── 0010-multipart-upload-for-large-files.md
│   ├── 03_design/
│   │   ├── api.md
│   │   ├── data_model.md
│   │   └── error_handling.md
│   ├── 04_quality/
│   │   ├── test_strategy.md
│   │   └── test_report.md
│   ├── 05_security_ops/
│   │   ├── threat_model.md
│   │   ├── privacy_licensing.md
│   │   ├── deploy_runbook.md
│   │   └── observability.md
│   ├── 06_release/
│   │   ├── demo_script.md
│   │   └── release_notes.md
│   └── 07_ai/
│       ├── ai_manifest.md
│       ├── prompt_log.md
│       └── verification_log.md
│
└── tools/
    └── scripts/
```

Megjegyzés:

- A `ci/cd` és DevOps fájlok első körben nem kapnak külön hangsúlyt.
- A `docs/05_security_ops/` mappa ettől még létezhet, mert a security/privacy/runbook később kötelező lesz a szakdolgozati leadáshoz.
- A CI/CD pipeline későbbi fázisban kerül bevezetésre.

---

## 16. Dokumentációs terv

A szakdolgozói leadandó csomag miatt a dokumentáció nem opcionális. A dokumentáció a repo része, Markdown formában.

### 16.1 Első körben elkészítendő dokumentumok

- `README.md`
- `docs/plan.md`
- `docs/00_index.md`
- `docs/01_product/vision.md`
- `docs/01_product/scope_contract.md`
- `docs/01_product/capability_map.md`
- `docs/01_product/metrics.md`
- `docs/01_product/ux_flows.md`
- `docs/02_architecture/c4_context.md`
- `docs/02_architecture/c4_container.md`
- `docs/02_architecture/quality_attributes.md`
- `docs/02_architecture/adr/0001-use-vue-vite-typescript.md`
- `docs/02_architecture/adr/0002-use-nestjs-backend.md`
- `docs/02_architecture/adr/0003-use-postgresql-prisma.md`
- `docs/02_architecture/adr/0004-use-s3-compatible-object-storage.md`
- `docs/02_architecture/adr/0005-use-private-bucket-and-signed-urls.md`
- `docs/02_architecture/adr/0006-use-monorepo-structure.md`
- `docs/02_architecture/adr/0007-soft-delete-and-object-purge-strategy.md`
- `docs/02_architecture/adr/0008-denormalized-storage-usage-counter.md`
- `docs/02_architecture/adr/0009-secure-file-type-validation-and-content-disposition.md`
- `docs/02_architecture/adr/0010-multipart-upload-for-large-files.md`
- `docs/03_design/data_model.md`
- `docs/03_design/api.md`
- `docs/03_design/error_handling.md`
- `docs/07_ai/ai_manifest.md`
- `docs/07_ai/prompt_log.md`
- `docs/07_ai/verification_log.md`

### 16.2 Később részletesítendő dokumentumok

- `docs/04_quality/test_strategy.md`
- `docs/04_quality/test_report.md`
- `docs/05_security_ops/threat_model.md`
- `docs/05_security_ops/privacy_licensing.md`
- `docs/05_security_ops/deploy_runbook.md`
- `docs/05_security_ops/runbook.md`
- `docs/05_security_ops/observability.md`
- `docs/06_release/demo_script.md`
- `docs/06_release/release_notes.md`
- `docs/06_release/self_assessment.md`

---

## 17. ADR terv

Minimum 5 ADR szükséges. Kezdeti ADR-ek:

1. **ADR-0001: Vue 3 + Vite + TypeScript használata frontendhez**
   - Alternatívák: React, Angular, Svelte.
   - Döntési szempont: egyszerűség, fejlesztési sebesség, TypeScript támogatás.

2. **ADR-0002: NestJS használata backendhez**
   - Alternatívák: Express, Fastify, Koa.
   - Döntési szempont: modularitás, tesztelhetőség, dokumentálhatóság.

3. **ADR-0003: PostgreSQL + Prisma használata metaadat-tároláshoz**
   - Alternatívák: MongoDB, SQLite, MySQL.
   - Döntési szempont: relációs adatok, migráció, típusbiztonság.

4. **ADR-0004: S3-kompatibilis object storage használata fájlokhoz**
   - Alternatívák: lokális fájlrendszer, adatbázisban tárolt blob, cloud provider specifikus SDK.
   - Döntési szempont: skálázhatóság, cloud portability, szakdolgozati téma illeszkedése.

5. **ADR-0005: Privát bucket és rövid életű signed URL-ek**
   - Alternatívák: public bucket, backend proxy stream, közvetlen frontend credential.
   - Döntési szempont: security, jogosultságkezelés, felhasználói adatvédelem.

6. **ADR-0006: Monorepo struktúra frontend/backend/docs felosztással**
   - Alternatívák: külön frontend és backend repo.
   - Döntési szempont: leadandó csomag egyszerűsége, reprodukálhatóság.

7. **ADR-0007: Soft delete és object purge stratégia**
   - Alternatívák: azonnali S3 törlés, csak DB soft delete, S3 lifecycle policy, alkalmazásoldali cron job.
   - Döntési szempont: visszaállíthatóság, storage költség, adatkonzisztencia, szakdolgozati bizonyíthatóság.

8. **ADR-0008: Denormalizált storage usage számláló**
   - Alternatívák: minden lekérésnél SQL `SUM(sizeBytes)`, `User.usedStorageBytes`, külön `StorageUsage` tábla, DB trigger.
   - Döntési szempont: teljesítmény, egyszerűség, tesztelhetőség.

9. **ADR-0009: Biztonságos fájltípus-validáció és Content-Disposition kezelés**
   - Alternatívák: csak frontend validáció, kiterjesztés alapú validáció, magic number validáció, vírusellenőrzés.
   - Döntési szempont: Stored XSS kockázat, hibás MIME típusok, biztonságos preview/download.

10. **ADR-0010: Multipart Upload nagy fájlokra**
   - Alternatívák: sima presigned PUT, backend proxy upload, multipart upload.
   - Döntési szempont: nagy videók, instabil hálózat, complexity vs. product-quality érték.
   - Státusz: kezdetben Proposed/Későbbi fázis.

---

## 18. Tesztelési terv

### 18.1 Első fázis

Az első fejlesztési fázisban csak unit tesztek készülnek.

Indoklás:

- Gyorsabb visszacsatolást adnak.
- Jó alapot adnak az AI által generált core logika ellenőrzésére.
- Nem igényelnek valódi MinIO/PostgreSQL integrációt minden esetben.
- A CI/CD és integration/e2e tesztek későbbi fázisban kerülnek bevezetésre.

### 18.2 Unit tesztelendő területek

Backend unit tesztek:

- fájltípus validáció,
- magic number alapú file signature validáció,
- fájlméret validáció,
- storage key generálás,
- kvóta számítás,
- `usedStorageBytes` növelés/csökkentés logikája,
- soft delete és purge eligibility logika,
- `Content-Disposition` döntési logika,
- megosztási link lejárat ellenőrzése,
- jogosultsági döntések,
- error mapping,
- usage számítás,
- upload state transition logika.

Frontend unit tesztek:

- form validáció,
- fájlméret megjelenítés,
- usage progress számítás,
- error message mapping,
- komponensek alap renderelése,
- üres állapot kezelése.

### 18.3 Későbbi tesztfázisok

Később hozzáadandó:

- integrációs tesztek PostgreSQL + Prisma ellen,
- integrációs tesztek MinIO/S3 adapter ellen,
- API contract tesztek,
- e2e tesztek Playwrighttal,
- CI quality gates.

Fontos: a végleges szakdolgozati leadáshoz a tesztelést bővíteni kell, mert az első fázisban csak unit tesztek lesznek. A dokumentációban ezt őszintén rögzíteni kell a teszt stratégiában és a teszt riportban.

---

## 19. Security és privacy alapelvek

Már az első fázisban figyelni kell a következőkre:

- Secret nem kerülhet a repo-ba.
- Minden credential `.env` fájlból vagy később secrets store-ból érkezzen.
- Legyen `.env.example`.
- Jelszó csak hash-elve tárolható.
- A bucket privát legyen.
- A frontend ne kapjon cloud access keyt.
- A backend ellenőrizze a fájl tulajdonosát.
- A megosztási linkek legyenek időkorlátosak.
- A fájlok típusa backend oldalon magic number alapján is legyen ellenőrizve.
- A storage key ne az eredeti fájlnévből készüljön.
- A fájlnevek UI megjelenítésnél escape-elve legyenek.
- Preview/download esetén a `Content-Type` és `Content-Disposition` kezelés tudatos legyen.
- A soft delete alatt álló fájlok purge folyamata naplózott és újrapróbálható legyen.
- A logok ne tartalmazzanak jelszót, tokent, fájltartalmat.
- Hiba esetén a kliens ne kapjon stack trace-t.
- A privacy dokumentációban le kell írni, milyen adatokat tárol a rendszer.

---

## 20. Lokális fejlesztői környezet

A cél, hogy a projekt lokálisan, lehetőleg 15 percen belül elindítható legyen.

### 20.1 Szükséges komponensek

- Node.js LTS
- npm
- Docker Desktop
- PostgreSQL konténer
- MinIO konténer
- Frontend dev server
- Backend dev server

### 20.2 Docker Compose komponensek

Első körben:

- `postgres`
- `minio`
- `minio-init` vagy manuális bucket létrehozás dokumentálva

Opcionálisan később:

- backend konténer,
- frontend konténer,
- nginx reverse proxy.

### 20.3 Lokális bucket

Javasolt bucket név:

```text
cloud-storage-local
```

A lokális MinIO credential csak fejlesztői célú legyen, és `.env.example`-ben placeholderként szerepeljen.

---

## 21. AI-használati terv

A projekt AI-first módon készül, de minden AI kimenetet ellenőrizni kell.

### 21.1 AI felhasználási területek

- scope és MVP tervezés,
- ADR alternatívák gyűjtése,
- API vázlat generálása,
- adatmodell javaslat,
- unit tesztek generálása,
- hibakeresés,
- dokumentáció első vázlatai,
- code review szempontok generálása,
- magic number validáció és XSS-védelem ellenőrzési tervének kidolgozása,
- soft delete/purge stratégia kockázatainak elemzése,
- storage usage számláló alternatíváinak összehasonlítása,
- multipart upload ADR alternatíváinak elemzése.

### 21.2 Kötelező AI dokumentumok

- `docs/07_ai/ai_manifest.md`
- `docs/07_ai/prompt_log.md`
- `docs/07_ai/verification_log.md`

### 21.3 AI-használati szabályok

- Ne kerüljön promptba secret, token, jelszó vagy valós személyes adat.
- AI által generált kódot kézzel review-zni kell.
- AI által javasolt security/performance állítást teszttel, forrással vagy PoC-val kell ellenőrizni.
- Ha az AI hibázik, azt nem elrejteni kell, hanem rögzíteni a verification logban.
- A dokumentáció csak olyat állítson, ami ténylegesen implementálva vagy tervezettként jelölve van.

---

## 22. DevOps és CI/CD helye a tervben

A CI/CD és DevOps témák nem az első fejlesztési lépés részei.

Későbbi fázisban viszont szükséges lesz:

- build parancsok dokumentálása,
- teszt futtatás dokumentálása,
- GitHub Actions vagy más CI bevezetése,
- lint/typecheck/test quality gate,
- deploy runbook,
- healthcheck,
- logolás,
- observability dokumentáció.

Az első fázisban elegendő úgy tervezni a struktúrát, hogy ezek később könnyen beilleszthetők legyenek.

---

## 23. Fejlesztési mérföldkövek

### Mérföldkő 0: Tervezés és repo előkészítés

Cél:

- végleges high-level plan,
- AGENTS.md,
- README első verzió,
- docs struktúra,
- első ADR-ek vázlata.

Eredmény:

- üres, de jól strukturált repo,
- dokumentált scope,
- döntési alapok.

### Mérföldkő 1: Lokális infrastruktúra

Cél:

- PostgreSQL és MinIO indítása Docker Compose-szal,
- `.env.example`,
- backend alap konfiguráció,
- frontend alap indítás.

Eredmény:

- lokális fejlesztői környezet,
- healthcheck alap.

### Mérföldkő 2: Auth és user kezelés

Cél:

- regisztráció,
- login,
- saját user lekérése,
- auth guard,
- password hashing.

Eredmény:

- protected backend API alap,
- frontend login/register flow.

### Mérföldkő 3: Fájlfeltöltés és metaadat-kezelés

Cél:

- fájl validáció,
- magic number alapú fájltípus-ellenőrzés,
- storage key generálás,
- MinIO upload,
- FileObject mentés PostgreSQL-be,
- `usedStorageBytes` frissítése tranzakcióban,
- fájllista lekérése.

Eredmény:

- felhasználó tud saját fájlt feltölteni és listázni,
- a rendszer nem csak frontend/kiterjesztés alapján bízik a fájltípusban,
- a dashboard usage gyorsan lekérdezhető.

### Mérföldkő 4: Galéria, preview és letöltés

Cél:

- képek/videók megjelenítése,
- signed view/download URL,
- üres állapot,
- alap UI csiszolás.

Eredmény:

- használható média galéria.

### Mérföldkő 5: Usage, sharing és lifecycle

Cél:

- tárhelyhasználat megjelenítése denormalizált számláló alapján,
- usage progress UI,
- időkorlátos megosztási link,
- lejárt link kezelése,
- soft delete bevezetése,
- purge stratégia dokumentálása,
- NestJS scheduled purge job előkészítése vagy első implementációja.

Eredmény:

- termékszerű működés, nem csak upload demo,
- a törölt fájlok nem válnak hosszú távon árván maradt S3 objektummá.

### Mérföldkő 6: Dokumentáció és minőség

Cél:

- docs frissítése,
- unit teszt bővítés,
- test report,
- AI manifest/prompt log/verification log töltése,
- security/privacy első verzió.

Eredmény:

- szakdolgozati leadandó irányába rendezett repo.

### Mérföldkő 7: Későbbi DevOps és tesztbővítés

Cél:

- CI/CD,
- integration tesztek,
- e2e tesztek,
- deploy runbook,
- observability,
- cloud provider integráció.

Eredmény:

- release-ready szakdolgozati projekt.

---

## 24. Kockázatok és mitigációk

| Kockázat | Hatás | Mitigáció |
|---|---|---|
| Túl nagy scope | Nem készül el időben | MVP 3-6 user story köré szűkítése |
| S3/MinIO integráció bonyolultsága | Feltöltés/preview elakad | Storage adapter, először lokális MinIO |
| Presigned URL CORS problémák | Frontend upload nem működik | ADR-ben fallback: backend proxy upload |
| Auth hibák | Security probléma | Backend guardok, unit tesztek, threat model |
| Adatmodell túl korai túlbonyolítása | Lassú fejlesztés | Kezdetben egyszerű User/FileObject/ShareLink |
| AI hibás kódot generál | Rejtett bug | Unit teszt, code review, verification log |
| CI/CD későre marad | Leadási kockázat | Későbbi mérföldkőként előre tervezve |
| Nincs elég evidence | Értékelési veszteség | Screenshotok, test logok, dokumentáció linkek |
| Árván maradt S3/MinIO objektumok | Tárhelypazarlás, inkonzisztens állapot | Soft delete + purge job + lifecycle policy terv |
| Dashboard usage lassú sok fájlnál | Rossz UX, felesleges DB terhelés | Denormalizált `usedStorageBytes` számláló |
| Manipulált MIME típus vagy fájlnév | Stored XSS / hibás preview | Magic number validáció, allowlist, `Content-Disposition` |
| Nagy videófájl feltöltése megszakad | Rossz felhasználói élmény | MVP méretlimit, később multipart upload |

---

## 25. Definition of Done az első MVP-re

Az MVP akkor tekinthető késznek, ha:

- a rendszer lokálisan elindítható README alapján,
- a frontend és backend fut,
- PostgreSQL és MinIO lokálisan működik,
- user tud regisztrálni és bejelentkezni,
- user tud fájlt feltölteni,
- a backend magic number alapján is validálja a fájltípust,
- user látja a saját fájljait,
- user meg tud nyitni képet/videót biztonságos signed URL-lel és megfelelő header-kezeléssel,
- user látja a tárhelyhasználatát denormalizált számláló alapján,
- user tud időkorlátos megosztási linket létrehozni,
- user tud fájlt soft delete-tel törölni,
- a végleges törlés/purge stratégia dokumentált, és legalább részben implementált vagy explicit későbbi feladatként jelölt,
- legalább a core logikákra vannak unit tesztek,
- `.env.example` elkészült,
- nincs secret a repo-ban,
- legalább 5 ADR elkészült, javasoltan 8-10 ADR a storage lifecycle, usage, fájlvalidáció és multipart upload döntésekkel együtt,
- AI manifest, prompt log és verification log első verziója elkészült,
- a dokumentáció nem állít olyat, ami nincs implementálva vagy nincs tervként jelölve.

---

## 26. Következő lépések

A high-level plan után a következő dokumentumok elkészítése javasolt:

1. `AGENTS.md`
2. `README.md` első verzió
3. `docs/00_index.md`
4. `docs/01_product/vision.md`
5. `docs/01_product/scope_contract.md`
6. `docs/02_architecture/adr/0001-use-vue-vite-typescript.md`
7. `docs/02_architecture/adr/0002-use-nestjs-backend.md`
8. `docs/02_architecture/adr/0003-use-postgresql-prisma.md`
9. `docs/02_architecture/adr/0004-use-s3-compatible-object-storage.md`
10. `docs/02_architecture/adr/0005-use-private-bucket-and-signed-urls.md`
11. `docs/02_architecture/adr/0007-soft-delete-and-object-purge-strategy.md`
12. `docs/02_architecture/adr/0008-denormalized-storage-usage-counter.md`
13. `docs/02_architecture/adr/0009-secure-file-type-validation-and-content-disposition.md`
14. `docs/02_architecture/adr/0010-multipart-upload-for-large-files.md`

Ezután érdemes Codexben létrehozatni a repo skeleton-t, de nem azonnali teljes implementációval, hanem lépésenként:

1. mappastruktúra,
2. alap package setup,
3. Docker Compose PostgreSQL + MinIO,
4. backend skeleton,
5. frontend skeleton,
6. első unit tesztek,
7. dokumentációs fájlok.
