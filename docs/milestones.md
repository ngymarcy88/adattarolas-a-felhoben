# Mérföldkövek – Adattárolás a felhőben

## Státusz és használat

**Tervezett végrehajtási roadmap – a jövőbeli termékfunkciók nincsenek implementálva.**

Ez a dokumentum a végrehajtási sorrend, a státusz és a szükséges evidence kanonikus forrása. A termék elfogadási kritériumait a [scope contract](01_product/scope_contract.md), a részletes technikai döntéseket az [ADR-ek](02_architecture/adr/README.md), az interfészeket pedig a [design dokumentáció](03_design/README.md) tartalmazza.

Jelölések:

- `[x]`: repository evidence alapján lezárt dokumentációs eredmény.
- `[ ]`: jövőbeli, még nem implementált vagy nem igazolt feladat.
- **Core MVP**: a kötelező storage termék része.
- **MVP+**: opcionális, csak a core MVP után indítható.
- **Later**: tudatosan későbbi fázis.

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

## Dokumentációs rebaseline – SZD2 előkészítés

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

## Jövőbeli vertikális termék-roadmap

### MVP-0: Reprodukálható lokális környezet – Core MVP alap

**Cél:** PostgreSQL és MinIO lokális elindítása, valamint a frontend/backend scaffold reprodukálható előkészítése.

**Jövőbeli deliverable-ek:**

- [ ] Docker Compose PostgreSQL és MinIO service-ekkel.
- [ ] Privát bucket inicializálása és CORS konfiguráció a presigned PUT/GET folyamathoz.
- [ ] NestJS és Vue scaffold a rögzített stackkel.
- [ ] Centralizált config és environment validáció.
- [ ] Minimális health endpoint.
- [ ] Valós, kipróbált Quickstart parancsok.

**Minőség és evidence:** build/start parancsok, health ellenőrzés, secret scan, kézzel újrajátszott Quickstart. Ebben a szeletben integration/e2e teszt még nem készül.

### MVP-1: Auth és alap adatmodell – Core MVP

**Cél:** elkülönített felhasználói fiók és a későbbi fájléletciklus adatbázis-alapja.

**Jövőbeli deliverable-ek:**

- [ ] `User`, `FileObject`, `ShareLink` és `AuditEvent` kezdeti Prisma modell.
- [ ] `usedStorageBytes` és `reservedStorageBytes` számlálók.
- [ ] Regisztráció, login, logout és aktuális user endpoint.
- [ ] Egyórás JWT `HttpOnly`, `SameSite=Lax` cookie-ban, localStorage és refresh flow nélkül.
- [ ] Protected frontend route-ok és auth hibaállapotok.

**Unit teszt minimum:** password hash/check, regisztrációs validáció, generic login error, cookie/token logika, auth guard és user boundary.

**Kapcsolódó docs:** API auth rész, adatmodell, auth ADR, threat model és test report.

### MVP-2: Biztonságos feltöltési folyamat – Core MVP

**Cél:** legfeljebb 100 MB-os kép vagy rövid videó feltöltése privát object storage-ba, idempotens és ellenőrzött confirmmal.

**Jövőbeli deliverable-ek:**

- [ ] `PENDING_UPLOAD` rekord és tranzakciós kvótafoglalás.
- [ ] Rövid életű presigned PUT URL.
- [ ] Storage adapter presign, `HEAD`, bounded range-read és delete műveletekkel.
- [ ] Confirm: tényleges méret, allowlist és magic-number vizsgálat.
- [ ] Pontosan egyszeri `PENDING_UPLOAD → ACTIVE` és usage accounting.
- [ ] Lejárt, hibás vagy abandoned upload cleanup/retry viselkedés.
- [ ] Upload progress, újrapróbálható és felhasználóbarát UI-állapotok.
- [ ] Fontos upload események auditálása titkok nélkül.

**Unit teszt minimum:** méret/MIME/magic number, storage key, párhuzamos reservation, idempotens confirm, cleanup failure és pontosan egyszeri számlálómódosítás.

**Kapcsolódó docs:** API upload szerződés, file state machine, ADR-005/007/008/011, threat model és test report.

### MVP-3: Lista, preview és letöltés – Core MVP

**Cél:** saját aktív fájlok stabil, lapozott böngészése és biztonságos használata.

**Jövőbeli deliverable-ek:**

- [ ] `createdAt + id` alapú determinisztikus cursor pagination.
- [ ] Betöltési, üres, hiba- és következő oldal UI-állapot.
- [ ] Külön preview- és download-jogosultság.
- [ ] Rövid életű read URL-ek megfelelő `Content-Type` és `Content-Disposition` beállítással.
- [ ] HTML, SVG, JavaScript, XML és ismeretlen tartalom inline tiltása.
- [ ] Cross-user IDOR elleni backend enforcement.

**Unit teszt minimum:** ownership, törölt fájl kizárása, cursor-stabilitás, limitvalidáció, inline/attachment döntés és presign paraméterezés.

