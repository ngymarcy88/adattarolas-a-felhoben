# Threat model

**Részben implementált: scrypt (ADR-014) és backend regisztráció; a további termékkontrollok tervezettek.**

## Hatókör

A modell a tervezett Browser SPA, stateless NestJS API, PostgreSQL, privát MinIO/S3 és opcionális külső MI-provider közötti adatfolyamokat vizsgálja. A mitigációk célállapotok; tényleges hatásukat későbbi kód, unit teszt, configuration review és manuális verifikáció bizonyítja.

## Védendő eszközök

- felhasználói fiók és hitelesítési állapot;
- privát kép- és videóobjektum;
- ownership, lifecycle és fájlmetadata;
- `usedStorageBytes` és `reservedStorageBytes` konzisztenciája;
- raw share token és presigned capability URL;
- audit és request trace integritása;
- opcionális MI-feldolgozásra átadott kép és suggestion provenance;
- storage, database, JWT és későbbi provider secretek.

## Trust boundary-k

1. Browser ↔ Backend API.
2. Browser ↔ Object storage presigned URL-lel.
3. Backend API ↔ PostgreSQL.
4. Backend API ↔ Object storage adapteren keresztül.
5. Backend API ↔ opcionális külső MI-provider.
6. Fejlesztői környezet ↔ repository és environment secret.

## Fenyegetések és mitigációk

| ID | STRIDE | Fenyegetés | Hatás | Tervezett mitigáció | Tervezett verification |
|---|---|---|---|---|---|
| T-01 | Spoofing | Credential stuffing vagy user enumeration loginon | Fiókátvétel, email-létezés szivárgása | Jelszóhash, generic `INVALID_CREDENTIALS`, rate-limit konfiguráció, audit outcome secret nélkül | Auth unit teszt, abuse review |
| T-02 | Spoofing/Tampering | JWT lopása vagy módosítása | Jogosulatlan API-hozzáférés | Egyórás aláírt JWT `HttpOnly`, `SameSite=Lax`, production `Secure`; nincs localStorage/refresh Core-ban | Cookie/token unit teszt, browser review |
| T-03 | Tampering | CSRF state-changing cookie-auth kérésen | Upload/delete/share user nevében | `SameSite=Lax`, kötelező explicit Origin allowlist, wildcard CORS tiltás; topology változásnál ADR | Origin/CORS unit/config review |
| T-04 | Information disclosure | IDOR más user fájl-ID-jával | Privát metadata vagy objektum kiszivárgása | Minden use case-ben owner check; más user és nem létező file egységes `404 FILE_NOT_FOUND` | Negatív ownership unit teszt |
| T-05 | Information disclosure | Presigned URL logba, auditba vagy analyticsbe kerül | Ideiglenes storage-hozzáférés | URL redaction és tiltott mezők; rövid, 5 perces TTL | Log/audit fixture review |
| T-06 | Tampering/Elevation | Hamis extension/MIME vagy aktív tartalom feltöltése | Stored XSS, hibás preview | 100 MB limit, pontos allowlist, `HEAD`, bounded range magic-number validáció, unsafe inline tiltás | Validation és disposition unit teszt |
| T-07 | Denial of service | Párhuzamos init kvótatúlfoglalást okoz | Storage-kimerítés | Tranzakciós `reservedStorageBytes`, concurrency guard, per-user rate limit | Concurrent reservation unit teszt |
| T-08 | Denial/Tampering | Abandoned vagy invalid objektum orphan marad | Fizikai storage és quota drift | 15 perces pending expiry, object existence/delete ellenőrzés, retry metadata, reservation csak bizonyított cleanup után oldható | Cleanup success/failure unit teszt |
| T-09 | Tampering | Confirm retry kétszer könyvel usage-ot | Hibás kvóta, negatív reservation | Idempotens state transition és exactly-once counter transfer | Ismételt/párhuzamos confirm unit teszt |
| T-10 | Information disclosure | Share token adatbázisból vagy brute force-szal megszerezhető | Publikus file access | 32 random byte base64url token, csak SHA-256 hash, kötelező 1 óra–7 nap expiry, egységes invalid hiba | Token/hash/expiry unit teszt |
| T-11 | Information disclosure | Soft-deleted file régi share-linkje újra él restore után | Váratlan publikus hozzáférés | Soft delete törli/érvényteleníti az összes meglévő share-linket; restore után új link kell | Delete/restore/share unit teszt |
| T-12 | Repudiation | Fontos state/security műveletnek nincs nyoma | Hibakeresés és felelősség nem követhető | Append-only alap AuditEvent request ID-val és allowlistelt metadata-val | Audit event unit teszt |
| T-13 | Information disclosure | Audit/log érzékeny adatot tartalmaz | Credential, PII vagy content leak | Közös redaction; tiltott mezők; nem érzékeny resource referenciák | Secret pattern és fixture review |
| T-14 | Denial of service | Nagy lista vagy instabil lapozás | API/DB terhelés, hibás UX | Cursor pagination default 20/max 100, indexelt `createdAt + id` | Pagination unit és query review |
| T-15 | Information disclosure | MI-provider képet megtart vagy más célra használ | Privacy, licenc és vendor kockázat | MVP+ go/no-go provider retention/region/terms review; explicit user trigger; adatminimalizálás | Privacy review, provider contract evidence |
| T-16 | Elevation/Privacy | Arcfelismerés vagy érzékeny profilalkotás | Biometrikus/szenzitív károkozás | Kifejezetten tiltott scope, human-in-the-loop, output validation és provider policy | Scope/test/manual review |
| T-17 | Tampering | MI-javaslat automatikusan kanonikus adattá válik | Hibás vagy káros metadata | Külön suggestion entity; accept/edit/reject; jóváhagyás nélküli apply tiltott | AI state unit teszt |
| T-18 | Denial of service | MI-provider kiesése core hibát okoz | Alaprendszer használhatatlan | Adapter és külön MVP+ modul; `AI_UNAVAILABLE`; core use case-ek nem függnek tőle | Failure isolation unit teszt |
| T-19 | Information disclosure | Secret kerül commitba vagy AI-promptba | Credential kompromittálódás | `.gitignore`, placeholder `.env.example`, secret scan, prompt szabályok | Repo/prompt review |

