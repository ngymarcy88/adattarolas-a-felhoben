# API-szerződés

**Részben implementált szerződés: health, register/login/logout/me és upload-init/confirm létezik; a többi végpont tervezett.**

A scaffold `GET /api/v1/health` végpontja, CORS-konfigurációja, request ID-ja és generikus hibakerete implementált. A regisztráció, login/logout/me is implementált; a `POST /api/v1/files/uploads/init` is implementált; a confirm is implementált; a további file-, share- és MI-endpoint terv; import-/processing-kiegészítésük későbbi szerződésfeladat. Futási ellenőrzés: [tesztriport](../04_quality/test_report.md).

A belső MinIO/S3 adapter már implementált; ez nem publikus endpoint. Az init authorizationja, kvótafoglalása és tartós replay-je implementált; a confirm is implementált; a cleanup csak igazolt íráslezárás mellett törölhet és oldhat fel foglalást; az in-flight íráslezárás bizonyítása nyitott.

## Hatókör és alapelvek

- Implementált API prefix: `/api/v1`; helyi alapcím: `http://127.0.0.1:3000/api/v1`.
- A kliens és az API JSON-t használ, kivéve a böngésző és az object storage közötti presigned bináris adatforgalmat.
- Minden időpont UTC ISO 8601 formátumú, minden azonosító átlátszatlan UUID.
- A bájtértékek nem negatív egész számok.
- A frontend `credentials: include` módban hívja a cookie-auth endpointokat.
- Az alábbi táblában a health, a négy auth sor és az upload-init/confirm implementált; a többi endpoint tervezett. Megvalósításkor a controller- és DTO-szerződést e dokumentummal együtt kell frissíteni. OpenAPI-generálás még nincs.

## Hitelesítés, Origin és CORS

A `Core MVP` alapértelmezetten egyórás JWT access tokent használ `HttpOnly`, `SameSite=Lax` cookie-ban. Productionben a cookie `Secure`; a JWT nem kerül response bodyba vagy `localStorage`-ba. Refresh-token flow nincs.

A register/login/logout végpontokon a backend ellenőrzi az `Origin` headert az explicit frontend-origin allowlisthez. Hiányzó vagy nem engedélyezett Origin elutasítandó. A CORS-konfiguráció:

- csak explicit frontend origint enged;
- engedélyezi a credential küldést;
- nem használ wildcard origint credentiallel;
- csak a szükséges metódusokat és headereket engedi.

Az ADR-010 szerinti `SameSite=Lax` és a szigorú Origin-ellenőrzés együtt adja a Core MVP CSRF-védelmét; külön CSRF-token nincs. Ha későbbi deployment topológia további CSRF-token mechanizmust vagy eltérő cookie-policyt igényel, azt implementáció előtt ADR-módosítással kell jóváhagyni.

A jelenlegi scaffold a konfigurált `FRONTEND_PUBLIC_URL` origint credentiallel engedi, az eltérő Origint `403 ORIGIN_NOT_ALLOWED` hibával utasítja el. Origin nélküli kérést a publikus health eléréséhez enged. A register/login/logout külön Origin-guardja a hiányzó Origint is tiltja; az upload-init már ugyanilyen Origin-védelmet és SessionGuardot használ. A válaszok `X-Request-Id` headere CORS-on keresztül is olvasható. Register és login közös peer-guardot és külön explicit DTO-pipe-ot használ; logout Origin-guardot, `/me` JWT+DB-user guardot kapott. Az upload-init őrei sorrendben Origin → aktuális session/user → fejlécek/rate limit; utána a DTO következik. A további termékvégpontok még nincsenek.

## Endpoint-összefoglaló

| Metódus és útvonal | Fázis | Auth | Cél |
|---|---|---|---|
| `POST /auth/register` | **Implementált Core-szelet** | publikus + Origin | Fiók létrehozása |
| `POST /auth/login` | **Implementált Core-szelet** | publikus + Origin | JWT-cookie kiadása |
| `POST /auth/logout` | **Implementált Core-szelet** | Origin; cookie törölhető hiányzó/lejárt állapotban is | Auth-cookie törlése |
| `GET /auth/me` | **Implementált Core-szelet** | cookie | Aktuális felhasználó |
| `POST /files/uploads/init` | **Implementált init-szelet** | owner cookie + Origin + Idempotency-Key | Egyszeri pending/foglalás és rövid presigned PUT |
| `POST /files/{fileId}/confirm` | **Implementált confirm-szelet** | owner cookie + Origin | Idempotens storage-validáció és aktiválás |
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
  "password": "Example-only-test-password1!"
}
```

**Implementált:** `201 Created`, `Cache-Control: no-store`, bodyban kizárólag `user: { id, email, displayName, createdAt }`. A jelszó/hash, quota BigInt, token vagy cookie nem kerül a válaszba. Nem jelentkeztet be automatikusan. A frontend `/register` ezt a végpontot hívja: a jelszómegerősítés helyben ellenőrzött és nem API-mező. Sikeres 201 után visszajelzést/login linket mutat, 409 esetén biztonságosan jelzi a foglalt e-mailt; loading és inputhibák frontend unit/template teszteltek.

- Kötelező pontosan három string mező: `email`, `displayName`, `password`; extra mező (például kvóta vagy hash), array/null és hibás típus elutasított. Saját Nest DTO-pipe van; class-validator nincs a meglévő függőségek között, új függőség nem került be.
- Email: trim + lowercase az egész címre; legfeljebb 254 karakter, ASCII dot-atom local part (legfeljebb 64), ponttal tagolt domain, legfeljebb 63 karakteres címkék. Quoted local part, SMTPUTF8, egycímkés domain nem támogatott. A case-insensitive alkalmazásazonosító tudatos szabály; plus-tag/dot összevonás nincs. A login ugyanezt a közös normalizálást használja. Email-tulajdonlás ellenőrzése nincs.
- Display name: trim, 1–100 Unicode-kódpont; vezérlőkarakter és nem párosított surrogate elutasított. Nem HTML; megjelenítéskor a frontendnek szövegként kell kezelnie.
- Jelszó: legalább 15 Unicode-kódpont, legfeljebb 1024 UTF-8 bájt; a 15 karakteres minimum MFA nélküli alkalmazáshoz az [OWASP útmutatóra](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) támaszkodik. A 2026-10-20-i explicit szerzői kérés szerint új regisztrációnál kötelező legalább egy Unicode nagybetű (`Lu`), decimális számjegy (`Nd`) és írásjel vagy szimbólum (`P`/`S`). Például `!`, `@`, `#`; a szóköz és a láthatatlan elválasztó önmagában nem speciális karakter, emoji szimbólumként elfogadott. Whitespace/Unicode továbbra is engedélyezett, nincs trim, normalizálás vagy csonkolás. A frontend mező alatti lista élőben jelzi mind a négy feltételt. A [jelenlegi NIST-ajánlás](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) alátámasztja a 15-ös minimumot egyfaktoros jelszónál, de nem ír elő karakterkeverést: az összetétel itt felhasználó által kért projektszabály, nem NIST-megfelelőség. Kompromittáltjelszó-blokklista még nincs; ez nem teljes jelszóbiztonsági megfelelőségi állítás.
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
  --data '{"email":"user@example.test","displayName":"Teszt User","password":"Example-only-test-password1!"}'
