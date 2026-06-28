# milestones.md

# Mérföldkövek – Adattárolás a felhőben

## 0. Cél és szemlélet

Ez a dokumentum a szakdolgozati projekt mérföldköveit és azok részfeladatait bontja le.

A projekt címe: **Adattárolás a felhőben**.

A cél egy termékminőségű, AI-asszisztáltan fejlesztett webalkalmazás elkészítése, ahol a felhasználók képeket és videókat tudnak feltölteni, megtekinteni, kezelni, megosztani, valamint követni tudják a saját tárhelyhasználatukat.

A végleges technológiai döntések:

- **Frontend:** Vue 3 + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + TypeScript + NestJS
- **Adatbázis:** PostgreSQL + Prisma
- **Lokális objektumtároló:** MinIO
- **Éles vagy későbbi felhő storage:** AWS S3 vagy OCI Object Storage S3-kompatibilis API-val
- **Tesztelés első körben:** unit tesztek
- **Későbbi tesztelés:** integration, contract, e2e tesztek
- **CI/CD és DevOps:** későbbi fázisban készül

A mérföldkövek úgy vannak kialakítva, hogy illeszkedjenek a szakdolgozói leadandó csomag elvárásaihoz: egy repo, dokumentáció a repo-ban, bizonyíték-alapú fejlesztés, ADR-ek, tesztek, biztonság, AI-használat dokumentálása.

---

## 1. Mérföldkő: Projektindítás és repo-alapok

### Cél

A projekt alapstruktúrájának létrehozása úgy, hogy a további fejlesztés már rendezett repo-ban történjen.

### Feladatok

- [x] Git repo inicializálása.
- [x] Alap `README.md` létrehozása.
- [x] `plan.md` vagy `docs/00_index.md` létrehozása a projekt céljával.
- [x] Alap `docs/` struktúra létrehozása.
- [x] `frontend/` és `backend/` mappák előkészítése.
- [x] `.gitignore` létrehozása Node.js, env fájlok, build outputok és IDE fájlok kizárásával.
- [x] `.env.example` fájl előkészítése.
- [x] `AGENTS.md` létrehozása Codex számára.
- [x] Első AI dokumentációs fájlok létrehozása:
  - `docs/07_ai/ai_manifest.md`
  - `docs/07_ai/prompt_log.md`
  - `docs/07_ai/verification_log.md`

### Dokumentációs output

- [x] `README.md`
- [x] `AGENTS.md`
- [x] `docs/00_index.md`
- [x] `docs/07_ai/ai_manifest.md`
- [x] `docs/07_ai/prompt_log.md`
- [x] `docs/07_ai/verification_log.md`

### Definition of Done

- [x] A repo struktúrája áttekinthető.
- [x] A dokumentációs mappák megvannak.
- [x] A secret fájlok nem kerülhetnek commitba.
- [x] A projekt célja röviden le van írva.
- [x] Codex számára van projekt-specifikus `AGENTS.md`.

### Evidence

- Repo-struktúra ellenőrzése: `rg --files --hidden -g '!.git/**'`.
- README kódolás ellenőrzése: `file README.md` és `xxd -g 1 -l 8 README.md`; a fájl UTF-8, nincs UTF-16 BOM.
- Secret hygiene ellenőrzése: `.gitignore` tiltja a `.env`, `.env.local`, `node_modules/`, `dist/`, `.vscode/` mintákat, miközben a `.env.example` trackelhető.
- AI és verifikációs bizonyíték: `docs/07_ai/verification_log.md`.

---

## 2. Mérföldkő: Termékvízió, scope és MVP meghatározása

### Cél

A projekt pontosítása: mit építünk, kinek, milyen problémára, és mi számít kész MVP-nek.

### Javasolt termékirány

A rendszer egy személyes cloud media storage alkalmazás, ahol a felhasználó saját képeket és videókat tud feltölteni, kezelni, megtekinteni és megosztani. A rendszer nem csak fájlfeltöltést mutat be, hanem termékminőségű storage-kezelést is: jogosultság, tárhelyhasználat, soft delete, biztonságos fájltípus-validáció, hibakezelés.

### MVP javaslat

Az MVP célja egy minimálisan működő, de szakdolgozati szempontból jól értékelhető rendszer.

#### MVP funkciók

- [ ] Felhasználó regisztráció.
- [ ] Felhasználó bejelentkezés.
- [ ] Védett frontend felület.
- [ ] Kép vagy videó feltöltése MinIO-ba backend által generált presigned URL-lel.
- [ ] Egy fájl legfeljebb 100 MB lehet az MVP-ben.
- [ ] Fájl metaadatainak mentése PostgreSQL adatbázisba.
- [ ] Saját fájlok listázása.
- [ ] Kép/videó előnézet vagy megtekintés.
- [ ] Fájl letöltése.
- [ ] Fájl soft delete állapotba helyezése.
- [ ] Törölt fájl egyedi visszaállítása a 30 napos megőrzési időn belül.
- [ ] Tárhelyhasználat megjelenítése dashboardon.
- [ ] Alap időkorlátos megosztási link létrehozása és érvényességének ellenőrzése.
- [ ] Alap validáció: fájlméret, MIME type, magic number.
- [ ] Egységes backend hibamodell.

#### MVP-n kívüli, későbbi funkciók

- [ ] Multipart upload nagy videókhoz.
- [ ] Megosztási link visszavonása, hozzáférésszám-korlátja és fejlett kezelése.
- [ ] Admin felület.
- [ ] Teljes CI/CD pipeline.
- [ ] Integration és e2e tesztek.
- [ ] Cloud deployment AWS-re vagy OCI-ra.
- [ ] Képfeldolgozás, thumbnail generálás.
- [ ] Videó transzkódolás.
- [ ] Teljes monitoring dashboard.

