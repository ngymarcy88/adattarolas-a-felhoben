# Hibakezelési szerződés

**Részben implementált: generikus HTTP hibakeret és request ID. A regisztráció hibái is implementáltak; a többi domainhiba tervezett.**

A scaffold globális exception filtert és request-ID middleware-t tartalmaz. A filter biztonságos, magyar generikus HTTP-üzeneteket és az alábbi nested wrappert adja; ismeretlen kivétel `500 INTERNAL_ERROR`. Hibás JSON `400 INVALID_REQUEST`, túl nagy request `413 REQUEST_TOO_LARGE`, nem támogatott JSON-karakterkészlet vagy Content-Encoding `415 UNSUPPORTED_MEDIA_TYPE`; explicit CORS-elutasítás `403 ORIGIN_NOT_ALLOWED`. A regisztráció DTO-pipe-ja `400 VALIDATION_ERROR`, unique-email hibája `409 EMAIL_ALREADY_EXISTS`, guardja `429 RATE_LIMITED`, foglaltság/hash/DB hibája `503 SERVICE_UNAVAILABLE`; üres details és biztonságos üzenet. A többi domainkatalógus/auth/provider-mapping tervezett. A tényleges ellenőrzési eredményt a [tesztriport](../04_quality/test_report.md) tartalmazza.

## Kanonikus error wrapper

Az implementált generikus hibák és a később megvalósítandó domainhibák közös célalakja a következő. Az alábbi upload-hiba jelenleg tervezett példa:

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

| Mező | Szerződés |
|---|---|
| `error.code` | Stabil, géppel feldolgozható, angol `UPPER_SNAKE_CASE` kód. A frontend erre ágazhat. |
| `error.message` | Rövid, felhasználóbarát magyar üzenet. Nem tartalmaz belső részletet; szövege lokalizációval később változhat. |
| `error.details` | Opcionális, allowlistelt JSON. Alapértelmezés `{}`; csak javítható input- vagy állapotadat kerülhet bele. |
| `error.requestId` | Nem érzékeny korrelációs azonosító, amely a response `X-Request-Id` headerében is szerepel. |

A sikeres válaszoknak nincs kötelező közös wrapperük.

## Request ID

- A backend minden kéréshez szerver által megbízhatónak tekintett request ID-t biztosít.
- Implementált szabály: a kliens `X-Request-Id` értéke csak 1–64 ASCII betű, szám, `_` vagy `-` esetén vehető át; egyébként szerveroldali véletlen UUID készül.
- Implementált: ugyanaz az ID szerepel a hibabodyban és a response headerben; 5xx esetén a generikus hibalogban is. Auditírás és általános requestlog még nincs.
- Request ID nem kódolhat user-, file-, token- vagy storage-adatot.

## Implementált generikus mapping

A filter 400/401/403/404/405/409/413/415/429/503 HTTP-státuszhoz rendre `INVALID_REQUEST`, `AUTH_REQUIRED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `METHOD_NOT_ALLOWED`, `RESOURCE_STATE_CONFLICT`, `REQUEST_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` kódot használ; az explicit Origin-hiba `ORIGIN_NOT_ALLOWED`. Más kivétel generikus `INTERNAL_ERROR`. Ezek HTTP-leképezések: önmagukban nem jelentenek auth-, rate-limit- vagy domainfunkciót. A `details` jelenleg mindig `{}`; a framework/provider eredeti message/body/stack mezői nem kerülnek a válaszba.

## HTTP- és domainhibakód-katalógus (a regisztráció fenti kódjai implementáltak, a többi tervezett)

### Közös, auth és request hibák

| HTTP | Kód | Jelentés és biztonsági szabály |
|---:|---|---|
| 400 | `INVALID_REQUEST` | Hibás JSON, ismeretlen vagy rossz alakú közös request |
| 400 | `VALIDATION_ERROR` | Regisztráció implementált, `details: {}`; más DTO-knál a tervezett `details.fields` csak mezőnevet és stabil okot tartalmazhat |
| 400 | `CURSOR_INVALID` | Nem dekódolható, rossz verziójú vagy manipulált cursor |
| 401 | `AUTH_REQUIRED` | Hiányzó, lejárt vagy érvénytelen JWT-cookie |
| 401 | `INVALID_CREDENTIALS` | Login hiba; email- és jelszóhiba azonos válasza |
| 403 | `ORIGIN_NOT_ALLOWED` | Unsafe kérés hiányzó vagy nem allowlistelt Originnel |
| 404 | `FILE_NOT_FOUND` | Nem létező és más ownerhez tartozó védett fájl egységes válasza |
| 404 | `RESOURCE_NOT_FOUND` | Nem fájl típusú, nem érzékeny resource hiánya |
| 409 | `EMAIL_ALREADY_EXISTS` | Regisztrációs unique conflict, normalizált email visszaadása nélkül |
| 409 | `RESOURCE_STATE_CONFLICT` | Létező saját resource nem engedett állapotban van |
| 429 | `RATE_LIMITED` | Abuse limit; opcionális `Retry-After` header, raw identity részlet nélkül |
| 500 | `INTERNAL_ERROR` | Nem várt hiba; külső bodyban nincs stack vagy providerüzenet |
| 503 | `DATABASE_UNAVAILABLE` | Átmeneti metadata-store hiba |
| 503 | `STORAGE_UNAVAILABLE` | Átmeneti object storage/presign hiba |

### Upload, fájl és kvóta

| HTTP | Kód | Jelentés és kliensreakció |
|---:|---|---|
| 400 | `INVALID_FILE_NAME` | Nem normalizálható vagy tiltott fájlnév; másik név/fájl választható |
| 409 | `QUOTA_EXCEEDED` | `used + reserved + requested` meghaladná a limitet |
| 409 | `UPLOAD_NOT_READY` | Az objektum a 15 perces határ előtt még nem látható; confirm később megismételhető |
| 410 | `UPLOAD_EXPIRED` | A pending confirm határideje lejárt; új upload init szükséges |
| 413 | `FILE_TOO_LARGE` | A deklarált vagy tényleges méret meghaladja a 100 MB-os Core limitet |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | A deklarált MIME nincs a pontos allowlisten |
| 415 | `PREVIEW_NOT_ALLOWED` | A fájl letölthető lehet, de inline preview nem engedélyezett |
| 422 | `UPLOAD_VALIDATION_FAILED` | `HEAD` méreteltérés, MIME/magic mismatch, unknown vagy sérült tartalom |
| 503 | `UPLOAD_VERIFICATION_UNAVAILABLE` | `HEAD` vagy bounded range-read átmeneti storage-hibája; confirm retry lehetséges |

Az engedélyezett MIME-ok: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`.

