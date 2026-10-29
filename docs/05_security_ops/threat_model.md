# Threat model

**Részben implementált: scrypt (ADR-014), register/login/logout/me, HttpOnly JWT-cookie (ADR-010), szerveresen ellenőrzött frontend fiókútvonal; a további termékkontrollok tervezettek.**

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

- Jelszóhash-primitív: ADR-014 szerint beépített scrypt, új dependency nélkül; unit tesztelt. Regisztráció: 15 kódpontos minimum, 1024 bájtos maximum, explicit szerzői döntés szerint nagybetű/számjegy/speciális karakter kötelező (nem NIST által előírt összetétel), szigorú DTO/Origin, közvetlen peer 5/60s (legfeljebb 1024 állapot), egy közös drága register/login művelet/folyamat, nincs várósor. Konzervatív lokális korlátok, nem terhelési bizonyíték. A 409 felfedheti a fiók létezését (API-tradeoff). Kompromittáltjelszó-blokklista, email-verifikáció, többprocesszes limiter/proxy-policy, terhelésmérés, audit, valós DB- és browser-elfogadás még nyitott. Login generikus hibája és hiányzó user dummy scryptje implementált; nincs teljes requestidő-azonossági állítás. JWT HS256 fix issuer/audience, UUID subject, iat/exp/TTL és public DB-user ellenőrzés implementált; cookie HttpOnly/Lax és production Secure, same-site HTTPS topológiát feltételez. Nincs refresh vagy logout utáni korábban másolt token-revokáció; ADR-010 elfogadott korlát.
- Rate-limit számértékek futtatási baseline alapján.
- Production domain/topológia változása esetén cookie/CSRF ADR felülvizsgálata.
- MI-provider régió, retention, tréningfelhasználás, DPA/licenc és költség.
- Purge worker/queue és reconciliation csak Later döntéssel.

## Review ütemezés

A threat model minden auth-, storage-, sharing-, lifecycle-, AI- vagy deployment döntésnél frissítendő. Runtime nélkül a mitigációk nem jelölhetők teljesítettnek.


## Frontend útvonalvédelmi szelet – 2026-10-19

A `/app` belépését minden védett navigációkor backend `/auth/me` igazolja; a SessionGuard változatlanul JWT- és DB-user ellenőrzést végez. A frontend csak UX-határ, nem API-jogosultság. Nincs tárolt token/login flag; a memóriabeli publikus profil navigációkor ürül, késői válasz nem írhatja felül az újabbat. Ellenőrzés alatt nincs profil-render, a név/email Vue szöveginterpolációval jelenik meg. 401 és átmeneti kiesés külön állapot. Nincs tetszőleges return URL vagy redirect-követés az API-kliensben; login mindig belső account route-ra vezet. Logout csak sikeres szerverválasz után állít UI-sikert.

A tétlen oldal profilja nincs folyamatosan újraellenőrizve; a backend következő kérését továbbra is saját guard védi. Valós böngészős cookie-kezelés, history/back és sessionlejárati UI-próba még nyitott; a unit/template bizonyíték nem helyettesíti. MFA, cross-tab auth-sync, login audit és token-revokáció nem került be. A regisztrációs UI már implementált: kliensvalidáció csak UX, a backend változatlanul autoritatív; jelszómegerősítés nem kerül requestbe, duplikált submit tiltott, elküldött kísérlet/dispose után jelszók törlődnek, késői válasz nem navigál. A 409 account-enumeration tradeoff a meglévő API-szerződésből változatlan.

## Thumbnail worker – tervezett védelem, 2026-10-29

[ADR-016](../02_architecture/adr/ADR-016-thumbnail-processing.md); nincs még implementált védelem/worker. Támadó bemenet lehet támogatott signature mögötti sérült kép, decompression bomb, extrém dimenzió/animáció, EXIF/GPS vagy decoder exploit. Explicit négyformátumos decoder-allowlist, buffer-only input, szigorú warning-policy és korlátozott frame/bytes/pixel/dimenzió/output szükséges. A külön worker cgroup és killable child a natív erőforráshatár; Promise.race/heapflag önmagában nem elég. A gyermeknek nincs secret vagy user-URL/path; Sharp/libvips codec-update/version-manifest ellenőrzés szükséges.

Forgatott képnél orientáció előbb pixelekre kerül, utána minden metadata elvész; nincs GPS/XMP log vagy feldolgozás külső image-szolgáltatónál. Az immutable candidate-ek ugyanabban a privát storage-ban vannak, kliens nem választhat kulcsot. Derived URL csak owner/ACTIVE/READY és rövid TTL után; elveszett capability a TTL-ig él.

A lease nem S3 write-fence: külön attempt key, pontos előzetes reservation, DB-publication fence, source/hash/type és végső owner-check együtt kell. A cleanup-claim irreverzibilisen kizárja az adoptiont. Timeout/crash/HEAD404/DELETE200 után nincs proof nélküli quota release; különben késői PUT számlálatlan objektumot hozhatna létre. Retry kerete, user-kvóta és rate limit védi a feldolgozási/árvaobjektum DoS-t; a beragadt reservation operátori jelzés, nem kézi nullázandó számláló. A második metadata-processor későbbi adatvédelmi szerződést kap.

### Implementált thumbnail-storage I/O határ – 2026-10-29

A storage adapter bounded full original-read és create-only derived-write védelme már létezik: szigorú teljes-key (sortörések nélkül),32MiB/512KiB cap, ETag/size/range,10s/caller-abort, immutable snapshot/checksum és egy SDK-write-attempt. Nem dekóder/ownership/DB-fence ellenőrzés. A derived WebP olvasási MIME fix, eredeti upload-allowlist változatlan. Távoli írás abortja/time-outja nem proof; nincs automatikus delete vagy reservation release. A unitok a command/stream és safe-error határt igazolják; valódi provider/closure/recovery külön kapu.