### Dokumentációs output

- [x] `docs/01_product/vision.md`
- [x] `docs/01_product/scope_contract.md`
- [x] `docs/01_product/capability_map.md`
- [x] `docs/01_product/metrics.md`
- [x] `docs/01_product/ux_flows.md`

### Definition of Done

- [x] Van 1-2 persona.
- [x] Van 3-6 MVP user story.
- [x] Minden MVP story-hoz van acceptance criteria.
- [x] Van non-goals lista.
- [x] Van legalább 6 capability, ebből legalább 3 value és 3 productization.
- [x] A scope nem túl nagy, később is bővíthető.

---

## 3. Mérföldkő: Architektúra és fő technológiai döntések

### Cél

A rendszer technikai felépítésének megtervezése és az első ADR-ek elkészítése.

### Fő architekturális irány

A frontend nem közvetlenül fér hozzá az S3/MinIO storage-hoz. A backend kezeli a jogosultságot, a fájl metaadatokat, a presigned URL-ek generálását, a validációt, a soft delete állapotokat és a tárhelyhasználatot.

A bináris tartalom MinIO/S3-ban él, az alkalmazási metaadatok PostgreSQL-ben.

### Fő komponensek

- Frontend SPA
- Backend API
- PostgreSQL adatbázis
- Prisma ORM
- MinIO objektumtároló
- S3-kompatibilis storage adapter
- Auth modul
- File metadata modul
- Storage usage modul
- Soft delete / purge modul
- Sharing modul
- Unit test környezet

### ADR-ek

Elkészült ADR-ek:

- [x] `ADR-001`: Vue 3 + Vite + TypeScript választása frontendhez.
- [x] `ADR-002`: NestJS választása backendhez.
- [x] `ADR-003`: PostgreSQL + Prisma választása metaadat-tárolásra.
- [x] `ADR-004`: S3-kompatibilis object storage és lokális MinIO használata.
- [x] `ADR-005`: Backend által kontrollált presigned URL upload/download folyamat.
- [x] `ADR-006`: Soft delete + késleltetett purge stratégia.
- [x] `ADR-007`: Denormalizált `usedStorageBytes` mező a felhasználói tárhelyhasználathoz.
- [x] `ADR-008`: Magic number alapú fájltípus-validáció.
- [x] `ADR-009`: Multipart upload későbbi fázisra halasztása.

### Dokumentációs output

- [x] `docs/02_architecture/c4_context.md`
- [x] `docs/02_architecture/c4_container.md`
- [x] `docs/02_architecture/c4_component.md`
- [x] `docs/02_architecture/quality_attributes.md`
- [x] `docs/02_architecture/adr/*.md`

### Definition of Done

- [x] Van C4 Context diagram.
- [x] Van C4 Container diagram.
- [x] Legalább 5 ADR elkészült.
- [x] Az ADR-ek tartalmaznak alternatívákat és következményeket.
- [x] Minden fontos döntéshez van rövid verification terv.

### Evidence

- C4 és quality dokumentumok: `docs/02_architecture/c4_context.md`, `docs/02_architecture/c4_container.md`, `docs/02_architecture/c4_component.md`, `docs/02_architecture/quality_attributes.md`.
- ADR lista és linkek: `docs/02_architecture/adr/README.md`.
- Markdown link sanity check: scriptelt relatív link ellenőrzés a README és docs Markdown fájlokra.
- Formázási sanity check: `git diff --check`.
- Koncentrált konzisztencia-ellenőrzés: nincs runtime appként megfogalmazott állítás; a dokumentumok a 3. mérföldkő dokumentációs hatókörében maradnak.

---

## 4. Mérföldkő: Lokális fejlesztői környezet

### Cél

A rendszer lokálisan, Docker Compose segítségével reprodukálhatóan indítható legyen.

### Feladatok

- [ ] `docker-compose.yml` létrehozása PostgreSQL-hez.
- [ ] MinIO service hozzáadása `docker-compose.yml`-hez.
- [ ] MinIO bucket inicializálás megtervezése.
- [ ] Backend `.env.example` létrehozása.
- [ ] Frontend `.env.example` létrehozása.
- [ ] Backend health endpoint megtervezése.
- [ ] README Quickstart vázlat elkészítése.
- [ ] Lokális portok rögzítése:
  - frontend
  - backend
  - PostgreSQL
  - MinIO API
  - MinIO Console

### Ajánlott lokális service-ek

- PostgreSQL
- MinIO
- Backend NestJS dev server
- Frontend Vite dev server

### Dokumentációs output

- [ ] `README.md` Quickstart rész
- [ ] `docs/05_security_ops/deploy_runbook.md` lokális futtatási rész
- [ ] `.env.example`

### Definition of Done

- [ ] A lokális infrastruktúra egy paranccsal indítható.
- [ ] A backend látja a PostgreSQL-t.
- [ ] A backend látja a MinIO-t.
- [ ] A README alapján egy másik fejlesztő el tudja indítani a rendszert.
- [ ] Nincs valódi secret a repo-ban.

---

## 5. Mérföldkő: Backend alapok és adatmodell

### Cél

A backend alapjainak és az adatmodellnek a kialakítása.

### Javasolt entitások

#### User

- `id`
- `email`
- `passwordHash`
- `displayName`
- `usedStorageBytes`
- `storageLimitBytes`
- `createdAt`
- `updatedAt`

#### FileObject