Az `ACTIVE` fájl ismételt confirmja nem hiba: `200 OK`, ugyanaz a reprezentáció és nulla új számlálómódosítás. Invalid/abandoned cleanup storage-hibája belső retry-állapot; nem szabad azt állítani a kliensnek, hogy reservation már felszabadult.

### Lifecycle és sharing

| HTTP | Kód | Jelentés és biztonsági szabály |
|---:|---|---|
| 409 | `RESTORE_NOT_ALLOWED` | Saját fájl nem soft-deleted vagy a 30 napos restore-ablak lejárt |
| 404 | `SHARE_LINK_INVALID_OR_EXPIRED` | Invalid, lejárt vagy nem aktív fájlra mutató token egységes publikus válasza |
| 400 | `SHARE_EXPIRY_INVALID` | Expiry nem a létrehozástól számított 1 óra–7 nap tartományban van |

Share-hiba nem tükrözi vissza a tokent, hash-t, file ID-t vagy lejárat pontos okát. Soft delete végleg törli a fájl meglévő share-link rekordjait; restore után a régi token továbbra is `SHARE_LINK_INVALID_OR_EXPIRED` eredményt ad.

### Opcionális MI

| HTTP | Kód | Jelentés és core-hatás |
|---:|---|---|
| 404 | `AI_SUGGESTION_NOT_FOUND` | Nem létező vagy nem saját javaslat, existence-hiding válasszal |
| 409 | `AI_SUGGESTION_STATE_CONFLICT` | Például nem `READY` suggestion accept/reject kérése |
| 415 | `AI_IMAGE_REQUIRED` | A resource nem támogatott aktív kép |
| 422 | `AI_RESPONSE_REJECTED` | Nem biztonságos, biometrikus/szenzitív vagy nem validálható providereredmény |
| 503 | `AI_UNAVAILABLE` | Timeout/providerhiba; a core fájlműveletek változatlanul elérhetők |

Más user fájljára indított MI-kérés `404 FILE_NOT_FOUND`, nem MI-specifikus existence leak.

## Validációs details

