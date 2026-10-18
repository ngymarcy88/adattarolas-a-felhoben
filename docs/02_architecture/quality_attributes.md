# Quality Attributes

## Státusz

**Tervezett állapot – nem implementált funkcionalitás.**

Az alábbi követelmények a későbbi implementáció ellenőrizhető architekturális céljai. Nem jelentenek teljesített SLA-t vagy futtatási eredményt.

## Security

- Minden védett fájlművelet backend oldali authenticationt és ownership checket igényel.
- JWT csak egyórás, `HttpOnly`, `SameSite=Lax` cookie-ban használható; productionben `Secure` szükséges.
- State-changing cookie-auth kéréseknél Origin/CSRF védelem és explicit CORS allowlist szükséges.
- A presigned URL rövid életű, szűk műveletre érvényes és nem kerül logba.
- HTML, SVG, JavaScript, XML és ismeretlen tartalom nem jeleníthető meg inline.
- Share token csak nagy entrópiájú, hash-elt értékként tárolható.

## Privacy

- Jelszó, password hash, JWT, share token, presigned URL, fájltartalom és szükségtelen személyes adat nem logolható.
- Az opcionális MI-provider adatkezelése előtt explicit felhasználói indítás és privacy tájékoztatás szükséges.
- Arcfelismerés, biometrikus azonosítás és érzékeny tulajdonság következtetése tiltott.
- Nyers MI input/output nem kerül alkalmazáslogba; csak minimális provenance és státusz tárolható.

## Reliability és consistency

- Upload csak ellenőrzött confirm után válhat aktívvá.
- Ismételt confirm nem növelheti újra a tárhelyhasználatot.
- Pending reservation, aktív usage és FileObject state egy tranzakciós use case-ben változik.
- Soft delete és restore nem módosítja a `usedStorageBytes` értékét.
- Lejárt vagy hibás pending upload cleanupja retry-képes; sikertelen storage-delete esetén a reservation nem oldható fel bizonyíték nélkül.
- A későbbi purge idempotens; usage csak sikeres vagy idempotensen már teljesült object delete után csökkenhet.

## Scalability

- A Backend API stateless; új példány indítása nem igényel memóriában tárolt user/session/job állapot átvitelét.
- A fájllista `createdAt + id` alapú cursor paginationt használ, alapértelmezett és maximális oldalmérettel.
- A fő list/usage/presign API-műveletek nem olvassák át a bináris objektumot.
- A browser és object storage közötti adatút tehermentesíti az API-t a bináris transfer alól.
- Purge és MI-feldolgozás később külön workerbe szervezhető a domain interface módosítása nélkül.

## Maintainability és modifiability

- A storage provider adapteren keresztül cserélhető; közvetlen SDK-hívás csak az adapterben lehet.
- A providerfüggő MI-integráció külön adapter mögött marad.
- API-, adatmodell- és error szerződés csak a kanonikus design docsban részletezhető.
- Döntésváltozás új ADR-t vagy meglévő ADR státuszfrissítést igényel.
- A controllerek vékonyak, az üzleti logika izolált service-ben vagy pure utility-ben tesztelhető.

## Testability

- Első fázisban unit tesztek készülnek; integration, contract és e2e Later scope.
- Prioritás: auth, ownership, quota reservation, idempotens confirm, file validation, pagination, soft delete/restore, sharing és error mapping.
- Időfüggő logika injektált clockkal tesztelhető.
- Storage és MI provider portjai unit tesztben mockolhatók.

## Graceful degradation

- MI-provider kiesése `AI_UNAVAILABLE` vagy kontrollált failed suggestion állapotot okoz, de nem blokkol core műveletet.
- Preview-hiba mellett a biztonságos download elérhető maradhat, ha authorization és fájlállapot engedi.
- Storage vagy PostgreSQL hiba stabil külső hibakódot ad, belső stack trace nélkül.
- Audit- vagy cleanup-hiba nem vezethet csendes, dokumentálatlan állapotvesztéshez.

## Observability

- Minden API-hiba request ID-val és stabil kóddal rendelkezik.
- A log esemény neve, request ID, actor/resource referencia és eredmény tárolható; secret és content nem.
- Tervezett metrikák: request latency, error rate, upload init/confirm/failure, cleanup backlog, usage és opcionális MI success/failure.
- Health endpoint csak szükséges állapotot jelez; részletes dependency információ nem publikus.

## Local reproducibility

- Normál lokális fejlesztéshez nem kell valódi AWS/OCI credential.
- PostgreSQL és MinIO később Docker Compose-ból indul.
- A README csak ténylegesen kipróbált parancsot tartalmazhat.

## Verification matrix

| Attribute | Tervezett ellenőrzés |
|---|---|
| Security | Authorization, cookie, CSRF/Origin, MIME és safe-disposition unit tesztek; manual secret/log review |
| Privacy | Threat model, provider adatfolyam review, prompt/log secret scan |
| Reliability | Concurrent reservation, idempotens confirm, cleanup és lifecycle unit tesztek |
| Scalability | Cursor-stabilitás; API statelessness review; dokumentált lokális latency mérés később |
| Maintainability | Direct SDK/process.env keresés; adapter- és modulhatár review |
| Testability | Core service unit test suite és mockolt portok |
| Graceful degradation | Storage/MI failure unit scenario-k |
| Observability | Error response, request ID, log-redaction és health manuális ellenőrzés |
| Reproducibility | Tiszta környezetben végigjátszott Quickstart a scaffold után |
