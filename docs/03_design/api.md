# API-szerződés

**Részben implementált szerződés: health és backend register/login/logout/me létezik; a többi végpont tervezett.**

A scaffold `GET /api/v1/health` végpontja, CORS-konfigurációja, request ID-ja és generikus hibakerete implementált. A regisztráció, login/logout/me is implementált; file-, storage-, share- és MI-endpoint továbbra is terv; import-/processing-kiegészítésük későbbi szerződésfeladat. Futási ellenőrzés: [tesztriport](../04_quality/test_report.md).

## Hatókör és alapelvek

- Implementált API prefix: `/api/v1`; helyi alapcím: `http://127.0.0.1:3000/api/v1`.
- A kliens és az API JSON-t használ, kivéve a böngésző és az object storage közötti presigned bináris adatforgalmat.
- Minden időpont UTC ISO 8601 formátumú, minden azonosító átlátszatlan UUID.
- A bájtértékek nem negatív egész számok.
- A frontend `credentials: include` módban hívja a cookie-auth endpointokat.
- Az alábbi táblában a health és a négy auth sor implementált; a többi endpoint tervezett. Megvalósításkor a controller- és DTO-szerződést e dokumentummal együtt kell frissíteni. OpenAPI-generálás még nincs.

## Hitelesítés, Origin és CORS

A `Core MVP` alapértelmezetten egyórás JWT access tokent használ `HttpOnly`, `SameSite=Lax` cookie-ban. Productionben a cookie `Secure`; a JWT nem kerül response bodyba vagy `localStorage`-ba. Refresh-token flow nincs.

A register/login/logout végpontokon a backend ellenőrzi az `Origin` headert az explicit frontend-origin allowlisthez. Hiányzó vagy nem engedélyezett Origin elutasítandó. A CORS-konfiguráció:

- csak explicit frontend origint enged;
- engedélyezi a credential küldést;
- nem használ wildcard origint credentiallel;
- csak a szükséges metódusokat és headereket engedi.

Az ADR-010 szerinti `SameSite=Lax` és a szigorú Origin-ellenőrzés együtt adja a Core MVP CSRF-védelmét; külön CSRF-token nincs. Ha későbbi deployment topológia további CSRF-token mechanizmust vagy eltérő cookie-policyt igényel, azt implementáció előtt ADR-módosítással kell jóváhagyni.

A jelenlegi scaffold a konfigurált `FRONTEND_PUBLIC_URL` origint credentiallel engedi, az eltérő Origint `403 ORIGIN_NOT_ALLOWED` hibával utasítja el. Origin nélküli kérést a publikus health eléréséhez enged. A register/login/logout külön Origin-guardja a hiányzó Origint is tiltja; a tervezett fájlműveleteknél ezt később szintén alkalmazni kell. A válaszok `X-Request-Id` headere CORS-on keresztül is olvasható. Register és login közös peer-guardot és külön explicit DTO-pipe-ot használ; logout Origin-guardot, `/me` JWT+DB-user guardot kapott. A többi termékvégpont még nincs.

## Endpoint-összefoglaló: health és auth implementált, a többi tervezett