```

Elvárt: 201 és a fenti publikus user, ismétléskor 409; Origin nélkül 403; rövid jelszóval 400. A unit eredmények és a még hiányzó valós PostgreSQL-próba a [tesztriportban](../04_quality/test_report.md) vannak.

### `POST /auth/login`

Request:

```json
{
  "email": "user@example.test",
  "password": "Example-only-test-password1!"
}
```

**Implementált siker:** `200 OK`, `Cache-Control: no-store`, bodyban kizárólag `user: { id, email, displayName, createdAt }`. A `cloudvault_access` JWT csak `Set-Cookie`-ban kerül ki: HttpOnly, SameSite=Lax, Path=/api/v1, Domain nélkül; productionben Secure, maxAge a TTL-lel egyezik. `JWT_EXPIRES_IN` 1s–24h, default 1h; a konfiguráció egész s/m/h/d jelölést fogad el, a könyvtár numerikus másodpercet kap.

Pontosan két string mező kötelező, extra mező elutasított. Email a regisztrációval azonos shared trim+lowercase/ASCII szabály. Jelszó 1–1024 UTF-8 bájt, jól formált Unicode; nincs trim/normalizálás/csonkolás, és login nem alkalmazza az új regisztráció minimumhossz- és karakterösszetételi szabályait. Rossz input `400 VALIDATION_ERROR`; helyes alakú ismeretlen email és hibás jelszó ugyanaz a `401 INVALID_CREDENTIALS`, üres details-szel. Ismeretlen usernél is valódi scrypt verify fut dummy rekorddal; teljes requestidő-azonosság nincs állítva. Siker előtt nincs Set-Cookie. Origin kötelező, hiánya/eltérése 403; közös register/login peer-korlát 429, foglaltság vagy DB/KDF/sign hiba 503, belső részletek nélkül.

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
  --data '{"email":"user@example.test","password":"Example-only-test-password1!"}'
curl -i -b /tmp/cloudvault-auth.cookies http://127.0.0.1:3000/api/v1/auth/me
curl -i -b /tmp/cloudvault-auth.cookies -c /tmp/cloudvault-auth.cookies \
  -H 'Origin: http://127.0.0.1:5173' -X POST http://127.0.0.1:3000/api/v1/auth/logout
curl -i -b /tmp/cloudvault-auth.cookies http://127.0.0.1:3000/api/v1/auth/me
rm -f /tmp/cloudvault-auth.cookies
```

Elvárt sorrend: 200 + cookie, 200 + user, 204 + törlés, 401. A terminál kimenete Set-Cookie-t tartalmazhat, ezért ne másold screenshotba/logba. A futtatási bizonyíték és korlátok a tesztriportban.

<a id="upload--első-képfeltöltési-szelet-tervezett"></a>

## Upload – első képfeltöltési szelet

**2026-10-24: az init és confirm implementált; a cleanup őrzött és retry-képes, de a jelenlegi adapter íráslezárási bizonyítéka hiányzik, ezért fizikai felszabadításra még nem képes. A frontend tervezett.** Ez az SZD2-2 előkészítése: egy init egy képet foglal, egy egyszeri presigned PUT után confirm következik. A teljes Core MVP videótámogatása és a kötelező SZD2 folytatható kötegimport ennél tágabb cél; az első szelet nem helyettesíti őket. Processor, thumbnail, import/session adatmodell és migráció külön feladat.

### Közös jogosultság és reprezentáció