- `id`
- `ownerId`
- `originalName`
- `storageKey`
- `mimeType`
- `detectedMimeType`
- `sizeBytes`
- `checksum`
- `visibility`
- `status`
- `deletedAt`
- `purgeAfter`
- `createdAt`
- `updatedAt`

#### ShareLink

- `id`
- `fileObjectId`
- `createdByUserId`
- `tokenHash`
- `expiresAt`
- `maxAccessCount`
- `accessCount`
- `revokedAt`
- `createdAt`

#### AuditEvent

- `id`
- `actorUserId`
- `action`
- `resourceType`
- `resourceId`
- `metadata`
- `createdAt`

### Feladatok

- [ ] NestJS projekt inicializálása.
- [ ] Prisma integrálása.
- [ ] PostgreSQL kapcsolat beállítása.
- [ ] Prisma schema létrehozása.
- [ ] Első migration elkészítése.
- [ ] Alap modulok létrehozása:
  - `auth`
  - `users`
  - `files`
  - `storage`
  - `sharing`
  - `audit`
- [ ] Egységes error response formátum megtervezése.
- [ ] Unit test setup létrehozása backendhez.

### Dokumentációs output

- [ ] `docs/03_design/data_model.md`
- [ ] `docs/03_design/error_handling.md`
- [ ] `docs/04_quality/test_strategy.md`

### Definition of Done

- [ ] Prisma migration fut.
- [ ] Az adatmodell dokumentált.
- [ ] A backend projekt buildelhető.
- [ ] Van alap unit test setup.
- [ ] Nincs hardcoded secret.

---

## 6. Mérföldkő: Felhasználókezelés és autentikáció

### Cél

A rendszerben legyen regisztráció, bejelentkezés és védett API hozzáférés.

### Feladatok

- [ ] Regisztráció endpoint.
- [ ] Login endpoint.
- [ ] Jelszó hash-elés.
- [ ] JWT vagy session alapú auth döntés véglegesítése ADR alapján.
- [ ] Auth guard létrehozása NestJS-ben.
- [ ] Aktuális felhasználó lekérése.
- [ ] Frontend login oldal.
- [ ] Frontend regisztráció oldal.
- [ ] Frontend protected route kezelés.
- [ ] Logout működés.
- [ ] Auth hibák egységes kezelése.

### Unit teszt fókusz

- [ ] Jelszó hash és ellenőrzés.
- [ ] Regisztráció validáció.
- [ ] Duplikált email kezelése.
- [ ] Login hibás jelszóval.
- [ ] Token generálás logikája.
- [ ] Auth guard alaplogika.

### Dokumentációs output

- [ ] `docs/03_design/api.md` auth endpointokkal
- [ ] `docs/05_security_ops/threat_model.md` auth fenyegetésekkel
- [ ] `docs/04_quality/test_report.md` első unit teszt eredményekkel

### Definition of Done

- [ ] A felhasználó tud regisztrálni.
- [ ] A felhasználó tud bejelentkezni.
- [ ] Védett endpointot csak bejelentkezve lehet hívni.
- [ ] Az auth logika unit tesztekkel védett.
- [ ] A frontend képes kezelni a bejelentkezett állapotot.

---

## 7. Mérföldkő: Fájl feltöltés MinIO-ba

### Cél

A felhasználó tudjon képet vagy videót feltölteni, a fájl pedig MinIO-ban tárolódjon, a metaadatok PostgreSQL-ben legyenek.

### Javasolt feltöltési folyamat

1. Frontend elküldi a backendnek a feltöltendő fájl alapadatait.
2. Backend validálja:
   - fájlnév
   - fájlméret
   - MIME type
   - engedélyezett típus
   - felhasználói tárhelylimit
3. Backend létrehoz egy előzetes FileObject rekordot.
4. Backend presigned upload URL-t generál MinIO-hoz.
5. Frontend feltölti a fájlt MinIO-ba.
6. Frontend vagy backend confirm lépésben véglegesíti a feltöltést.
7. Backend frissíti a FileObject státuszát.
8. Backend frissíti a User `usedStorageBytes` mezőjét.

### Feladatok

- [ ] Storage adapter létrehozása S3-kompatibilis API-hoz.
- [ ] MinIO kapcsolat beállítása.
- [ ] Presigned upload URL generálása.
- [ ] FileObject létrehozás.
- [ ] Feltöltés megerősítése.
- [ ] Tárhelylimit ellenőrzés.
- [ ] `usedStorageBytes` frissítése sikeres feltöltés után.
- [ ] Sikertelen vagy félbehagyott feltöltés kezelése.
- [ ] Frontend upload komponens.
- [ ] Upload progress kijelzés alap szinten.

### Unit teszt fókusz

- [ ] Tárhelylimit számítás.
- [ ] Fájlméret validáció.
- [ ] MIME type validáció.
- [ ] FileObject státusz átmenetek.
- [ ] Storage key generálás.
- [ ] `usedStorageBytes` növelése.

### Dokumentációs output

- [ ] `docs/03_design/api.md` file upload endpointokkal
- [ ] `docs/03_design/data_model.md` FileObject státuszokkal
- [ ] `docs/02_architecture/adr/ADR-005-backend-controlled-presigned-flow.md`

### Definition of Done

- [ ] A felhasználó tud fájlt feltölteni.
- [ ] A fájl MinIO-ban megjelenik.
- [ ] A metaadat PostgreSQL-ben megjelenik.
- [ ] A tárhelyhasználat növekszik.
- [ ] Hibás fájltípus vagy túl nagy fájl visszautasításra kerül.

---

## 8. Mérföldkő: Fájlok listázása, megtekintése és letöltése

### Cél

A felhasználó lássa a saját feltöltött fájljait, és biztonságosan meg tudja tekinteni vagy letölteni őket.