| Metódus és útvonal | Fázis | Auth | Cél |
|---|---|---|---|
| `POST /auth/register` | **Implementált Core-szelet** | publikus + Origin | Fiók létrehozása |
| `POST /auth/login` | **Implementált Core-szelet** | publikus + Origin | JWT-cookie kiadása |
| `POST /auth/logout` | **Implementált Core-szelet** | Origin; cookie törölhető hiányzó/lejárt állapotban is | Auth-cookie törlése |
| `GET /auth/me` | **Implementált Core-szelet** | cookie | Aktuális felhasználó |
| `POST /files/uploads/init` | Core MVP | owner cookie + Origin | Pending rekord, kvótafoglalás és presigned PUT |
| `POST /files/{fileId}/confirm` | Core MVP | owner cookie + Origin | Idempotens storage-validáció és aktiválás |
| `GET /files` | Core MVP | owner cookie | Aktív saját fájlok cursor-lapozott listája |
| `GET /files/trash` | Core MVP | owner cookie | Visszaállítható saját fájlok cursor-lapozott listája |
| `GET /files/{fileId}` | Core MVP | owner cookie | Saját fájl biztonságos metaadata |
| `GET /files/{fileId}/preview-url` | Core MVP | owner cookie | Rövid életű inline preview URL, ha engedélyezett |
| `GET /files/{fileId}/download-url` | Core MVP | owner cookie | Rövid életű attachment download URL |
| `DELETE /files/{fileId}` | Core MVP | owner cookie + Origin | Soft delete |
| `POST /files/{fileId}/restore` | Core MVP | owner cookie + Origin | Restore a 30 napos retention alatt |
| `GET /storage/usage` | Core MVP | cookie | Used, reserved, limit és elérhető kvóta |
| `POST /files/{fileId}/share-links` | Core MVP | owner cookie + Origin | Lejáró publikus share token létrehozása |
| `GET /shares/{token}` | Core MVP | publikus | Share token validálása és rövid read URL |
| `GET /health` | **Implementált scaffold** | publikus | Minimális API-liveness válasz |
| `POST /files/{fileId}/ai-metadata-suggestions` | MVP+ | owner cookie + Origin | Explicit kép-javaslat indítása |
| `GET /ai-metadata-suggestions/{suggestionId}` | MVP+ | owner cookie | Saját javaslat állapotának lekérése |
| `POST /ai-metadata-suggestions/{suggestionId}/accept` | MVP+ | owner cookie + Origin | Javaslat elfogadása vagy szerkesztett elfogadása |
| `POST /ai-metadata-suggestions/{suggestionId}/reject` | MVP+ | owner cookie + Origin | Javaslat elutasítása |

Nincs tervezett publikus audit endpoint vagy audit UI. Share-link revoke, access limit és analitika `Later`.

## Közös reprezentációk

### User

```json
{
  "id": "018f4f35-20de-7a9c-a05a-6c5c9d4f1c31",
  "email": "user@example.test",
  "displayName": "Teszt Felhasználó",
  "createdAt": "2026-07-12T10:00:00.000Z"
}
```

### FileObject

A response soha nem tartalmaz `storageKey` értéket.

```json
{
  "id": "018f4f35-20de-7a9c-a05a-6c5c9d4f1c32",
  "originalName": "nyaralas.jpg",
  "mimeType": "image/jpeg",
  "detectedMimeType": "image/jpeg",
  "sizeBytes": 2457600,
  "status": "ACTIVE",
  "createdAt": "2026-07-12T10:05:00.000Z",
  "deletedAt": null,
  "purgeAfter": null
}
```

### Cursor oldal

```json
{
  "items": [],
  "nextCursor": null,
  "hasNextPage": false
}
```

A cursor átlátszatlan a kliens számára, a `createdAt + id` rendezési kulcsot kódolja, és nem tartalmazhat személyes vagy érzékeny adatot. A rendezés `createdAt DESC, id DESC`. A `limit` defaultja 20, maximuma 100; a tartományon kívüli érték validációs hiba.

## Auth

### `POST /auth/register`

Request:

```json
{
  "email": "user@example.test",
  "displayName": "Teszt Felhasználó",
  "password": "example-only-not-a-real-password"
}
```

**Implementált:** `201 Created`, `Cache-Control: no-store`, bodyban kizárólag `user: { id, email, displayName, createdAt }`. A jelszó/hash, quota BigInt, token vagy cookie nem kerül a válaszba. Nem jelentkeztet be automatikusan.