- Teljes útvonalak: `POST /api/v1/files/uploads/init`, `POST /api/v1/files/{fileId}/confirm`.
- Mindkettő meglévő HttpOnly JWT-cookie-t, aktuális DB-felhasználót és a konfigurált frontenddel pontosan egyező `Origin` headert igényel. Előbb Origin-/auth-ellenőrzés, utána input és owner/state vizsgálat. Tiltott/hiányzó Origin `403 ORIGIN_NOT_ALLOWED`; elfogadott Origin mellett hiányzó/lejárt/invalid session `401 AUTH_REQUIRED`.
- `ownerId`, storage key, bucket, státusz, kvóta, detektált MIME és határidő mindig szerveroldali adat. A kliens ezeket nem választhatja meg. Confirmnál idegen és hiányzó file egységes `404 FILE_NOT_FOUND`; hibás UUID-alak `400 VALIDATION_ERROR`, létezésvizsgálat nélkül.
- Backend-válasz `Cache-Control: no-store`, valamint `X-Request-Id`; hibánál a közös nested wrapper és ebben a szeletben `details: {}`. Storage credential, nyers providerhiba és külön `storageKey` mező nincs az API-válaszban. A presigned URL természeténél fogva tartalmazhat object pathot, ezért maga is hozzáférést adó titok, nem naplózható metaadat.
- A `FileObject` reprezentáció mérete ennél a fájlméretkorlátnál biztonságos JSON egész szám; pending `detectedMimeType: null`. A pending fájl nem látszik aktív galériában, nem preview-zható, nem tölthető le és nem osztható meg.

### `POST /files/uploads/init`

Headerek: `Content-Type: application/json`, `Origin`, cookie és kötelező `Idempotency-Key`. Utóbbi a kliens által egyszer generált UUIDv4; nem auth-token. A kliens ugyanazon fájlkísérlet hálózati retry-jánál ugyanazt küldi, szándékos új feltöltéshez új kulcsot generál.

Request, pontosan három mezővel:

```json
{
  "originalName": "nyaralas.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 2457600
}
```