### Feladatok

- [ ] Saját fájlok listázása.
- [ ] Fájl részleteinek lekérése.
- [ ] Presigned read URL generálása.
- [ ] Kép előnézet megjelenítése frontendben.
- [ ] Videó lejátszás alap támogatása frontendben.
- [ ] Letöltés indítása.
- [ ] Fájlok szűrése típus alapján.
- [ ] Üres állapot kezelése.
- [ ] Hibás vagy törölt fájl kezelése.

### Biztonsági szempontok

- [ ] A felhasználó csak saját fájljaihoz férhet hozzá.
- [ ] A presigned URL rövid lejáratú legyen.
- [ ] A backend kényszerítse ki a megfelelő `Content-Disposition` viselkedést.
- [ ] A rendszer ne szolgáljon ki veszélyes fájlt inline módon.

### Unit teszt fókusz

- [ ] Csak saját fájl listázása.
- [ ] Más felhasználó fájljának tiltása.
- [ ] Törölt fájl kizárása.
- [ ] Presigned read URL paraméterezése.
- [ ] Content-Disposition döntési logika.

### Dokumentációs output

- [ ] `docs/01_product/ux_flows.md` megtekintési flow-val
- [ ] `docs/03_design/api.md` listázó és letöltő endpointokkal
- [ ] `docs/05_security_ops/threat_model.md` jogosultsági fenyegetésekkel

### Definition of Done

- [ ] A felhasználó látja a saját fájljait.
- [ ] A kép előnézet működik.
- [ ] A videó megtekintés alap szinten működik.
- [ ] A letöltés működik.
- [ ] Más felhasználó fájlja nem elérhető.

---

## 9. Mérföldkő: Fájltípus-validáció és Stored XSS védelem

### Cél

A rendszer ne bízzon vakon a frontend által küldött MIME type-ban vagy a fájlkiterjesztésben.

### Probléma

Egy támadó feltölthet például HTML vagy script tartalmat úgy, hogy a fájlt képnek nevezi el. Ha a rendszer ezt rosszul szolgálja ki, Stored XSS vagy tartalom-szivárgási probléma keletkezhet.

### Megoldási irány

- Magic number alapú fájltípus-ellenőrzés.
- Backend oldali whitelist.
- Biztonságos fájlnév-kezelés.
- Különbség az `originalName`, `mimeType` és `detectedMimeType` között.
- `Content-Disposition` tudatos használata.
- HTML, SVG és egyéb kockázatos típusok tiltása vagy attachment módban kezelése.

### Feladatok

- [ ] `file-type` vagy hasonló könyvtár bevezetése.
- [ ] Feltöltés utáni vagy confirm előtti fájltípus-validáció.
- [ ] Engedélyezett MIME type lista.
- [ ] Kockázatos típusok tiltása.
- [ ] Fájlnév normalizálás.
- [ ] Error handling veszélyes fájl esetén.
- [ ] Security dokumentáció frissítése.

### Unit teszt fókusz

- [ ] Valódi PNG elfogadása.
- [ ] Valódi JPEG elfogadása.
- [ ] Valódi MP4 elfogadása, ha támogatott.
- [ ] Átnevezett HTML visszautasítása.
- [ ] Hibás MIME type visszautasítása.
- [ ] SVG tiltása vagy biztonságos kezelése.

### Dokumentációs output

- [ ] `docs/05_security_ops/threat_model.md`
- [ ] `docs/05_security_ops/privacy_licensing.md`
- [ ] `docs/02_architecture/adr/ADR-008-magic-number-validation.md`
- [ ] `docs/07_ai/verification_log.md` biztonsági verifikációval

### Definition of Done

- [ ] A backend nem csak kiterjesztés alapján validál.
- [ ] A veszélyes tartalmak visszautasításra kerülnek.
- [ ] A validáció unit tesztekkel védett.
- [ ] A döntés ADR-ben dokumentált.
- [ ] Legalább egy security verifikáció bekerül a verification logba.

---

## 10. Mérföldkő: Tárhelyhasználat és dashboard

### Cél

A felhasználó lássa, mennyi tárhelyet használ, és a rendszer hatékonyan tudja ezt lekérdezni.

### Probléma

Az egyszerű `SUM(sizeBytes)` lekérdezés MVP-ben működhet, de nagyobb fájlszámnál rosszabbul skálázódik.

### Megoldási irány

A `User` táblában legyen `usedStorageBytes` mező. A backend sikeres feltöltés után növeli, végleges purge után csökkenti. A soft delete és a visszaállítás nem módosítja, mert a bináris objektum közben végig foglalja a tárhelyet.

### Feladatok

- [ ] `usedStorageBytes` mező implementálása.
- [ ] Storage limit mező implementálása.
- [ ] Feltöltés előtt limit ellenőrzés.
- [ ] Feltöltés után számláló növelése.
- [ ] Soft delete esetén döntés: a tárhely továbbra is foglaltnak számít-e.
- [ ] Purge esetén számláló csökkentése.
- [ ] Dashboard API endpoint.
- [ ] Frontend dashboard kártya.
- [ ] Egyszerű progress bar vagy százalékos kijelzés.

### Javasolt döntés

A soft delete állapotú fájl továbbra is foglalja a felhasználó tárhelyét, mert fizikailag még létezik az objektumtárolóban. A tárhely csak végleges purge után csökken.

### Unit teszt fókusz

- [ ] Feltöltés után nő a `usedStorageBytes`.
- [ ] Sikertelen feltöltés után nem nő.
- [ ] Soft delete után nem csökken, ha a fájl még visszaállítható.
- [ ] Purge után csökken.
- [ ] Limit feletti upload visszautasításra kerül.