- Kötelező pontosan három string mező: `email`, `displayName`, `password`; extra mező (például kvóta vagy hash), array/null és hibás típus elutasított. Saját Nest DTO-pipe van; class-validator nincs a meglévő függőségek között, új függőség nem került be.
- Email: trim + lowercase az egész címre; legfeljebb 254 karakter, ASCII dot-atom local part (legfeljebb 64), ponttal tagolt domain, legfeljebb 63 karakteres címkék. Quoted local part, SMTPUTF8, egycímkés domain nem támogatott. A case-insensitive alkalmazásazonosító tudatos szabály; plus-tag/dot összevonás nincs. A login ugyanezt a közös normalizálást használja. Email-tulajdonlás ellenőrzése nincs.
- Display name: trim, 1–100 Unicode-kódpont; vezérlőkarakter és nem párosított surrogate elutasított. Nem HTML; megjelenítéskor a frontendnek szövegként kell kezelnie.
- Jelszó: legalább 15 Unicode-kódpont, legfeljebb 1024 UTF-8 bájt; a 15 karakteres minimum MFA nélküli alkalmazáshoz az [OWASP útmutatóra](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) támaszkodik. Whitespace/Unicode engedélyezett, nincs trim, normalizálás, csonkolás vagy kötelező karakterösszetétel. Kompromittáltjelszó-blokklista még nincs; ez nem teljes jelszóbiztonsági megfelelőségi állítás.
- Hash: ADR-014 scrypt. A Prisma egyetlen `user.create` művelete, a unique email index és a DB defaultok adják a létrehozás atomikusságát. Nincs read-then-write duplikációellenőrzés. A Prisma 7 pg adapter strukturált constraint hibája és a korábbi `meta.target` alak is kezelt. Ugyanaz a normalizált email nem írható be kétszer.
- Kezdőkvóta: `DEFAULT_USER_STORAGE_LIMIT_BYTES`, default 1073741824 (1 GiB), pozitív JS safe integer; a szerver BigIntté alakítja. Meglévő `.env` mellett is működik a default; nincs credentialcsere vagy sémamódosítás. A kliens nem választhat kvótát; used/reserved a DB defaultja szerint nulla.
- Kötelező `Origin`: pontosan a konfigurált `FRONTEND_PUBLIC_URL`; hiányzó, `null`, eltérő host/séma/port `403 ORIGIN_NOT_ALLOWED`. Health továbbra is publikus Origin nélkül. Ez böngészős forrásvédelem, nem klienshitelesítés.
- Kezdeti lokális abuse-védelem: közvetlen socket-peer szerint 5 próbálkozás/60 másodperces ablak (a validációs és sikertelen kérések is számítanak), legfeljebb 1024 peerrekord; telített táblán új peer `429`, lejárt állapot újrahasznosítható. `X-Forwarded-For` nem megbízható, proxytrust nincs. Register és login közös ötpróbás peer-ablakot használ. Egyszerre egy regisztrációs vagy login hash/DB-művelet futhat folyamatonként, várósor nincs; foglaltság `503 SERVICE_UNAVAILABLE`. Minden kimeneti ág felszabadítja a kapacitást.

Hibák a közös wrapperben, `details: {}`: `400 VALIDATION_ERROR`, `403 ORIGIN_NOT_ALLOWED`, `409 EMAIL_ALREADY_EXISTS`, `429 RATE_LIMITED`, `503 SERVICE_UNAVAILABLE` (foglalt hash-kapacitás, hash- vagy DB-hiba); a parser hibái külön 400/413/415. A 409 létező fiókot jelezhet: ez a meglévő regisztrációs szerződés vállalt tradeoffja; a login egységes hibát ad. Nincs nyers input/query/stack/logolt jelszó. Auditírás, UI és valós DB-/browser-elfogadás még nincs.

Szintetikus request a Quickstart után (a példa body nem valódi credential):

```bash
curl -i http://127.0.0.1:3000/api/v1/auth/register \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Content-Type: application/json' \
  --data '{"email":"user@example.test","displayName":"Teszt User","password":"example-only-not-a-real-password"}'
```

Elvárt: 201 és a fenti publikus user, ismétléskor 409; Origin nélkül 403; rövid jelszóval 400. A unit eredmények és a még hiányzó valós PostgreSQL-próba a [tesztriportban](../04_quality/test_report.md) vannak.

### `POST /auth/login`

Request:

```json
{
  "email": "user@example.test",
  "password": "example-only-not-a-real-password"
}
```

**Implementált siker:** `200 OK`, `Cache-Control: no-store`, bodyban kizárólag `user: { id, email, displayName, createdAt }`. A `cloudvault_access` JWT csak `Set-Cookie`-ban kerül ki: HttpOnly, SameSite=Lax, Path=/api/v1, Domain nélkül; productionben Secure, maxAge a TTL-lel egyezik. `JWT_EXPIRES_IN` 1s–24h, default 1h; a konfiguráció egész s/m/h/d jelölést fogad el, a könyvtár numerikus másodpercet kap.

Pontosan két string mező kötelező, extra mező elutasított. Email a regisztrációval azonos shared trim+lowercase/ASCII szabály. Jelszó 1–1024 UTF-8 bájt, jól formált Unicode; nincs trim/normalizálás/csonkolás, és login nem alkalmazza az új regisztráció 15 kódpontos erősségi küszöbét. Rossz input `400 VALIDATION_ERROR`; helyes alakú ismeretlen email és hibás jelszó ugyanaz a `401 INVALID_CREDENTIALS`, üres details-szel. Ismeretlen usernél is valódi scrypt verify fut dummy rekorddal; teljes requestidő-azonosság nincs állítva. Siker előtt nincs Set-Cookie. Origin kötelező, hiánya/eltérése 403; közös register/login peer-korlát 429, foglaltság vagy DB/KDF/sign hiba 503, belső részletek nélkül.

A frontend `/login` űrlapja ezt a végpontot hívja; siker után `/app`-ra navigál és új `/me` ellenőrzést kér. Frontend/backend same-site topológiát igényel; productionben HTTPS szükséges. Cookie-s kérésnél `credentials: include`. Token nem kerül JSON-ba vagy localStorage-ba. Nincs refresh, automatikus hosszabbítás vagy minden eszközről kijelentkeztetés.

### `POST /auth/logout`

**Implementált siker:** `204 No Content`, üres body, `Cache-Control: no-store`. Cookie törlése ugyanazzal a Path/host-only/HttpOnly/SameSite/Secure opcióval, lejárati törlő headerrel. Origin kötelező, hiányzó/tiltott Origin 403; hiányzó, lejárt vagy hibás cookie mellett is 204, így a kliens el tudja takarítani. Nincs DB-hívás vagy drága KDF. Ez pontosítja a korábbi cookie+Origin tervet: a törléshez nem kell érvényes token.

Stateless korlát: a korábban másolt JWT a saját lejáratáig továbbra is érvényes; a logout a böngésző cookie-ját törli, nem ad szerveroldali revokációt (ADR-010).

### `GET /auth/me`

**Implementált siker:** `200 OK`, `Cache-Control: no-store`, bodyban a közös publikus `user`. Nem újítja meg a tokent. A SessionGuard csak az egyértelmű `cloudvault_access` cookie-t olvassa; Authorization bearer nem támogatott. JWT: kizárólag HS256 + helyes aláírás, fix `iss=cloudvault`, `aud=cloudvault-api`, UUID `sub`, kötelező egész `iat`/`exp`, nem jövőbeli iat, még élő exp és legfeljebb konfigurált élettartam. Üres/dupla/hibás/túl hosszú auth-cookie, érvénytelen aláírás/algoritmus/claim és lejárat `401 AUTH_REQUIRED`.

Ez a frontend `/app` útvonalának védett backend végpontja; külön példavégpont nem szükséges. A frontend guard közvetlen megnyitáskor és minden új védett navigáción lekéri; 401 loginra, átmeneti hiba külön retry oldalra vezet, adatmegjelenítés előtt. A guard ezután DB-ből public selecttel újra lekéri a usert: megszűnt user 401, DB-hiba 503. Így a JWT nem egy elavult profil-cache; hash, kvóta és más belső adat nem kerül válaszba. GET-ként nem követel Origint; a globális CORS az explicit eltérő Origint továbbra is tiltja, same-site cookie és DB/token-ellenőrzés kötelező.

