# Követhetőségi mátrix

**Részben implementált: az US-01 regisztráció/login/logout/me backend-szelete; a többi termékfolyamat tervezett.**

## Cél

A mátrix összeköti a szakdolgozat négy szakmai pillérét a tervezett capabilitykkel, user storykkal, API-csoportokkal, entitásokkal és unit tesztcsoportokkal. US-01 részleges bizonyíték: `AuthController` → `RegisterValidationPipe`/`RegistrationGuard` → `AuthService`/`PasswordService` → Prisma `User`; `registration.spec.ts`, password-, error- és config-unit tesztek. Login/logout/me: `SessionService` + `SessionGuard` + Origin-guard + `cookie-auth.spec.ts`; frontend `/login`, `/app`, `/auth-unavailable` és `api/auth.ts`/router-session guard implementált, `auth.spec.ts`, `protected-route.spec.ts`, `auth-pages.spec.ts` unit/template bizonyítékkal; backend `/me` guard-regresszió is van. A valós DB-/browser-próba, regisztrációs UI és fájlfolyamat még nyitott; a többi terméksorhoz nincs működési bizonyíték.

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
| `UT-UPLOAD` | Init validáció és rollback, 100 MB limit, 5 perces PUT URL, 15 perces pending deadline, párhuzamos reservation, első és ismételt confirm |
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