### Dokumentációs output

- [ ] `docs/03_design/data_model.md`
- [ ] `docs/01_product/metrics.md`
- [ ] `docs/02_architecture/adr/ADR-007-denormalized-storage-usage.md`

### Definition of Done

- [ ] A dashboard mutatja a tárhelyhasználatot.
- [ ] A tárhelylimit működik.
- [ ] A számítás nem minden lekérésnél teljes aggregációra épül.
- [ ] A döntés ADR-ben dokumentált.
- [ ] A kritikus számítás unit tesztekkel védett.

---

## 11. Mérföldkő: Soft delete, visszaállítás és purge stratégia

### Cél

A felhasználó ne veszítsen azonnal végleg adatot törléskor, de az objektumtárolóban ne maradjanak örökre árván fájlok.

### Tervezett viselkedés

- Soft delete esetén a FileObject `deletedAt` mezőt kap.
- A fájl 30 napig visszaállítható.
- A soft deleted fájl nem jelenik meg az aktív fájllistában.
- Visszaállításkor a fájl újra aktív lesz.
- A 30 nap után futó purge folyamat végleg törli:
  - a MinIO/S3 objektumot
  - az adatbázis rekordot, vagy archivált állapotba helyezi
  - frissíti a `usedStorageBytes` értéket

### Feladatok

- [ ] Soft delete endpoint.
- [ ] Restore endpoint.
- [ ] Trash view vagy törölt fájlok listája.
- [ ] `purgeAfter` mező bevezetése.
- [ ] NestJS schedule modul bevezetésének megtervezése.
- [ ] Purge job implementálása későbbi fázisban.
- [ ] Purge hibakezelés: mi történik, ha DB sikeres, de S3 törlés hibázik.
- [ ] Idempotens purge logika tervezése.

### Unit teszt fókusz

- [ ] Soft delete állapot beállítása.
- [ ] Restore működése.
- [ ] Aktív listából kizárás.
- [ ] Purge kiválasztja a lejárt elemeket.
- [ ] Purge után tárhelyhasználat csökken.
- [ ] Idempotens purge viselkedés.

### Dokumentációs output

- [ ] `docs/02_architecture/adr/ADR-006-soft-delete-delayed-purge.md`
- [ ] `docs/03_design/data_model.md`
- [ ] `docs/05_security_ops/runbook.md`
- [ ] `docs/07_ai/verification_log.md`

### Definition of Done

- [ ] Soft delete működik.
- [ ] Restore működik.
- [ ] A purge stratégia dokumentált.
- [ ] Legalább a purge logika unit szinten tesztelt.
- [ ] A szakdolgozatban bemutatható, hogy az S3 árvafájl-probléma kezelve van.

---

## 12. Mérföldkő: Megosztás alapfunkció

### Cél

A felhasználó tudjon fájlt megosztani kontrollált módon.

### MVP-kompatibilis megoldás

Első körben egyszerű, időkorlátos megosztási link elegendő. A megosztási link nem közvetlen S3 link legyen hosszú távra, hanem a backend ellenőrizze a link érvényességét, majd rövid lejáratú presigned URL-t adjon.

### Feladatok

- [ ] ShareLink entitás létrehozása.
- [ ] Megosztási link generálása.
- [ ] Megosztási link lejárati idővel.
- [ ] Backend validáció link eléréskor.
- [ ] Rövid lejáratú read URL generálás.
- [ ] Frontend megosztás gomb.
- [ ] Frontend link másolás.
- [ ] Lejárt link UI hibaállapot.

### Unit teszt fókusz

- [ ] Link token generálás.
- [ ] Lejárt link visszautasítása.
- [ ] Törölt fájl megosztása tiltott.

### Dokumentációs output

- [ ] `docs/03_design/api.md`
- [ ] `docs/01_product/ux_flows.md`
- [ ] `docs/05_security_ops/threat_model.md`

### Definition of Done

- [ ] A felhasználó tud linket generálni.
- [ ] A link lejár.
- [ ] A megosztás nem kerüli meg a backend kontrollját.
- [ ] A megosztási logika unit tesztekkel védett.

Megosztási link visszavonása, hozzáférésszám-korlátja és részletes analitikája későbbi bővítés, ezért nem része ennek a mérföldkőnek a Definition of Done feltételeinek.

---

## 13. Mérföldkő: Frontend felhasználói felület

### Cél

A rendszer használható, átlátható frontend felületet kapjon.

### Fő oldalak

- [ ] Login oldal.
- [ ] Regisztráció oldal.
- [ ] Dashboard oldal.
- [ ] Fájl lista / galéria oldal.
- [ ] Fájl részletező oldal.
- [ ] Feltöltés oldal vagy modal.
- [ ] Törölt fájlok oldal egyedi visszaállítási lehetőséggel.
- [ ] Megosztási link kezelő UI.
- [ ] Alap beállítások oldal, ha belefér.

### UI komponensek

- [ ] Header / navigation.
- [ ] Auth form komponensek.
- [ ] File card.
- [ ] File grid.
- [ ] Upload component.
- [ ] Storage usage card.
- [ ] Empty state komponens.
- [ ] Error alert komponens.
- [ ] Loading state komponens.
- [ ] Confirm delete dialog.

### UX követelmények

- [ ] Egyértelmű hibaüzenetek.
- [ ] Empty state, ha nincs feltöltött fájl.
- [ ] Loading állapot hosszabb műveleteknél.
- [ ] Upload progress alap kijelzés.
- [ ] Törlés előtt megerősítés.
- [ ] Mobilon is elfogadható alap layout.

### Dokumentációs output