Kézi auth-próba a regisztráció után (szintetikus adatokkal, a cookie-jar hozzáférést adó token, ne commitold/ne publikáld):

```bash
curl -i -c /tmp/cloudvault-auth.cookies http://127.0.0.1:3000/api/v1/auth/login \
  -H 'Origin: http://127.0.0.1:5173' -H 'Content-Type: application/json' \
  --data '{"email":"user@example.test","password":"example-only-not-a-real-password"}'
curl -i -b /tmp/cloudvault-auth.cookies http://127.0.0.1:3000/api/v1/auth/me
curl -i -b /tmp/cloudvault-auth.cookies -c /tmp/cloudvault-auth.cookies \
  -H 'Origin: http://127.0.0.1:5173' -X POST http://127.0.0.1:3000/api/v1/auth/logout
curl -i -b /tmp/cloudvault-auth.cookies http://127.0.0.1:3000/api/v1/auth/me
rm -f /tmp/cloudvault-auth.cookies
```

Elvárt sorrend: 200 + cookie, 200 + user, 204 + törlés, 401. A terminál kimenete Set-Cookie-t tartalmazhat, ezért ne másold screenshotba/logba. A futtatási bizonyíték és korlátok a tesztriportban.

## Upload

### `POST /files/uploads/init`

Request:

```json
{
  "originalName": "nyaralas.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 2457600
}
```

Az init tranzakciósan ellenőrzi:

- az authenticationt és a fájlnév biztonságos normalizálhatóságát;
- a 100 MB-os Core MVP méretlimitet;
- a deklarált MIME allowlistet: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`;
- a `usedStorageBytes + reservedStorageBytes + sizeBytes <= storageLimitBytes` invariánst.

Siker esetén `201 Created`:

```json
{
  "file": {
    "id": "018f4f35-20de-7a9c-a05a-6c5c9d4f1c32",
    "status": "PENDING_UPLOAD",
    "originalName": "nyaralas.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 2457600,
    "confirmBy": "2026-07-12T10:20:00.000Z"
  },
  "upload": {
    "method": "PUT",
    "url": "https://object-storage.example.test/presigned-value",
    "expiresAt": "2026-07-12T10:10:00.000Z",
    "headers": {
      "Content-Type": "image/jpeg"
    }
  }
}
```

Az upload URL alapértelmezett élettartama 5 perc. A pending rekord teljes határideje inittől 15 perc: az URL lejárata után 10 perces confirm-grace marad a már feltöltött objektum véglegesítésére. A URL bearer capability: csak a válaszban adható át, és nem kerülhet logba, audit eseménybe vagy későbbi API-válaszba.

### `POST /files/{fileId}/confirm`

Request body nem szükséges. A backend:

1. ellenőrzi az ownert és a fájl állapotát;
2. `HEAD` művelettel ellenőrzi az objektum létét és tényleges méretét;
3. bounded range-readből magic numbert detektál;
4. csak méret- és típusazonosság esetén hajtja végre a `PENDING_UPLOAD → ACTIVE` tranzakciót;
5. pontosan egyszer csökkenti a reservationt és növeli a used számlálót.

Első és ismételt sikeres confirm is `200 OK`, ugyanazzal az aktív `file` reprezentációval. Az aktív állapotra ismételt kérés no-op. Lejárt, invalid vagy storage-hibás pending objektum nem aktiválható.

Invalid vagy abandoned objektumnál cleanup szükséges. A reservation csak bizonyított object-not-found vagy sikeres delete után oldható fel; delete-hibánál a pending rekord és foglalás retry-ig megmarad.

## Fájllista és lifecycle

### `GET /files?cursor={cursor}&limit={limit}`

Csak `ACTIVE` saját fájlokat ad. Siker: `200 OK`, cursor-oldal. A stabil sorrend `createdAt DESC, id DESC`.

### `GET /files/trash?cursor={cursor}&limit={limit}`

Csak saját `SOFT_DELETED`, még visszaállítható fájlokat ad. A retentionből kifutott elem nem állítható vissza akkor sem, ha a `Later` purge még nem futott le.

### `GET /files/{fileId}`

Csak a tulajdonos számára ad biztonságos fájlmetaadatot. Nem ad `storageKey`-t, presigned URL-t vagy másik felhasználó létezését felfedő részletet.

### `DELETE /files/{fileId}`

`ACTIVE → SOFT_DELETED`, `deletedAt` és 30 nappal későbbi `purgeAfter` beállításával. Ugyanabban az adatbázis-tranzakcióban a fájl minden meglévő `ShareLink` rekordja törlődik, így a korábbi raw token végleg invalid. Tervezett siker: `200 OK`, bodyban a törölt `file`. A művelet nem módosít usage számlálót.

### `POST /files/{fileId}/restore`

A tulajdonos `purgeAfter` előtt állíthatja vissza a fájlt. Tervezett siker: `200 OK`, `SOFT_DELETED → ACTIVE`. Usage számláló nem változik, és korábbi share-link nem jön létre újra; megosztáshoz új link szükséges.

Az automatizált retention purge nem része ennek az API-verziónak; `Later`.

## Preview és download

### `GET /files/{fileId}/preview-url`

Owner- és `ACTIVE` state-check után csak dokumentált inline-safe kép- vagy videótípushoz ad rövid életű read URL-t. A storage response `Content-Disposition: inline` viselkedése kontrollált. HTML, SVG, JavaScript, XML és ismeretlen tartalom nem preview-zható.

### `GET /files/{fileId}/download-url`

Owner- és `ACTIVE` state-check után rövid életű read URL-t ad `Content-Disposition: attachment` és normalizált fájlnév beállítással.

Példaválasz:

```json
{
  "url": "https://object-storage.example.test/presigned-read-value",
  "expiresAt": "2026-07-12T10:20:00.000Z"
}
```

A preview- és download-URL TTL-je 5 perc. A két URL külön kérésből, eltérő response-dispositionnel készül.

## Storage usage

### `GET /storage/usage`

```json
{
  "usedStorageBytes": 2457600,
  "reservedStorageBytes": 0,
  "storageLimitBytes": 1073741824,
  "availableStorageBytes": 1071284224
}
```

`availableStorageBytes = max(storageLimitBytes - usedStorageBytes - reservedStorageBytes, 0)`. Soft-deleted, fizikailag létező objektum a used értékben marad. Used csak sikeres confirmkor nő és későbbi igazolt purge után csökken.

## Megosztás

### `POST /files/{fileId}/share-links`

Request:

```json
{
  "expiresAt": "2026-07-13T10:00:00.000Z"
}
```

Csak owner és `ACTIVE` fájl engedélyezett. Siker: `201 Created`. Soft delete-kor a rekord végleg törlődik, ezért restore után a usernek új linket kell létrehoznia.

```json
{
  "id": "018f4f35-20de-7a9c-a05a-6c5c9d4f1c33",
  "shareUrl": "https://frontend.example.test/share/raw-one-time-token",
  "expiresAt": "2026-07-13T10:00:00.000Z"
}
```

A raw token 32 kriptográfiailag véletlen bájt base64url kódolása, és csak a létrehozási válaszban, illetve a felhasználónak átadott URL-ben létezik. Adatbázisba a token SHA-256 hash-e kerül. A kötelező lejárat a létrehozástól számított minimum 1 óra, maximum 7 nap.

### `GET /shares/{token}`

Cookie nélkül hívható. A backend a token hashét, lejáratát és az `ACTIVE` fájlállapotot ellenőrzi, majd 5 perces read URL-t ad. Invalid, lejárt és nem aktív fájlhoz tartozó token ugyanazt a publikus `SHARE_LINK_INVALID_OR_EXPIRED` választ adja.

## Opcionális MI-metaadat-javaslat

Az alábbi endpointok `MVP+` státuszúak. Hiányuk vagy hibájuk nem érintheti a Core MVP endpointokat.

### `POST /files/{fileId}/ai-metadata-suggestions`

Csak owner, `ACTIVE` állapotú, támogatott képhez, explicit felhasználói műveletből hívható. Videó elutasítandó. Tervezett siker: `202 Accepted`, bodyban a `PENDING` suggestion. Automatikus upload utáni providerhívás tilos.

### `GET /ai-metadata-suggestions/{suggestionId}`

Csak a kérő owner számára adja a `PENDING | READY | ACCEPTED | REJECTED | FAILED` állapotot, a `READY` javasolt címkéit/leírását és minimális provenance adatát. Raw provider-válasz nem része az API-nak.

### `POST /ai-metadata-suggestions/{suggestionId}/accept`

A `READY` javaslat változatlan vagy szerkesztett elfogadása:

```json
{
  "tags": ["tájkép", "nyár"],
  "description": "Nyári tájkép."
}
```

Csak e kifejezett kérés módosíthatja a kanonikus fájlmetaadatot. Siker: `200 OK`, status `ACCEPTED`.

### `POST /ai-metadata-suggestions/{suggestionId}/reject`

Request body nem szükséges. Siker: `200 OK`, status `REJECTED`; fájlmetaadat nem változik.

Provider timeout vagy hiba `FAILED` suggestiont vagy `AI_UNAVAILABLE` hibát eredményezhet, de nem módosíthatja és nem teheti elérhetetlenné a fájlt. Arcfelismerés, biometrikus azonosítás és érzékeny tulajdonság következtetése tiltott, nem későbbi roadmap.

## Health

`GET /health` (`GET /api/v1/health`) implementált publikus válasza `200 OK`:

```json
{
  "status": "ok"
}
```

A health liveness jelzés: a futó API válaszol. Induláskor a Prisma kapcsolatot nyit, de a health hívás nem ellenőrzi újra a PostgreSQL vagy MinIO aktuális elérhetőségét. Publikus válasz nem nevez meg dependency hostot, credentialt, bucketet, adatbázist vagy belső hibát. Részletes readiness/diagnosztika csak későbbi, védett operációs felületen tervezhető.

## Authorization és existence-hiding

- Védett fájl-, share-create-, lifecycle- és MI-művelethez authentication, ownership és megfelelő resource state szükséges.
- Puszta UUID ismerete nem ad hozzáférést.
- Nem tulajdonolt és nem létező védett fájl ugyanazt a `404 FILE_NOT_FOUND` választ adja, így a válasz nem fedi fel, melyik eset történt.
- A publikus share-validáció minden invalid állapotot ugyanazzal a hibával kezel.
- Az audit belsőleg rögzítheti a döntés eredményét, de nem tárolhat raw tokent, URL-t vagy fájltartalmat.

## Hibaválasz

Minden hiba a [hibakezelési szerződés](error_handling.md) nested wrapperét használja:

```json
{
  "error": {
    "code": "UPLOAD_VALIDATION_FAILED",
    "message": "A feltöltött fájl nem támogatott.",
    "details": {},
    "requestId": "req_01J2EXAMPLE"
  }
}
```

## Abuse prevention

Különösen a register, login, upload init, share-validáció és opcionális MI-request igényel rate limitet és visszaélés-figyelést. A regisztráció fenti fix korlátai konzervatív, kód- és unit-review-val ellenőrzött lokális védőkorlátok, nem mért kapacitásértékek; ez felváltja a korábbi, minden számértéket méréshez kötő tervet. Terhelési baseline és többprocesszes/proxy-s környezethez közös rate-limit store, topológiai review és mért konfiguráció később szükséges. A processz újraindítása nullázza a számlálókat; több processz szorozza a korlátot. A limiter nem általános hálózati DoS-védelem. A register/login limit közös. Logout csak Origin-checket használ és nem fogyaszt KDF-kapacitást. A többi endpoint korlátja továbbra is tervezett. A rate limit nem használhat raw emailt, tokent vagy presigned URL-t metrikacímkeként.