**Kapcsolódó docs:** list/read API, UX-flow, threat model és test report.

### MVP-4: Lifecycle, kvótaelszámolás és alap audit – Core MVP

**Cél:** visszafordítható törlés és konzisztens tárhelyelszámolás.

**Jövőbeli deliverable-ek:**

- [ ] `ACTIVE → SOFT_DELETED` 30 napos `purgeAfter` időponttal.
- [ ] Egyedi restore a retention időn belül.
- [ ] Törölt fájlok listája és érthető kvótajelzés.
- [ ] Soft delete és restore során változatlan `usedStorageBytes`.
- [ ] Audit esemény upload, delete, restore és security-releváns átmenetekhez.
- [ ] Soft delete-kor a korábbi share-linkek végleges invalidálása; restore után új link szükséges.
- [ ] A későbbi idempotens purge kiválasztási, retry- és accounting szabályainak megtartása.

**Unit teszt minimum:** ownership, state transition, időfüggő restore, idempotens delete/restore, listaszűrés és usage invariánsok.

**Fontos határ:** az automatizált purge worker nem Core MVP deliverable; csak a stratégia és a későbbi tesztelhető üzleti szabály marad dokumentált.

### MVP-5: Időkorlátos megosztás – Core MVP

**Cél:** aktív saját fájl kontrollált elérése bejelentkezés nélkül.

**Jövőbeli deliverable-ek:**

- [ ] Nagy entrópiájú share token és csak hash-elt tárolás.
- [ ] Kötelező lejárati idő.
- [ ] Backend validáció után kiadott rövid életű read URL.
- [ ] Lejárt, hibás vagy törölt fájlhoz tartozó link elutasítása.
- [ ] Külön publikus hibaállapot információszivárgás nélkül.

**Unit teszt minimum:** token hash, expiry boundary, ownership, törölt fájl, hibás token és error mapping.

**Later:** revoke, access limit és analitika.

### MVP-6: MI-metaadat-javaslat – opcionális MVP+

**Belépési kapu:** csak a Core MVP elfogadása után, külön provider-, privacy- és dependency-jóváhagyással.

**Jövőbeli deliverable-ek:**

- [ ] Explicit felhasználói indítás aktív képnél.
- [ ] `AiMetadataSuggestion` provenance és státuszkezelés.
- [ ] Címke- és rövid leírásjavaslat provider adapteren keresztül.
- [ ] Elfogadás, szerkesztés és elutasítás.
- [ ] Provider failure esetén degradált, de teljes értékű core működés.
- [ ] Arcfelismerés, biometria és érzékeny következtetés tiltása.
- [ ] Raw média, presigned URL és nyers provider-válasz logolásának tiltása.

**Unit teszt minimum:** csak aktív kép engedélyezése, státuszátmenetek, ownership, accept/edit/reject, providerhiba és core-függetlenség.

**Nem döntött:** konkrét provider és queue/worker technológia. Ezekhez új, explicit döntés szükséges.

### MVP-7: Mérnöki lezárás – Core release-előkészítés

**Cél:** a megvalósított scope bizonyítható, reprodukálható és bírálható állapota.

**Jövőbeli deliverable-ek:**

- [ ] Unit tesztek minden megvalósított core üzleti szabályra.
- [ ] API-, adatmodell-, security-, operations- és AI-dokumentáció szinkronizálása.
- [ ] Test report valós parancsokkal és eredményekkel.
- [ ] Threat model mitigációk kézi review-ja.
- [ ] Runbook, observability, demo script, release notes és self-assessment tényleges állapotra frissítve.
- [ ] Traceability: pillér → capability → story → API → entitás → teszt/evidence.
- [ ] Tiszta környezetben végigjátszott Quickstart és core UX-flow-k.

## Later-stage roadmap

Az alábbiak nem keverhetők a Core MVP mérföldköveibe:

- [ ] Automatizált, idempotens purge worker és reconciliation.
- [ ] Multipart upload initiate/presign-parts/complete/abort flow-val.
- [ ] AWS vagy OCI deployment.
- [ ] Integration tesztek PostgreSQL/MinIO ellen.
- [ ] Contract és e2e tesztek.
- [ ] CI/CD quality gates.
- [ ] Fejlett observability dashboard.
- [ ] Thumbnail, transzkódolás, admin és fejlett keresés.

Ezek megkezdéséhez külön felhasználói kérés vagy jóváhagyott új mérföldkő szükséges.

## Közös Definition of Done minden jövőbeli szelethez

- A viselkedés implementált és a slice acceptance criteria teljesül.
- A változó üzleti logikához unit teszt készül és fut.
- Az API-, adatmodell-, security- és UX-dokumentáció a tényleges állapotot írja.
- Nincs hardcoded secret, PII-, token- vagy presigned URL-logolás.
- A fontos AI-asszisztált változás bekerül a Prompt Logba és Verification Logba.
- A manuális review-hoz konkrét evidence áll rendelkezésre.
- A branch stratégia és Conventional Commits szabályai teljesülnek.