- [ ] `docs/01_product/ux_flows.md`
- [ ] `docs/06_release/demo_script.md`
- [ ] Screenshotok később `docs/assets/` alatt

### Definition of Done

- [ ] A fő user flow végigkattintható.
- [ ] A felület nem csak API tesztelésből áll.
- [ ] Van legalább 2-3 dokumentált UX flow.
- [ ] A fő képernyők screenshotolhatók a szakdolgozathoz.

---

## 14. Mérföldkő: Unit tesztek és első minőségi kapuk

### Cél

A core logika automata unit tesztekkel legyen védve már a korai fázisban.

### Első körös tesztfókusz

- Auth logika.
- Storage key generálás.
- File validation.
- Tárhelylimit számítás.
- `usedStorageBytes` frissítés.
- Soft delete és restore.
- Share link validáció.
- Error mapping.
- Permission check logika.

### Elvárt első körös mennyiség

A végső szakdolgozati elvárás legalább 30 automata teszt irányába mutat, de az első fázisban reális cél:

- [ ] Legalább 10-15 unit teszt a backend core logikára.
- [ ] Később legalább 18 unit jellegű teszt.
- [ ] Később integration és e2e tesztek hozzáadása.
- [ ] Később a teljes 30+ automata tesztes cél elérése.

### Feladatok

- [ ] Jest setup backendhez.
- [ ] Vitest setup frontendhez, ha frontend logikát is tesztelünk.
- [ ] Test naming convention.
- [ ] Test data builder vagy fixture struktúra.
- [ ] Coverage riport opcionális.
- [ ] Teszt riport kézi frissítése az első fázisban.

### Dokumentációs output

- [ ] `docs/04_quality/test_strategy.md`
- [ ] `docs/04_quality/test_report.md`
- [ ] `docs/07_ai/verification_log.md`

### Definition of Done

- [ ] Van futtatható unit test parancs.
- [ ] A core logika első része tesztelt.
- [ ] A teszt riport tartalmazza az utolsó futás eredményét.
- [ ] Legalább 1 AI által javasolt megoldás teszttel verifikált.

---

## 15. Mérföldkő: Security, privacy és licensing alapok

### Cél

A rendszer felelősen kezelje a felhasználói adatokat, fájlokat és titkokat.

### Feladatok

- [ ] Threat model elkészítése STRIDE-szerű bontásban.
- [ ] Legalább 6 fenyegetés azonosítása.
- [ ] Privacy dokumentum elkészítése.
- [ ] AI használat és személyes adatok kockázatának dokumentálása.
- [ ] Secret hygiene dokumentálása.
- [ ] `.env.example` ellenőrzése.
- [ ] Input validation.
- [ ] Auth és authorization ellenőrzés.
- [ ] Fájlnevek és MIME type kezelése.
- [ ] PII logolás tiltása.
- [ ] Dependency license lista alap szinten.

### Javasolt fenyegetések

- Más felhasználó fájljainak elérése.
- Hamis MIME type / malicious fájl feltöltés.
- Stored XSS fájlnév vagy fájltartalom miatt.
- Túl nagy fájl feltöltése tárhely kimerítésére.
- Lejárt vagy kiszivárgott megosztási link használata.
- API brute force login ellen.
- PII bekerülése logba.
- Secret véletlen commitolása.

### Dokumentációs output

- [ ] `docs/05_security_ops/threat_model.md`
- [ ] `docs/05_security_ops/privacy_licensing.md`
- [ ] `docs/07_ai/verification_log.md`

### Definition of Done

- [ ] Van threat model.
- [ ] Van privacy leírás.
- [ ] Nincsenek hardcoded secretek.
- [ ] Legalább 1 security jellegű unit test elkészült.
- [ ] Legalább 1 security verifikáció bekerült a verification logba.

---

## 16. Mérföldkő: AI dokumentáció és verifikáció

### Cél

Átlátható legyen, hogyan használtam AI-t a projektben, és hogyan ellenőriztem az AI által javasolt megoldásokat.

### Feladatok

- [ ] AI Manifest kitöltése.
- [ ] A használt AI-eszközök kliens-/termékverziójának és – ha bizonyítható – modellverziójának rögzítése.
- [ ] Fontosabb promptok dokumentálása.
- [ ] A végső Prompt Logban 10-20 fontos prompt szerepel.
- [ ] Verification Log folyamatos vezetése.
- [ ] AI által javasolt döntések összevetése saját döntéssel.
- [ ] AI által generált kód ellenőrzésének dokumentálása.
- [ ] Hibás AI javaslatok dokumentálása, ha voltak.
- [ ] Legalább 5 verifikációs bejegyzés elkészítése a végére.
- [ ] Legalább 2 olyan verifikáció, amely tesztet eredményezett.
- [ ] Legalább 1 mérés vagy PoC jellegű verifikáció.

### Javasolt verifikációs bejegyzések

- Magic number alapú validáció működése.
- `usedStorageBytes` frissítése feltöltés/törlés esetén.
- Soft delete után a fájl nem jelenik meg az aktív listában.
- Más felhasználó fájljának elérése tiltott.
- Megosztási link lejárati logika.
- Tárhelylimit működése.
- Presigned URL lejárati idő ellenőrzése.
- Content-Disposition biztonsági döntés.

### Dokumentációs output

- [ ] `docs/07_ai/ai_manifest.md`
- [ ] `docs/07_ai/prompt_log.md`
- [ ] `docs/07_ai/verification_log.md`

### Definition of Done