## Security invariánsok

- A browser nem tárol storage credentialt.
- Presigned URL nem authorization helyettesítő; kiadás előtt backend döntés szükséges.
- `used + reserved <= limit` minden commitált állapotban.
- Nem aktív file nem kaphat új preview/download/share URL-t.
- Soft delete után korábbi share token végleg érvénytelen; restore nem reaktiválja.
- MI-provider nélkül a hat Core MVP story teljesíthető.

## Nyitott go/no-go kapuk

- Jelszóhash-primitív: ADR-014 szerint beépített scrypt, új dependency nélkül; unit tesztelt. Regisztráció: 15 kódpontos minimum, 1024 bájtos maximum, szigorú DTO/Origin, közvetlen peer 5/60s (legfeljebb 1024 állapot), egy drága regisztráció/folyamat, nincs várósor. Konzervatív lokális korlátok, nem terhelési bizonyíték. A 409 felfedheti a fiók létezését (API-tradeoff). Kompromittáltjelszó-blokklista, email-verifikáció, login enumeration-védelem, többprocesszes limiter/proxy-policy, terhelésmérés, audit és tokenfüggőség még nyitott; nincs teljes auth-készültségállítás.
- Rate-limit számértékek futtatási baseline alapján.
- Production domain/topológia változása esetén cookie/CSRF ADR felülvizsgálata.
- MI-provider régió, retention, tréningfelhasználás, DPA/licenc és költség.
- Purge worker/queue és reconciliation csak Later döntéssel.

## Review ütemezés

A threat model minden auth-, storage-, sharing-, lifecycle-, AI- vagy deployment döntésnél frissítendő. Runtime nélkül a mitigációk nem jelölhetők teljesítettnek.
