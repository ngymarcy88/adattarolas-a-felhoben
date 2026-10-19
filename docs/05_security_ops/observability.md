# Observability: alap és célállapot

**Implementált alap: publikus API-liveness, request ID és minimális biztonságos 5xx-log. A metrikák, auditírás és általános requestlog tervezettek.**

A tényleges build/unit/kézi ellenőrzési eredmények a [tesztriportban](../04_quality/test_report.md) találhatók; az implementált kód önmagában nem telepítési bizonyíték.

## Cél

A későbbi rendszer legyen diagnosztizálható anélkül, hogy credentialt, capability URL-t, fájltartalmat vagy szükségtelen személyes adatot tenne naplóba vagy metrikacímkébe. Konkrét logging/metrics stack még nincs kiválasztva.

## Request ID

- Minden API-kérés kap vagy validáltan átvesz request ID-t.
- Implementált: az ID megjelenik a `X-Request-Id` response headerben és nested hibaválaszban; generikus 5xx-logban is. Általános requestlog és audit-eseményírás még nincs.
- A request ID átlátszatlan, nem tartalmaz user- vagy fájladatot.
- A kliens user-facing hibánál megjelenítheti támogatási referenciaként.

## Strukturált logmezők célállapota

A scaffold 5xx-logja csak `event`, `requestId`, `status`, `code` mezőt ad át a Nest loggernek; raw kivételt nem naplóz. Biztonságos indulási hibajelzés is van. Az alábbi további logmezők és események még tervezettek.

Engedélyezett minimum:

- timestamp;
- severity;
- event name;
- request ID;
- route template és HTTP status;
- duration;
- actor/resource átlátszatlan referencia, csak szükség esetén;
- normalizált error code;
- state transition neve;
- cleanup/AI operation outcome, raw providerüzenet nélkül.

Tiltott:

- password vagy password hash;
- JWT és cookie value;
- raw share token;
- presigned URL vagy query stringje;
- storage/database/provider credential;
- file content vagy teljes fájlnév szükségtelenül;
- raw MI input/output;
- email, token vagy file ID nagy kardinalitású metric labelként.

## Tervezett metrikák

| Metrika | Típus | Címkék | Cél |
|---|---|---|---|
| `http_requests_total` | counter | route template, method, status class | Forgalom és hibaarány |
| `http_request_duration_seconds` | histogram | route template, method | Latency |
| `upload_init_total` | counter | outcome | Init siker/hiba |
| `upload_confirm_total` | counter | outcome | Confirm, validation és idempotens retry |
| `pending_uploads_expired` | gauge | nincs user label | Cleanup backlog |
| `cleanup_attempts_total` | counter | outcome, safe error category | Cleanup megbízhatóság |
| `storage_usage_bytes` | gauge | environment, nem user | Aggregált kapacitástrend; user usage nem label |
| `share_validation_total` | counter | outcome | Invalid/expired trend raw token nélkül |
| `audit_write_failures_total` | counter | safe event category | Evidence-kiesés |
| `ai_suggestions_total` | counter | outcome, provider key ha jóváhagyott | Opcionális MVP+ fallback és hibaarány |

Konkrét bucketek, thresholdok és alert szabályok csak futtatási baseline után rögzíthetők.

## Health és readiness

- Implementált publikus `GET /api/v1/health`: minimális `{"status":"ok"}`. Ez liveness: nem futtat dependency probe-ot. A Prisma induláskor nyit kapcsolatot, de későbbi PostgreSQL-/MinIO-kiesés nem feltétlenül változtatja meg a health választ.
- Nem ad hostnevet, bucketet, connection stringet vagy részletes dependency hibát.
- Későbbi belső readiness külön jelezheti PostgreSQL/MinIO elérhetőséget, de nem publikus diagnosztikai dump.
- MI-provider nem része a Core MVP readiness feltételének.

## Tervezett alert-jelöltek

- tartós 5xx/error-rate emelkedés;
- expired pending vagy cleanup retry backlog növekedése;
- reservation/usage reconciliation eltérés;
- storage/database dependency elérhetetlenség;
- audit write failure;
- auth failure hirtelen növekedése;
- opcionális MI provider failure, amely csak MVP+ alert és nem core outage.

Alert küszöbérték csak baseline, környezet és false-positive review után állítható be.

## Audit és operational log különbsége

- AuditEvent domain/security esemény és hosszabb távú bizonyíték.
- Operational log rövid távú diagnosztikai esemény.
- Ugyanaz a tiltott adat egyikbe sem kerülhet.
- Audit UI nincs Core MVP-ben; audit read endpoint sem publikus.

## Verifikáció

- Unit teszt error response és request ID propagációra.
- Unit teszt audit/log payload allowlistre.
- Célzott secret/token/URL minta keresés fixture-ökön és későbbi logmintán.
- Failure scenario ellenőrzés a runbook szerint.
- Runtime metrika- és alertverifikáció csak implementáció után lehetséges.