Csak javítható kliensinputnál használható:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ellenőrizd a megadott adatokat.",
    "details": {
      "fields": [
        {
          "field": "displayName",
          "reason": "TOO_LONG"
        }
      ]
    },
    "requestId": "req_01J2EXAMPLE"
  }
}
```

Nem kerülhet `details` mezőbe:

- beküldött jelszó vagy hash;
- JWT, cookie vagy auth header;
- raw share token vagy token hash;
- presigned URL, storage key vagy credential;
- SQL, stack trace, belső hostnév vagy provider response;
- fájltartalom, bounded range byte-ok vagy nyers MI input/output;
- más felhasználó személyes vagy resource adata.

## Provider- és framework-hibák leképezése

| Belső forrás | Tervezett külső mapping |
|---|---|
| DTO/class-validator hiba | `400 VALIDATION_ERROR`, allowlistelt field/reason |
| JWT hiány/lejárat/signature hiba | `401 AUTH_REQUIRED`, technikai ok nélkül |
| Login compare failure vagy ismeretlen email | `401 INVALID_CREDENTIALS`, azonos időzítési és üzenetpolicy |
| Nem allowlistelt Origin | `403 ORIGIN_NOT_ALLOWED` |
| Prisma email unique conflict | `409 EMAIL_ALREADY_EXISTS` |
| Nem owner vagy hiányzó FileObject | `404 FILE_NOT_FOUND` |
| Prisma ismert átmeneti connectivity hiba | `503 DATABASE_UNAVAILABLE` |
| Ismeretlen Prisma/programozási hiba | `500 INTERNAL_ERROR`; belső strukturált log |
| Storage object-not-found confirm előtt | Határ előtt `UPLOAD_NOT_READY`, határ után `UPLOAD_EXPIRED` |
| Storage timeout/throttle/range-read hiba | `503 STORAGE_UNAVAILABLE` vagy `UPLOAD_VERIFICATION_UNAVAILABLE` |
| Deklarált/tényleges méret vagy MIME/magic eltérés | `422 UPLOAD_VALIDATION_FAILED` |
| Invalid/expired share token | `404 SHARE_LINK_INVALID_OR_EXPIRED` |
| MI timeout vagy provider 5xx | `503 AI_UNAVAILABLE` és biztonságos `FAILED` suggestion, ha rekord már létrejött |
| Ismeretlen kivétel | `500 INTERNAL_ERROR` |

A provider konkrét státusza, request ID-ja, hostja és response bodyja nem kerül külső válaszba. Belső logban is csak a redakció után szükséges hibakategória és saját request ID tárolható.

## Retry és idempotencia

| Művelet | Kliens retry |
|---|---|
| Login/register | Csak felhasználói döntéssel; vak automatikus retry nem javasolt |
| Upload init | Timeoutnál óvatosan: a kliens előbb a perzisztált állapotot kérje le vagy az új initből keletkező külön pending rekord cleanupját fogadja el |
| Upload confirm | Ugyanarra a `fileId`-ra biztonságosan ismételhető; első siker után no-op |
| Lista/read URL | Átmeneti 503 vagy lejárt read URL után újrakérhető |
| Delete/restore | Csak a dokumentált állapot- és idempotenciaszabállyal ismételhető |
| Share create | Nem tekinthető automatikusan idempotensnek; response elvesztése új raw tokent eredményezhet |
| MI request | Nem automatikus; minden új providerhívás explicit user trigger |
| MI accept/reject | Ugyanarra a végállapotra no-op vagy stabil conflict, kanonikus metadata nem írható kétszer |

## Backend felelősségek

- A controllerek DTO-t validálnak és vékonyak maradnak.
- A service réteg stabil domain hibát ad, nem provider kivételt.
- A globális exception filter építi a nested wrapper alakot és az HTTP mappinget.
- A request-ID réteg a controller előtt fut.
- Az internal log teljes stack trace-t csak védett fejlesztői/operációs környezetben kezelhet; frontendnek soha nem küldi.
- Minden state-changing hibaág megőrzi az adatmodell tranzakciós invariánsait.
- Auditírás hibája nem írhatja felül az eredeti üzleti hibát és nem okozhat secret leaket; külön operációs jelzést igényel.

## Tervezett frontend felelősségek

A jelenlegi health kliens csak a státusz és válaszforma ellenőrzését végzi, hiba esetén generikus üzenetet mutat. Az alábbi domainkód-alapú frontend viselkedések még nincsenek implementálva.

- A frontend a `code` alapján választ user-facing állapotot; nem parse-olja a `message` szöveget.
- `AUTH_REQUIRED` loginra irányíthat, de megőrzi a secret nélküli navigációs szándékot.
- `VALIDATION_ERROR` mezőhibái csak ismert mezőkhöz köthetők.
- `UPLOAD_VALIDATION_FAILED`, `QUOTA_EXCEEDED` és `UPLOAD_EXPIRED` külön, cselekvést javasló állapotot kap.
- `AI_UNAVAILABLE` nem alakíthatja globális storage-hibává a képernyőt.
- Ismeretlen kód generic hibaüzenetet és a request ID másolási lehetőségét adja.

## Tervezett unit verifikáció

- Minden katalóguskód pontos HTTP-status és wrapper alak ellenőrzése.
- Más owner és nem létező file azonos `404 FILE_NOT_FOUND` válasza.
- Login identity-enumeration és Origin-elutasítás.
- DTO field details allowlist és tiltott értékek redakciója.
- Ismételt confirm `200` no-op és pontosan egyszeri accounting.
- Provider timeout, object-not-found, magic mismatch és ismeretlen kivétel mapping.
- Share invalid/expired/non-active és restore után is invalid régi token egységes válasza.
- MI-provider hiba izolációja.
- Stack, token, URL, credential és fájltartalom hiánya response-ból és log payloadból.
