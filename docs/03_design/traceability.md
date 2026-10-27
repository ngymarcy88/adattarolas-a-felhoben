# Követhetőségi mátrix

**Részben implementált: az US-01 regisztráció/login/logout/me backend-szelete; a többi termékfolyamat tervezett.**

## Cél

A mátrix összeköti a szakdolgozat négy szakmai pillérét a tervezett capabilitykkel, user storykkal, API-csoportokkal, entitásokkal és unit tesztcsoportokkal. US-01 részleges bizonyíték: `AuthController` → `RegisterValidationPipe`/`RegistrationGuard` → `AuthService`/`PasswordService` → Prisma `User`; `registration.spec.ts`, password-, error- és config-unit tesztek. Login/logout/me: `SessionService` + `SessionGuard` + Origin-guard + `cookie-auth.spec.ts`; frontend `/login`, `/app`, `/auth-unavailable` és `api/auth.ts`/router-session guard implementált, `auth.spec.ts`, `protected-route.spec.ts`, `auth-pages.spec.ts` unit/template bizonyítékkal; backend `/me` guard-regresszió is van. A `/register` és a közös `auth/form.ts` loading/validation/error/retry/success/dispose ágai `auth-form.spec.ts`, API- és template-próbákkal igazoltak. A valós DB-/browser-próba és fájlfolyamat még nyitott; a többi terméksorhoz nincs működési bizonyíték.

## Pillérek

| ID | Szakmai pillér |
|---|---|
| P-01 | Core cloud-storage MVP |
| P-02 | Megbízható fájl-életciklus |
| P-03 | Skálázható és karbantartható architektúra |
| P-04 | Opcionális, human-in-the-loop MI-metaadat-javaslat |

## Story- és capability-mátrix

