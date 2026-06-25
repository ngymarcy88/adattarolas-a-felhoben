# Quality Attributes

## Statusz

Ez a dokumentum a 3. merfoldko architekturatervezesi resze. A kovetelmenyek a kesobbi implementaciohoz adnak ellenorizheto iranyt.

## Security

- A frontend nem tarolhat S3/MinIO credentialt.
- Minden vedett fajlmuvelethez backend oldali authentication es ownership ellenorzes kell.
- A presigned URL-ek rovid eletuek legyenek, es ne keruljenek logba.
- HTML, SVG, JavaScript, XML es ismeretlen binaris tartalom nem lehet inline preview-ra engedelyezett.
- Password csak biztonsagos hash formajaban tarolhato.

## Privacy

- A rendszer ne logoljon jelszot, password hasht, JWT tokent, presigned URL-t, fajltartalmat vagy szuksegtelen szemelyes adatot.
- A share token adatbazisban csak hash formajaban tarolhato.
- Mas felhasznalo fajlazonositojanak ismerete nem adhat metadata vagy binaris tartalom hozzaferest.

## Modifiability

- A storage eleres adapteren keresztul tortenjen, hogy MinIO, AWS S3 vagy OCI Object Storage kozotti valtas ne erintse a teljes codebase-t.
- A backend modulhatarok kozak legyenek: auth, users, files, storage, sharing, audit, health, config es common.
- A dokumentalt ADR-eket valtoztatas eseten uj ADR-rel vagy statuszfrissitessel kell kovetni.

## Testability

- Az uzleti szabalyok service szinten legyenek tesztelhetok, ne controllerbe vagy SDK adapterbe legyenek egetve.
- Elso korben unit tesztek keszulnek; integration, contract es e2e tesztek kesobbi merfoldkohoz tartoznak.
- Prioritas: password hashing, auth validation, ownership checks, storage key generation, file validation, quota accounting, soft delete/restore es share link expiry.

## Reliability

- Feltoltes csak sikeres confirm utan valhat aktivva es novelheti a `usedStorageBytes` erteket.
- Soft delete alatt a binaris objektum megmarad, a usage nem csokken.
- Kesobbi purge idempotens legyen; storage torlesi hiba eseten a usage nem csokkenhet.
- Lejart vagy hibas share link nem adhat hozzaferest.

## Observability

- A backend hibak stabil kodot, felhasznalobarat uzenetet es request azonositasra alkalmas mezot kapjanak.
- Naplozasnal a hasznos technikai kontextus megengedett, de credential, token, presigned URL es fajltartalom tilos.
- Kesobbi health endpoint legalabb az API alapelerhetoseget jelezze; reszletes monitoring dashboard nem MVP kovetelmeny.

## Local reproducibility

- A normal fejleszteshez ne kelljen valo AWS vagy OCI credential.
- Lokalis object storage cel a MinIO, lokalis metadata store cel a PostgreSQL.
- A kesobbi README quickstart parancsai reprodukalhato modon inditsak a fejlesztoi kornyezetet.

## Verification matrix

| Attribute | Kesobbi ellenorzes |
|---|---|
| Security | Unit tesztek authorizationra, validaciora es error mappingre; manual review presigned URL logolas ellen. |
| Privacy | Secret es token kereses; prompt/verification log kezi atnezes. |
| Modifiability | Storage adapter boundary review; direct SDK hivasok keresese. |
| Testability | Backend unit test coverage a core service logikara. |
| Reliability | Upload confirm, usage accounting, soft delete/restore es purge selection unit tesztek. |
| Observability | Error response dokumentacio es health endpoint manual check kesobbi merfoldkovekben. |
| Local reproducibility | Docker Compose es README quickstart manual inditasi proba kesobbi merfoldkovekben. |