| Mező | Első szelet validációja |
|---|---|
| `originalName` | Jól formált Unicode string; külső whitespace trim és NFC-normalizálás után 1–255 kódpont. Üres, `.`/`..`, útvonal-elválasztó (`/`, `\`), C0/C1 vezérlőkarakter és bidi-vezérlő U+202A–U+202E/U+2066–U+2069 elutasított. Nem basename-kivágással javítjuk a beküldött útvonalat. Csak megjelenítési/letöltési név, storage key nem ebből készül. |
| `mimeType` | Pontosan `image/jpeg`, `image/png`, `image/webp` vagy `image/gif`, kisbetűsen, paraméter nélkül; a szerver konfigurációja ezt tovább szűkítheti. Video, HTML, SVG, JavaScript, XML és ismeretlen típus nem része ennek a képszeletnek. |
| `sizeBytes` | Pozitív, biztonságos JSON egész szám, numerikus string nélkül; legfeljebb a konfigurált `MAX_UPLOAD_BYTES`, abszolút plafon **104857600 bájt = 100 MiB** (régebbi dokumentumokban „100 MB”). Nulla/tört/negatív/rossz típus `400`; plafon feletti méret `413`. |

Extra mező, hibás típus vagy hiányzó/hibás idempotenciakulcs `400 VALIDATION_ERROR`; névhiba `400 INVALID_FILE_NAME`; nem engedett deklarált MIME `415 UNSUPPORTED_MEDIA_TYPE`. A kiterjesztés nem igazolja a tartalmat. Init még nem olvassa a fájlt, ezért nem állíthatja, hogy ténylegesen kép vagy dekódolható.

**Új művelet feldolgozása:** a backend előkészíti a még ki nem adott presigned műveletet, majd egy DB-tranzakcióban atomikusan foglalja a `(owner, init-művelet, Idempotency-Key)` azonosságot, ellenőrzi a kvótát, létrehozza a pending rekordot és növeli a reservationt. A kvótafeltétel `used + reserved + size <= limit`; az egyenlőség megengedett. Párhuzamos kéréseknél user-szintű szerializálás vagy feltételes atomikus update szükséges; külön SELECT és későbbi UPDATE nem elegendő. A válaszban PUT-jog csak sikeres commit után adható ki.

Rollbacknél sem új fájl, sem foglalás, sem sikeres műveletazonosság nem marad. A validáció/kvóta miatt elutasított, nem commitolt kérés kulcsa nem foglalt; a payload-konfliktus szabálya csak megőrzött sikeres műveletre érvényes. Előzetes presign-hibánál nincs kiadott URL és új foglalás. Ismeretlen kimenetelű commit/HTTP-timeout esetén a kliens **azonos kulccsal** kérdez újra; nem feltételezheti, hogy az init biztosan meghiúsult.

**Első siker: `201 Created`.** Az alábbi t0=10:00 példában az URL öt percig, a confirm tizenöt percig él:

```json
{
  "file": {
    "id": "018f4f35-20de-7a9c-a05a-6c5c9d4f1c32",
    "status": "PENDING_UPLOAD",
    "originalName": "nyaralas.jpg",
    "mimeType": "image/jpeg",
    "detectedMimeType": null,
    "sizeBytes": 2457600,
    "confirmBy": "2026-10-20T10:15:00.000Z"
  },
  "upload": {
    "method": "PUT",
    "url": "https://object-storage.example.test/synthetic-presigned-value",
    "expiresAt": "2026-10-20T10:05:00.000Z",
    "headers": {
      "Content-Type": "image/jpeg",
      "If-None-Match": "*"
    }
  }
}
```

Az URL szintetikus példa. A `headers` a ténylegesen alkalmazandó storage-headerek explicit listája. A `Content-Type` és `If-None-Match` értékei az aláíráshoz/feltételhez kötöttek: kihagyásuk vagy módosításuk storage-oldali elutasítást kell okozzon, különben az adatút nem felel meg a szerződésnek. Az `If-None-Match: *` aláírt, create-only PUT-védelem a jelenlegi adapter implementált védelme, amelyet a helyi HTTP/MinIO-próba igazolt (tesztriport). Valódi browser-ellenőrzés és a késői in-flight írások lezárása még nyitott kapu: az init nem old fel foglalást, a teljes upload-életciklus nincs kész.

### Init idempotencia és hálózati retry

| Eset | Válasz és hatás |
|---|---|
| Azonos owner + kulcs + normalizált név/MIME/méret, pending, URL még él | `200 OK`, ugyanaz a `file.id`, foglalás és eredeti két határidő. A PUT URL újra aláírható ugyanarra a célra, **legfeljebb az eredeti abszolút lejáratig**; nincs új fájl vagy új foglalás. |
| Megőrzött sikeres kulcs, eltérő normalizált payload | `409 IDEMPOTENCY_CONFLICT`, nincs változás. A kulcs nem fájltartalom-hash és nem duplikáltképfelismerés. |
| Párhuzamos azonos init | Egyetlen művelet és foglalás jöhet létre; a második a győztes commitját követően replay. Ha ezt nem lehet határidőn belül feloldani: `503 DATABASE_UNAVAILABLE`, ugyanazon kulccsal retry; nincs második rekord. |
| Pending, PUT URL lejárt, de `now < confirmBy` | `200 OK`, ugyanaz a pending `file`, `upload: null`; a már feltöltött objektumra confirm kérhető. A replay nem újítja meg az upload-jogot. |
| Saját fájl már `ACTIVE` | `200 OK`, aktuális aktív `file`, `upload: null`; nincs ismételt PUT vagy könyvelés. |
| Határidős/invalid/cleanupra lezárt művelet | `410 UPLOAD_EXPIRED`, illetve a korábbi tartalmi végkód: `413 FILE_TOO_LARGE` vagy `422 UPLOAD_VALIDATION_FAILED`; nincs újraélesztés vagy új foglalás. |
| Saját fájl később soft-deleted | `409 RESOURCE_STATE_CONFLICT`; init replay nem restore. |

A normalizált payload-azonosság és a sikeresen létrehozott init tartós, újraindítást túlélő nyilvántartást igényel. **A kezdeti migrációt egy új UploadOperation-migráció egészíti ki**; az `UploadOperation`, egyediség, terminális receipt és megőrzés pontos szerződése az [első upload-adatmodellben](data_model.md#első-képfeltöltés-adatmodell-szerződése--2026-10-23) szerepel. A Prisma-séma/migráció implementált; az init service implementált, a confirm service is implementált, a cleanup release-kapuja továbbra is nyitott. A sikeres művelet azonosságát legalább t0+24 óráig, és ezen túl is minden élő upload-jog, függő írás és lezáratlan cleanup megszűnéséig meg kell őrizni. A megőrzés nem növeli a PUT/confirm határidejét és nem őrizhet presigned URL-t. A garantált minimumablakon túl a kliens nem használhat újra régi kulcsot; egy kitakarított kulcs újrafelhasználására nincs deduplikációs garancia. Nem létező/idegen `fileId` publikus státuszából műveletazonosság nem következtethető ki; a belső receipt ownerhez kötött.

### Bináris PUT és implementáció előtti storage-kapuk

1. A browser közvetlenül a **publikusan, a böngészőből elérhető** storage URL-re küldi a kiválasztott teljes `File`/`Blob` tartalmát. A szerveroldali `minio:9000` cím nem browser-cím; az aláírt URL hostját nem szabad utólag szövegcserével módosítani. A két cím adapter-konfigurációja külön feladat.
2. Nem küld backend-cookie-t/JWT-t, nem használ tartós storage credentialt; a storage kérés credential-módja `omit`. A MinIO CORS csak az explicit frontend origint, a szükséges PUT/headereket engedje; a browsernek szükséges `ETag` header olvashatósága külön beállítandó. A CORS nem authorization és nem véd egy nem böngészős támadótól.
3. A kiadott jog csak egy szerveroldali véletlen kulcsra, egy privát bucketre és a rögzített feltételekre szólhat. A deklarált méret **storage-oldali kikényszerítését** is igazolni kell (például a ténylegesen aláírt, provider által ellenőrzött content-length révén). A böngésző a `Content-Length` értékét maga állítja; az API nem utasítja tiltott header kézi beállítására. A confirmkori méretellenőrzés önmagában nem védi a fizikai tárhelyet a túlméretes PUT-tól. Ha a kiválasztott adapter/browser kombináció nem képes kikényszeríteni, a szükséges adatútmódosítást előbb külön meg kell tervezni, nem szabad a korlátot garantáltnak nevezni.
4. Az aktívvá tett, ellenőrzött objektumot a régi PUT-jog nem módosíthatja. Az aláírt create-only feltétel megkerülhetetlenségét és a párhuzamos PUT-ok kezelését igazolni kell. A `HEAD` és a range-read ugyanazt a változatlan objektumot ellenőrizze; változó objektum aktiválása tilos. A [S3 presigned dokumentáció](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) szerint egy szokásos URL újra felhasználható és a meglévő kulcs felülírható; a rövid lejárat ezért nem helyettesíti a védelmet. Az [S3 conditional write](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html) a vizsgálandó create-only megoldás elsődleges forrása; ez nem bizonyítja automatikusan a helyi MinIO működését.
5. A storage 2xx válasza csak a bináris művelet sikere; utána confirm kell. Bizonytalan PUT-kimenetelnél előbb confirm, nem új init. A create-only `412` azt is jelentheti, hogy az előző PUT már sikerült; önmagában nem végleges alkalmazáshiba. Átmeneti storage/network hibánál a teljes fájl újraküldése csak az eredeti URL-időablakon belül, ugyanarra a pending műveletre megengedett. Végleges invalid tartalom nem írható át ugyanazon művelet alatt.
6. A storage saját HTTP/XML hibateste nem a backend JSON error wrapperje. A frontend nem mutat nyers providerüzenetet/URL-t, és nem talál ki belőle backend-domainkódot. Ellenőrzött állapotért confirm vagy az owner fájlmetaadata kérhető; lejárt, befejezetlen átvitelnél új művelet és új foglalás kell, a régi nem tűnik el automatikusan.

### `POST /files/{fileId}/confirm`

A kérésnek **nincs bodyja**, és nem fogad kliensoldali méret-, MIME-, hash-, storage key- vagy státuszállítást. Body nélküli POST-hoz `Content-Type` nem kötelező; nem üres body `400 VALIDATION_ERROR`. `Idempotency-Key` itt nem szükséges: az owner + `fileId` a művelet azonossága.

1. Origin, JWT/aktuális user, UUID és ownership ellenőrzés.
2. Saját `ACTIVE` fájl esetén azonnal `200` no-op; a régi `confirmBy` lejárata ilyenkor nem hiba. Saját `SOFT_DELETED` fájl `409 RESOURCE_STATE_CONFLICT`; confirm nem restore.
3. Tartalmi hibával már lezárt pending nem validálható újra; az eredeti terminális ok szerinti `413 FILE_TOO_LARGE` vagy `422 UPLOAD_VALIDATION_FAILED` marad érvényes. Egyéb pending esetén `now >= confirmBy` már `410 UPLOAD_EXPIRED`, akkor is, ha az objektum jelen van. Cleanup által lefoglalt vagy lezárt művelet nem versenyezhet aktiválással.
4. `HEAD`: létezés és tényleges méret; határ előtt hiányzó objektum `409 UPLOAD_NOT_READY`. Provider-access-denied/timeout nem tekinthető hiánynak. A tényleges méretnek pozitívnak, a deklarálttal azonosnak és a konfigurált limiten belülinek kell lennie. Túllépés `413 FILE_TOO_LARGE`; egyéb méreteltérés `422 UPLOAD_VALIDATION_FAILED`.
5. Bounded range-read és magic-number detektálás. A detektor az első 16 bájtot vizsgálja; az adapter If-Match feltételt és pontos range-választ követel; korlátlan teljes letöltés nem fallback. A detektált típusnak a fenti kép-allowlisten kell lennie és egyeznie kell a deklarált MIME-mal. Ismeretlen, hiányos signature vagy eltérés `422`. A storage metadata `Content-Type` önmagában nem bizonyíték; `ETag` nem hitelesített end-to-end checksum.
6. A `HEAD` és range alapján ellenőrzött objektum változatlanságának biztosítása után egy DB-tranzakció újból ellenőrzi a pending/cleanup állapotot és a határidőt, majd feltételesen `ACTIVE`-vá teszi a fájlt, elmenti a detektált MIME-ot és **ugyanannyi** bájtot visz át a reservedből a usedba. Az aktiválás és mindkét számláló együtt commitol/rollbackel. A tranzakció közben elért határidő már nem aktiválható.
7. Két párhuzamos confirmnál legfeljebb egy könyvelhet; a vesztes az aktuális állapot újraolvasásával ugyanazt az aktív fájlt adja vissza, vagy a közben lezárt/lejárt művelet stabil hibáját. DB-hibánál `503 DATABASE_UNAVAILABLE`, retry ugyanarra a `fileId`-ra. Sikeresen aktivált fájl API-timeout után is no-opként kérdezhető újra.

**Első és ismételt siker: `200 OK`, `{"file": <aktuális ACTIVE FileObject>}`**, a fent definiált, storage key és PUT URL nélküli reprezentációval. A siker a tárolási és típusvalidáció lezárása, **nem thumbnail-/processor-siker**. A magic number nem bizonyítja egy teljes kép sértetlenségét/dekódolhatóságát vagy malware-mentességét; a későbbi dekódolási/processor-hibát külön kell kezelni. A négy formátum szűk szignatúra-detektora implementált, teljes dekóder és új függőség nélkül; processor-végpont és derived kvóta továbbra is külön feladat.

### Lejárat, invalid tartalom és cleanup

- A szerver UTC ideje az irányadó: t0 az első sikeres init rögzített időpontja, `upload.expiresAt = t0 + 5 perc`, `confirmBy = t0 + 15 perc` alapértékkel. Config szűkítheti a PUT TTL-t; a fix confirm-határ ettől nem nő. Retry/replay egyik határt sem tolja ki. A PUT-jog a providercredential lejárata miatt ennél rövidebb is lehet; az API ténylegesen vállalható lejáratot adjon.
- `expiresAt <= now < confirmBy`: új PUT-jog nincs, de a már jelen lévő objektum még confirmálható. `now >= confirmBy`: pending már nem aktiválható. A 15 perc után beküldött sikeres storage-válasz sem írja ezt felül.
- `422`/`413` tartalmi elutasítás terminális a műveletre; ugyanarra a kulcsra nem fogadunk javított tartalmat. A cleanupig fennmaradó pending nem jelent újraaktiválható állapotot. E logikai lezárás tartós jelölése a tervezett UploadOperation REJECTED/EXPIRED állapota; cleanup utáni release-jelző mellett is megmarad az eredeti 413/422/410 ok. Ezek már létező Prisma-enumok; az állapotátmeneteket végző service még nem implementált.
- Érvényes, de még nem látható objektum `409` és átmeneti `HEAD`/range hiba `503 UPLOAD_VERIFICATION_UNAVAILABLE`: nincs aktiválás vagy reservation-release; a határidőn belüli confirm retry megengedett. A kliens korlátozott, növekvő késleltetéssel próbálkozzon, egyszerre egy confirmmal/fájllal; `429` esetén tartsa be a `Retry-After` headert, ha van.
- Cleanup és confirm ugyanazon tartós műveletért versengő állapotátmenetek: a cleanupnak előbb kizárólagosan le kell zárnia az aktiválhatóságot. Az `ACTIVE` állapotba már átment fájlt pending cleanup nem törölheti. Állapotlezárás és számlálóváltozás DB-szinten legyen egyszeri; object delete és DB-tranzakció nem közös atomikus művelet, ezért részhiba utáni retry kötelező.
- Foglalás csak akkor oldható fel, ha a foglalt bájtokhoz tartozó objektum bizonyítottan hiányzik/sikeresen törölték, **és a már kiadott feltöltési jogból nem keletkezhet későbbi objektum**. Az URL lejárta vagy egy pillanatnyi `HEAD 404` önmagában nem igazolja ezt: lejárat előtt megkezdett PUT és delete versenyezhet. A használt storage in-flight írásainak lezárási/korlátozási bizonyítéka az adapter implementációja előtti nyitott kapu. Korai invalid cleanup sem nyithatja meg újraírásra a kulcsot élő jog mellett. Bizonytalanságnál a reservation és cleanup-nyilvántartás megmarad; nincs hamis „felszabadult tárhely” válasz.
- Delete-, állapotmentési vagy cleanup-hibánál a foglalás megmarad és újrapróbálható. A hiba külső válasza nem ígéri a cleanup befejezését. Lezárt művelet idempotencia-receiptje a foglalás felszabadulása után is a fenti megőrzési ablakig él, hogy a kliens retry-ja ne indítson új fájlt.

### Első szelet hibaválaszai és kliensreakció

Az init/confirm által használt alábbi hibák implementáltak; a további fájlműveletek hibái tervezettek. `details: {}`; a táblázat a stabil kódra épülő reakciót rögzíti, nem providerüzenetet.

| HTTP | Kód | Mikor / kliensreakció |
|---:|---|---|
| 400 | `INVALID_REQUEST` / `VALIDATION_ERROR` | Hibás JSON / mező, UUID, body vagy init-kulcs; javítani kell, változatlan vak retry nem segít. |
| 400 | `INVALID_FILE_NAME` | A megadott név nem elfogadható; másik név/fájl szükséges. |
| 401 | `AUTH_REQUIRED` | Login szükséges; új session után a pending művelet ugyanazon init-kulccsal/fileId-val csak eredeti határidején belül folytatható. Saját ACTIVE confirm ettől függetlenül továbbra is no-op. |
| 403 | `ORIGIN_NOT_ALLOWED` | Hiányzó/eltérő Origin; konfiguráció/kérés javítása, nem storage-retry. |
| 404 | `FILE_NOT_FOUND` | Hiányzó vagy nem saját fájl azonos válasza; idegen fájl állapotáról nincs információ. |
| 409 | `IDEMPOTENCY_CONFLICT` | Ugyanahhoz a kulcshoz más normalizált payload; eredeti kérés ismétlése vagy tudatos új művelet új kulccsal. |
| 409 | `QUOTA_EXCEEDED` | Az új foglalás nem fér el; a kérés nem hozott létre új fájlt/foglalást. |
| 409 | `UPLOAD_NOT_READY` | Pending objektum még nincs a storage-ban; PUT bizonytalan kimenetele után confirm retry a határig. |
| 409 | `RESOURCE_STATE_CONFLICT` | Saját fájl nem megfelelő állapotú; soft-deleted fájlt nem aktivál újra. |
| 410 | `UPLOAD_EXPIRED` | Lejárt/határidő miatt lezárt pending; új feltöltési kísérlet új kulccsal, régi cleanup külön marad. |
| 413 | `FILE_TOO_LARGE` | Fájlméretplafon túllépése, nem a kis JSON-body méretkorlátja; confirmnál cleanup szükséges. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Init MIME nem támogatott ebben a képszeletben. |
| 422 | `UPLOAD_VALIDATION_FAILED` | Terminális tartalmi/méretazonossági hiba; nincs aktív fájl és automatikus ugyanazon-művelet PUT retry. |
| 429 | `RATE_LIMITED` | Useralapú init/confirm és összes drága storage-verifikáció korlátja; konkrét kezdeti értékek implementáció előtt rögzítendők, a byte-kvóta önmagában nem request-limit. |
| 503 | `STORAGE_UNAVAILABLE` | Presign/storage infrastruktúrahiba; init retry ugyanazzal a kulccsal. |
| 503 | `UPLOAD_VERIFICATION_UNAVAILABLE` | HEAD/range átmeneti hiba vagy objektumazonosság nem igazolható; confirm retry, reservation változatlan. |
| 503 | `DATABASE_UNAVAILABLE` | Átmeneti DB-/konkurenciahiba; ugyanaz a kulcs/fileId, nem új foglalás. |
| 500 | `INTERNAL_ERROR` | Ismeretlen hiba, biztonságos generikus válasz és request ID. |

### Implementált első frontend-illesztés – 2026-10-24

A `/app` képfeltöltő panel legfeljebb 20 fájlt, két párhuzamos munkafolyamatot kezel. Fájlonként memóriában megtartott UUIDv4 az init Idempotency-Key; az első sikeres init fileId-ja a confirm azonossága. A kliens a változatlan File méretét, a legfeljebb 16 fejlécbájtból felismert MIME-t és az ehhez illesztett trim+NFC feltöltési nevet küldi; a backend validációja marad az irányadó. API fetch: credentials include, no-store, redirect error, 10 másodperces időkorlát a body olvasására is; confirm body és Content-Type nélkül.

A teljes File külön originre menő XHR PUT-tal kerül a kapott URL-re, kizárólag Content-Type/If-None-Match headerekkel, withCredentials=false és 120 másodperces kliens időkorláttal. Content-Length-et a browser állít. A frontenddel azonos storage origin tiltott: XHR ott withCredentials=false esetén is használna same-origin cookie-kat ([XHR standard](https://xhr.spec.whatwg.org/#the-withcredentials-attribute)). Az upload progress nem storage- vagy alkalmazásoldali sikerbizonyíték ([XHR upload](https://xhr.spec.whatwg.org/#the-upload-attribute)); csak ACTIVE confirm után kész a sor. Nyers XML/providertext, URL és credential nem jelenik meg/logolódik; File/capability nincs tartós browser-storage-ban.

Nincs automatikus újrafoglalás. Bizonytalan init ugyanazzal a kulccsal ismételhető; bármely megkísérelt PUT után előbb confirm következik, ideértve a 412-t és hálózati hibát. Csak UPLOAD_NOT_READY után, élő eredeti joggal indulhat új teljes PUT. Lejárt/null upload mellett is előbb confirm ellenőrzi a korábbi sikert. Az átmeneti hiba kézi retry-t kap növekvő 1–30 másodperces várakozással; 429 legalább 60 másodperc és a CORS-on át olvasható Retry-After szerinti hosszabb várakozás. AUTH_REQUIRED megállítja az új sorok indítását.

A köteg állapota oldalmemória; navigáció után nem állítható vissza, a reservation nem oldódik fel. Ez nem tartós import-szerződés vagy valódi resume. Az API nem kap új batch/resume/renew/cancel végpontot. A felület teljes valós böngészős/DB/storage próbája és a 7. pont tesztriportja még nyitott.

### Első szelet és a későbbi valódi folytatható import határa

| Első képfeltöltési szerződés | Kötelező későbbi SZD2-kiegészítés |
|---|---|
| Egy init-kulcs → egy fájl és foglalás; teljes fájl egy PUT-ban. | Tartós import-, fájl- és transfer-session azonosság, több fájl koordinációja és korlátozott párhuzamosság. |
| Init/confirm retry nem könyvel kétszer; hálózati PUT-retry elölről küldhet. | Megszakadt fájl a ténylegesen átvett bájtoktól folytatódik, kész fájlok újraküldése nélkül. |
| Fix rövid PUT-jog és fix confirm-határ; nincs renew/resume/cancel endpoint. | Backend által jogosított folytatás, session-/credential-megújítás, retry/cancel/expiry és részleges adatok cleanupja. |
| Magic-number validált eredeti, processor-siker ígérete nélkül. | Verziózott thumbnail és metadata processor, tartós job/result, független retry és worker-restart recovery; eredeti/derived kvóta és lifecycle. |
| Nem szolgáltat batch-progress vagy import-level idempotencia garanciát. | Per-file progress/részleges hiba, import-level dedupe, ellenőrzött hálózati megszakítás és újraküldöttbájt-mérés. |

A tus/Uppy és S3 multipart vizsgálandó alternatívák, nem kiválasztott implementációk. A [terv](../plan.md), [roadmap](../milestones.md) és [ADR-009](../02_architecture/adr/ADR-009-defer-multipart-upload.md) szerinti PoC/ADR előzi meg a választást. Ebben a dokumentációs körben nem jön létre új protokoll, függőség, Prisma-séma, migration, végpont vagy tesztkód. Az első upload részletes adatmodellje dokumentált a fenti hivatkozáson; a séma/migráció implementált; a storage adapter is elkészült, az init service is elkészült, a confirm service is elkészült; processor és a cleanup íráslezárási kapujának feloldása külön feladat.

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

## Upload-init implementációs részletek – 2026-10-24

A `FilesController` az authból kapott ownerrel hívja a service-t. Az új init válasza 201, az azonos művelet replay-je 200; a válasz és minden HTTP-hiba `Cache-Control: no-store`. A JSON Content-Type kötelező (`application/json`, opcionális UTF-8 charset); a UUIDv4 kulcs kisbetűsre normalizált. Nincs új dependency, séma vagy migráció.

A service az előzetesen ki nem adott URL-t DB-záron kívül készíti elő, majd ugyanabban a Prisma-tranzakcióban zárolja a User sort, ellenőrzi a kvótát BigInt aritmetikával, létrehozza a fájlt/receiptet és növeli a reservedet. Meglévő műveletnél User → FileObject → UploadOperation zárolás és újraolvasás történik. Külső presign után a zárolt állapot-/határidő-ellenőrzés ismét kötelező; konkurens új init vesztesének URL-je nem adható vissza. A szolgáltatás az adapter tényleges lejáratát tárolja, nem hosszabbít replaykor. A PostgreSQL tranzakcióban lokális lock_timeout 3s, statement_timeout 4s; Prisma maxWait és transaction timeout 5s. Konkurencia-/DB-hiba 503, nem új művelet.

Az OPEN receipt confirm-határidején elért replay tartósan EXPIRED-re zár, és csak a commit után ad 410-et; sem used, sem reserved nem változik. A végleges 413/422/410 és az ACTIVE/SOFT_DELETED replay ágak új storage-aláírás nélkül működnek. A későbbi cleanup-kiegészítés már sweepert futtat; a proof nélküli kvótafelszabadítás továbbra is tiltott.

Kezdeti visszaélésvédelem: hitelesített userenként 30 init/replay kérés / 60s, legfeljebb 4096 élő limiter-bejegyzéssel. Telített limitertábla vagy túllépés 429. Ez folyamatonkénti, újrainduláskor törlődő védelem, nem elosztott kvóta; a tartós bájtfoglalást a DB külön garantálja. A confirm már használható a sikeres PUT után.

## Confirm és cleanup implementáció – 2026-10-24

A `POST /api/v1/files/{fileId}/confirm` az Origin → aktuális cookie/session → bodyless/rate guard → UUID → ownership sorrendet követi. Nem igényel JSON Content-Type-ot vagy Idempotency-Key-t. Üres POST támogatott; minden pozitív Content-Length, Transfer-Encoding és parsed body (az üres JSON objektum is) 400. A kezdeti limiter 60 kérés/user/perc, legfeljebb 4096 élő bejegyzéssel, folyamatonként. Siker és ACTIVE replay egyaránt explicit 200, no-store.

A service előbb zároltan ellenőrzi az owner/állapot/határidőt, majd SQL-záron kívül HEAD és ETag-hez kötött, maximum 16 bájtos prefixolvasás történik. A MIME-ot a szignatúra és a konfiguráció alapján ellenőrzi; a provider Content-Type-ja nem bizonyíték. A végső User → FileObject → UploadOperation tranzakció újraellenőrzi a friss állapotot és a változatlan méret/MIME/key/művelet/deadline adatokat. Egyetlen commit aktivál, FINALIZED-re zár, reservedből used-ba könyvel és `UPLOAD_CONFIRMED` auditot ír. Nincs automatikus processorindítás. ACTIVE replay receipt nélkül is működik, storage-I/O és új audit nélkül.

Szignatúra-/mérethiba tartós REJECTED 413/422, átmeneti HEAD/range hiba 503 és OPEN marad. Hiányzó objektum határidő előtt 409. A provider-I/O vagy az utolsó DB-írás alatt elért határidőnél a frissebb terminális állapot dönt; a még nyitott művelet EXPIRED 410-re zár. SQL-rollback és új ellenőrzés akadályozza meg a késői aktiválást/hibakódot.

A cleanup belső worker, nincs nyilvános cleanup-végpont. Percenként legfeljebb 50 esedékes pending műveletet vizsgál, egy folyamatban átfedés nélkül. Az OPEN lejár, a REJECTED ok változatlan. Hiányzó/jövőbeli `writesClosedAt` esetén **nincs HEAD vagy DELETE**, a reservation és objektum megmarad; `cleanupLastErrorCode = WRITE_CLOSURE_UNPROVEN`, kezdetben 60s, duplázódó, maximum 1h retry-idő kerül mentésre. A current adapter ezt a bizonyítékot nem állítja elő: URL-lejáratból vagy 404-ből a worker sem gyártja le.

Csak korábban, megbízható backend/storage-tényből rögzített íráslezárás után érhető el a védett delete/absence/egyszeri release ág. A bizonyítékmezőhöz nincs admin/user setter. Az ág unit tesztjei szintetikus bizonyítékot használnak; ez nem valós provider-proof. Aktív/finalizált vagy már released fájl kimarad, objecthiba retry-t és változatlan foglalást jelent. A release tranzakció ismét ellenőrzi a bizonyítékot és az objektumazonosságot, egyetlen lépésben módosítva a reservedet és release-jelzőt. Receipt-pruning és aktív fájl purge nincs. Leállításkor új batch/fájl nem indul, az aktuális fájl próbájának végét megvárja.

Operátori egyköteges futtatás: `npm run uploads:cleanup`, aggregált számlálókkal. A jelenlegi proof nélküli pendingeknél a blocked kimenet elvárt, nem sikeres fizikai takarítás.

## Kliensoldali formátumkorrekció – 2026-10-27

Az init HTTP-szerződése változatlan. A frontend név/méret után, init előtt csak az első 16 bájtot olvassa, az ADR-008 négy szűk signature-jével egyező osztályozással. A browser MIME üres/hibás értéke és az eltérő kiterjesztés nem elutasítási ok, ha a fejléc támogatott képet jelez. JPEG esetén `.jpg`/`.jpeg`, más típusnál a saját kiterjesztése marad; eltérő/hiányzó suffix kanonikus `.jpg`/`.png`/`.gif`/`.webp` lesz. A stem szükség esetén Unicode-kódpontok mentén rövidül a 255-ös névhatárig. A korábbi veszélyesnév-validáció nincs megkerülve.

A File új név/MIME-metaadatot kap változatlan bájtokkal/mérettel/lastModified-dal; az eredeti kliensfájl érintetlen. Ez a korrigált példány és az init payload cache-elt, ezért egy hálózati init-retry nem változtat a fingerprinten ugyanazon kulcs mellett. A UI az eredeti kiválasztott nevet és a korrekciós jelzést is mutatja. Olvasási hiba helyi FILE_READ_FAILED, ismeretlen fejléc helyi UNSUPPORTED_MEDIA_TYPE: egyik sem indít API-kérést vagy foglalást; FILE_READ_FAILED nem új backend hibakód. A fejléc olvasása után is újra ellenőrizzük a dispose/session állapotot.

A backend az új deklarációt sem tekinti hitelesnek: confirmnál saját tárolóolvasással továbbra is egyezést követel. Közvetlen API-kliens téves MIME-deklarációja továbbra is 422. A korrekció nem konvertálás, teljes dekódolás vagy végleges sértetlenségi bizonyíték.