- [ ] AI Manifest kitöltve.
- [ ] AI Manifest tartalmazza az eszköz- és az ismert modellverziókat, az ismeretlen történeti verziók pedig őszintén jelöltek.
- [ ] Prompt Log 10-20 fő promptot tartalmaz.
- [ ] Verification Log tartalmaz legalább 5 bejegyzést.
- [ ] Látszik, hogy a végső döntéseket nem az AI hozta önállóan.
- [ ] Látszik, hogyan ellenőriztem az AI által javasolt megoldásokat.

---

## 17. Mérföldkő: Későbbi integration, e2e és CI/CD fázis

### Cél

Ez nem első körös feladat, de a végső termékminőséghez szükséges lesz.

### Későbbi integration tesztek

- [ ] Backend + PostgreSQL integráció.
- [ ] Backend + MinIO integráció.
- [ ] File upload flow integrációs teszt.
- [ ] Auth + protected endpoint integrációs teszt.
- [ ] Soft delete + restore integrációs teszt.
- [ ] Share link integrációs teszt.

### Későbbi e2e tesztek

- [ ] Regisztráció + login flow.
- [ ] Upload + listázás + megtekintés flow.
- [ ] Soft delete + restore flow.
- [ ] Megosztási link flow.
- [ ] Hibás fájl feltöltési flow.
- [ ] Legalább 1 API contract vagy további e2e teszt, hogy az e2e/contract tesztek száma elérje a 6-ot.

### Végső tesztminimum

- [ ] Legalább 30 automata teszt összesen.
- [ ] Legalább 18 unit jellegű teszt.
- [ ] Legalább 6 integration teszt.
- [ ] Legalább 6 e2e/UI/contract jellegű teszt.
- [ ] Legalább 5 negatív teszt invalid inputra, jogosultságra vagy hibafolyamatokra.

### Későbbi CI/CD

- [ ] GitHub Actions vagy GitLab CI bevezetése.
- [ ] Lint futtatása.
- [ ] Typecheck futtatása.
- [ ] Unit tests futtatása.
- [ ] Integration tests futtatása.
- [ ] Build ellenőrzése.
- [ ] A pipeline hibára megáll, és a `main` ágra csak zöld kötelező ellenőrzések után lehet merge-elni.
- [ ] CI badge README-be.
- [ ] Deployment későbbi megtervezése.

### Dokumentációs output

- [ ] `docs/04_quality/test_strategy.md` bővítése
- [ ] `docs/04_quality/test_report.md` frissítése
- [ ] `docs/05_security_ops/deploy_runbook.md`
- [ ] `docs/05_security_ops/observability.md`

### Definition of Done

- [ ] A későbbi fázis feladatai dokumentálva vannak.
- [ ] Nem keverednek bele túl korán az MVP scope-ba.
- [ ] A végső leadás előtt ezekből a szükséges részek elkészülnek.
- [ ] A végső tesztminimum teljesül, és ezt friss CI run valamint teszt riport bizonyítja.

---

## 18. Mérföldkő: Observability, runbook és üzemeltethetőség

### Cél

A rendszer ne csak működjön, hanem diagnosztizálható és üzemeltethető is legyen.

### Feladatok

- [ ] Backend health endpoint.
- [ ] Strukturált logolás alap szinten.
- [ ] Request ID vagy correlation ID koncepció.
- [ ] Logolási szabályok: mit logolunk és mit nem.
- [ ] Legalább 3 javasolt metrika:
  - API latency
  - error rate
  - successful uploads
  - failed uploads
  - storage usage
- [ ] Legalább 2 incident scenario runbookban:
  - API nem válaszol
  - PostgreSQL kapcsolat megszakad
  - MinIO/S3 kapcsolat hibázik
  - felhasználók nem tudnak bejelentkezni
- [ ] Debugging guide.

### Dokumentációs output

- [ ] `docs/05_security_ops/observability.md`
- [ ] `docs/05_security_ops/runbook.md`
- [ ] `docs/05_security_ops/deploy_runbook.md`

### Definition of Done

- [ ] Van health endpoint.
- [ ] Van logolási stratégia.
- [ ] Van legalább 2 incident scenario.
- [ ] A dokumentáció alapján hiba esetén tudni lehet, mit kell először megnézni.

---

## 19. Mérföldkő: Multipart upload tervezése nagy videókhoz

### Cél

A nagy fájlok, különösen videók kezelése legyen átgondolt, még akkor is, ha az MVP-ben nem implementáljuk teljesen.

### Miért fontos?

Egy 500 MB vagy 1 GB méretű videó feltöltése egyetlen presigned URL-lel instabil hálózaton könnyen megszakadhat. A multipart upload lehetővé teszi a fájl darabokra bontott feltöltését, majd az objektumtároló oldali összeállítását.

### MVP döntés

Az MVP-ben normál presigned upload lesz fájlméretlimittel. A multipart upload későbbi fejlesztési fázis vagy stretch goal.

### Feladatok

- [ ] Multipart upload ADR elkészítése.
- [ ] Alternatívák dokumentálása:
  - sima presigned upload
  - backend proxy upload
  - multipart upload
- [ ] Döntés indoklása.
- [ ] Fájlméret limit meghatározása MVP-re.
- [ ] Későbbi API terv vázlat:
  - initiate multipart upload
  - presign part URLs
  - complete multipart upload
  - abort multipart upload
- [ ] Kockázatok dokumentálása.

### Dokumentációs output

- [ ] `docs/02_architecture/adr/ADR-009-defer-multipart-upload.md`
- [ ] `docs/03_design/api.md` későbbi tervként
- [ ] `docs/01_product/scope_contract.md` stretch goal rész

### Definition of Done

- [ ] A multipart upload nem marad figyelmen kívül.
- [ ] Világos, hogy miért nem első körös MVP.
- [ ] A bíráló felé látható a termékminőségű gondolkodás.