| Pillér | Capability | Story/scope | Tervezett endpointcsoport | Fő entitás | Tervezett unit tesztcsoport |
|---|---|---|---|---|---|
| P-01, P-03 | Regisztráció, login, logout, védett felület és stateless cookie-auth | US-01 | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` | `User`, `AuditEvent` | UT-AUTH, UT-ERROR, UT-AUDIT |
| P-01, P-02, P-03 | Presigned upload init, pending reservation, validáció és idempotens confirm | US-02 | `/files/uploads/init`, `/files/{fileId}/confirm` | `User`, `FileObject`, `AuditEvent` | UT-UPLOAD, UT-VALIDATION, UT-ACCOUNTING, UT-CLEANUP |
| P-01, P-03 | Cursor-lapozott saját lista, biztonságos preview és download | US-03 | `/files`, `/files/{fileId}`, `/files/{fileId}/preview-url`, `/files/{fileId}/download-url` | `FileObject`, `User` | UT-OWNERSHIP, UT-PAGINATION, UT-DELIVERY |
| P-01, P-02, P-03 | Denormalizált used/reserved kvótaelszámolás | US-04 | `/storage/usage`, upload endpointok | `User`, `FileObject` | UT-ACCOUNTING, UT-UPLOAD |
| P-01, P-03 | Hash-elt, időkorlátos alap megosztás | US-05 | `/files/{fileId}/share-links`, `/shares/{token}` | `ShareLink`, `FileObject`, `AuditEvent` | UT-SHARING, UT-OWNERSHIP, UT-AUDIT |
| P-01, P-02 | Soft delete, share-link invalidálás, trash-lista, 30 napos restore és későbbi purge-határ | US-06 | `/files/trash`, `DELETE /files/{fileId}`, `/files/{fileId}/restore` | `FileObject`, `ShareLink`, `User`, `AuditEvent` | UT-LIFECYCLE, UT-SHARING, UT-ACCOUNTING, UT-OWNERSHIP |
| P-02, P-03 | Abandoned/invalid upload cleanup és retry-képes részhiba | Core keresztmetszeti | Nincs publikus cleanup endpoint; upload lifecycle belső use case | `FileObject`, `User`, `AuditEvent` | UT-CLEANUP, UT-ACCOUNTING, UT-AUDIT |
| P-03 | Egységes nested error wrapper, request ID és existence-hiding | Core keresztmetszeti | Minden `/api/v1` endpoint | Minden érintett entitás; hiba nem külön domain entitás | UT-ERROR, UT-OWNERSHIP |
| P-03 | Alap audit események audit UI nélkül | Core keresztmetszeti | Nincs publikus audit endpoint | `AuditEvent` | UT-AUDIT |
| P-04 | Explicit kép-javaslat, provider fallback és emberi döntés | MVP+ | `/files/{fileId}/ai-metadata-suggestions`, `/ai-metadata-suggestions/{suggestionId}`, `/ai-metadata-suggestions/{suggestionId}/accept`, `/ai-metadata-suggestions/{suggestionId}/reject` | `AiMetadataSuggestion`, `FileObject`, `User`, `AuditEvent` | UT-AI, UT-OWNERSHIP, UT-AUDIT |

## Unit tesztcsoportok

| Csoport | Tervezett minimum |
|---|---|
| `UT-AUTH` | Jelszóhash/check, inputvalidáció, generic login hiba, egyórás `HttpOnly; SameSite=Lax` cookie, logout, Origin allowlist, token hiánya response bodyban/localStorage szerződésben |
| `UT-OWNERSHIP` | Saját resource siker; más owner és nem létező file azonos `404 FILE_NOT_FOUND`; state-check minden védett műveletnél |
| `UT-UPLOAD` | Init validáció/rollback és tartós owner+kulcs dedupe (azonos/eltérő payload, párhuzamosság, újraindítás, legalább 24 órás receipt), 104857600 bájtos limit, fix 5/15 perces határok és replay megújítás nélkül; párhuzamos reservation, első/ismételt/soft-deleted confirm, commitkori határidő |
| `UT-VALIDATION` | Pontos kép-/video-MIME allowlist, `HEAD` méreteltérés, bounded range magic-number mismatch, unknown/corrupt/active content |
| `UT-ACCOUNTING` | `used + reserved <= limit`, pontosan egyszeri reserved→used transfer, soft delete/restore no-op, cleanup és későbbi purge invariáns |
| `UT-CLEANUP` | Object-not-found, delete success, delete failure, reservation megtartás/feloldás, retry-képes pending állapot és időalapú kiválasztás |
| `UT-PAGINATION` | Default 20, max 100, invalid limit, azonos timestamp tie-breaker, több oldal kihagyás és duplikáció nélkül |
| `UT-DELIVERY` | Preview/download külön presign, 5 perces TTL, inline allowlist, attachment fallback, safe filename és URL-redaction |
| `UT-SHARING` | 32 random byte token, base64url, SHA-256 hash, 1 óra–7 nap expiry, valid/invalid/expired/non-active file, soft-delete invalidálás, raw token redaction |
| `UT-LIFECYCLE` | Delete/restore ownership, 30 napos boundary, listaszűrés, korábbi share-linkek végleges invalidálása, ismételt művelet és `Later` purge selection/accounting szabály |
| `UT-ERROR` | Nested wrapper, HTTP mapping, request ID, safe details, providerhiba-redaction és stack trace tiltás |
| `UT-AUDIT` | Kijelölt események és tiltott mezők: jelszó/hash, JWT, share token, presigned URL, credential, file content, raw MI I/O |
| `UT-AI` | Csak owner + `ACTIVE` kép + explicit trigger; `PENDING/READY/ACCEPTED/REJECTED/FAILED`; edit/accept/reject; providerhiba melletti core működés; biometrikus/szenzitív eredmény tiltása |

## Evidence frissítési szabály

Implementációkor minden sorhoz legalább egy stabil kódhivatkozás és egy teszteset vagy dokumentált manuális bizonyíték kerül. A végrehajtott eredményt a `docs/04_quality/test_report.md`, a metrikakapcsolatot a `docs/01_product/metrics.md`, az AI-asszisztált állítás ellenőrzését a `docs/07_ai/verification_log.md` rögzíti. Tervezett sort nem szabad bizonyíték nélkül készre állítani.

## Első képfeltöltési API ellenőrzési kapui – tervezett, 2026-10-20

A [képszelet szerződése](api.md#upload--első-képfeltöltési-szelet-tervezett) init és confirm része implementált, a cleanup őrzött workerrel működik, fizikai release-proof nélkül. Az init tartós dedupe/terminális lezárás [adatmodellje](data_model.md#első-képfeltöltés-adatmodell-szerződése--2026-10-23) 2026-10-23-án dokumentált, a Prisma-séma és SQL-migráció implementált; a konkrét storage adapter is implementált, az init/confirm service is implementált, a cleanup fizikai release proofja továbbra is hiányzik. A meglévő UT-UPLOAD/UT-VALIDATION/UT-ACCOUNTING/UT-CLEANUP csoportok későbbi esetei fedjék: idegen owner és hiányzó fájl azonos 404, MIME/név/méret határok, same-key retry és payload-konfliktus, egyszeri foglalás és könyvelés, ACTIVE no-op lejárat után is, cleanup/confirm verseny, 413/422 terminális ok megőrzése, hiány/átmeneti hiba eltérő kezelése és a sikertelen cleanup foglalásmegtartása.

Az adapter előtti külön tényleges MinIO/S3 bizonyítási kapuk: aláírt headerek megkerülhetetlensége és create-only PUT, storage-oldali méretkorlát a valódi browser-adatúton, változatlan HEAD/range objektum, publikus/belső cím és CORS, lejárat előtt indult PUT/cleanup versenyének biztonságos lezárása. Ezek **nem lefutott tesztek**, és nem vezetnek be most integration/e2e suite-ot. A végrehajtásuk külön engedélyezett implementációs/ellenőrzési feladat; kizárólag unit mock nem bizonyít provider-kompatibilitást. A végleges resumable PoC és újraküldöttbájt-mérés ettől külön SZD2-kapu.

Az upload-adatmodell későbbi tesztjei külön fedjék a következőket: (1) owner+kulcs dedupe két párhuzamos initnél; (2) fingerprint-normalizálás és eltérő payload; (3) OPEN határidő commit közbeni elérése; (4) két confirm közül egy FINALIZED könyvelés; (5) REJECTED/EXPIRED és confirm versenye, eredeti 413/422 ok megtartásával; (6) két cleanup és crash delete után, csak egy release; (7) writesClosedAt nélküli késői PUT/404 nem enged kvótafelszabadítást; (8) sikeres release utáni receipt-replay restartot túlél; (9) 24 óra után is nyitott művelet megmarad; (10) szabályos receipt-prune sikeres fájlnál used/file megtartása, sikertelennél metadata törlése; (11) idegen owner composite FK/authorizáció elutasítása; (12) legacy pending esetén migráció megáll, nem talál ki kulcsot és nem enged el foglalást. Ezek service-szintű tervezett esetek. A composite FK és legacy-preflight adatbázis-korlátját elkülönített sémás kézi migrációpróba már igazolta; részletek a tesztriportban.

Az implementált upload-init bizonyítékai: `backend/test/upload-init.spec.ts` DTO/guard/service/controller unit esetek, illetve a tesztriportban külön verziózott kézi HTTP/DB concurrency és rollback próba. A későbbi confirm/cleanup szelet unit esetei is elkészültek: upload-confirm.spec.ts és upload-cleanup.spec.ts. Az UT-CLEANUP valós fizikai release-kapuja ettől még nem teljesül.

Az első US-02 frontend-illesztés: `frontend/src/api/uploads.ts` → `frontend/src/upload/batch.ts` → `UploadPanel.vue` a védett AccountPage-en. Unit bizonyíték: `upload-api.spec.ts`, `upload-batch.spec.ts`, `upload-panel.spec.ts`. Fájlonkénti állapot/progress, két párhuzamos átvitel, részhiba és idempotens retry implementált; valódi browser/DB/storage elfogadás, galéria/processor és tartós/bájtszintű resume nem lezárt.