---

## 20. Mérföldkő: Release előkészítés és szakdolgozati leadási csomag

### Cél

A projekt leadásra alkalmas állapotba hozása.

### Feladatok

- [ ] README véglegesítése.
- [ ] Quickstart ellenőrzése tiszta környezetben.
- [ ] `.env.example` ellenőrzése.
- [ ] Dokumentációs linkek ellenőrzése.
- [ ] Screenshotok elkészítése.
- [ ] Demo script elkészítése.
- [ ] Test report frissítése.
- [ ] Capability map frissítése evidence linkekkel.
- [ ] ADR-ek státuszának ellenőrzése.
- [ ] AI Manifest véglegesítése.
- [ ] Prompt Log véglegesítése.
- [ ] Verification Log véglegesítése.
- [ ] Threat model és privacy dokumentum ellenőrzése.
- [ ] Ismert hiányosságok dokumentálása.
- [ ] Önértékelés elkészítése.
- [ ] Legalább 30 automata teszt ellenőrzése a 18 unit + 6 integration + 6 e2e/contract cél szerinti megoszlásban.
- [ ] Legalább 5 negatív teszt ellenőrzése.
- [ ] CI build, lint/format és teszt kapuk zöld állapotának ellenőrzése.
- [ ] Legalább 8 elfogadott ADR ellenőrzése.

### Végső ellenőrzőlista

- [ ] A rendszer README alapján elindítható.
- [ ] A fő user flow bemutatható.
- [ ] A fő funkciókhoz van evidence.
- [ ] A fontos döntések ADR-ben vannak.
- [ ] A tesztek futtathatók.
- [ ] A dokumentáció nem állít olyat, ami nincs implementálva.
- [ ] Nincs secret a repo-ban.
- [ ] Az AI-használat dokumentált.
- [ ] A projekt termékminőségű irányba mutat, nem csak demo.

### Dokumentációs output

- [ ] `README.md`
- [ ] `docs/00_index.md`
- [ ] `docs/06_release/demo_script.md`
- [ ] `docs/06_release/release_notes.md`
- [ ] `docs/06_release/self_assessment.md`
- [ ] minden korábbi dokumentáció frissítése

### Definition of Done

- [ ] A projekt bemutatható.
- [ ] A dokumentáció teljes.
- [ ] A bíráló számára követhető, mit építettem, miért így, hogyan teszteltem, és hogyan használtam AI-t.
- [ ] A szakdolgozati leadandó csomag repo-szinten összeállt.

---

## 21. Ajánlott megvalósítási sorrend

### Első nagy blokk: tervezés és alapok

1. Projektindítás és repo-alapok
2. Termékvízió, scope és MVP
3. Architektúra és ADR-ek
4. Lokális fejlesztői környezet

### Második nagy blokk: core backend

5. Backend alapok és adatmodell
6. Felhasználókezelés
7. Fájl feltöltés
8. Fájl listázás és megtekintés

### Harmadik nagy blokk: termékminőségi funkciók

9. Fájltípus-validáció és XSS védelem
10. Tárhelyhasználat dashboard
11. Soft delete és purge
12. Megosztás

### Negyedik nagy blokk: frontend és minőség

13. Frontend UI
14. Unit tesztek
15. Security és privacy
16. AI dokumentáció

### Ötödik nagy blokk: későbbi minőség és leadás

17. Integration, e2e és CI/CD
18. Observability és runbook
19. Multipart upload tervezés
20. Release előkészítés

---

## 22. Rövidített MVP fókuszlista

Ha szűkíteni kell, az első bemutatható MVP ezekből álljon:

- [ ] Regisztráció és login.
- [ ] Lokális PostgreSQL + MinIO.
- [ ] Fájl feltöltés.
- [ ] Fájl listázás.
- [ ] Kép/videó megtekintés.
- [ ] Fájl letöltés.
- [ ] Tárhelyhasználat kijelzés.
- [ ] Soft delete.
- [ ] Visszaállítás a megőrzési időn belül.
- [ ] Backend validáció.
- [ ] Unit tesztek a core logikára.
- [ ] README quickstart.
- [ ] Legalább 5 ADR.
- [ ] AI manifest, prompt log, verification log.

---

## 23. Tudatosan későbbre hagyott elemek

Ezek fontosak, de nem az első implementációs körben készülnek:

- [ ] CI/CD pipeline.
- [ ] Integration tesztek.
- [ ] E2E tesztek.
- [ ] Cloud deployment.
- [ ] Multipart upload teljes implementáció.
- [ ] Thumbnail generálás.
- [ ] Videó transzkódolás.
- [ ] Admin felület.
- [ ] Fejlett monitoring dashboard.

---

## 24. Szakdolgozati erősségek, amiket érdemes kiemelni

A projekt nem csak „feltöltök fájlt S3-ba” típusú demo, hanem több olyan témát is érint, ami szakdolgozatban jól védhető:

- Object storage és relációs metaadat-tárolás szétválasztása.
- S3-kompatibilis storage adapter, lokális MinIO-val.
- Backend kontrollált presigned URL flow.
- Jogosultságkezelés fájl-hozzáférésnél.
- Tárhelyhasználat optimalizált nyilvántartása.
- Soft delete és késleltetett purge stratégia.
- Árván maradt objektumok problémájának kezelése.
- Magic number alapú fájltípus-validáció.
- Stored XSS elleni védekezés fájlkezelő rendszernél.
- Multipart upload tudatos későbbi tervezése.
- AI-használat dokumentált és verifikált módon.
- ADR-ekkel alátámasztott mérnöki döntések.
