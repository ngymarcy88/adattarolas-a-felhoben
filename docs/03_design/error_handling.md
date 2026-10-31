# Hibakezelési szerződés

**Részben implementált: generikus HTTP hibakeret és request ID. A regisztráció, login/logout/me, GET /files és preview-url hibái is implementáltak; a többi domainhiba tervezett.**

A scaffold globális exception filtert és request-ID middleware-t tartalmaz. A filter biztonságos, magyar generikus HTTP-üzeneteket és az alábbi nested wrappert adja; ismeretlen kivétel `500 INTERNAL_ERROR`. Hibás JSON `400 INVALID_REQUEST`, túl nagy request `413 REQUEST_TOO_LARGE`, nem támogatott JSON-karakterkészlet vagy Content-Encoding `415 UNSUPPORTED_MEDIA_TYPE`; explicit CORS-elutasítás `403 ORIGIN_NOT_ALLOWED`. A regisztráció DTO-pipe-ja `400 VALIDATION_ERROR`, unique-email hibája `409 EMAIL_ALREADY_EXISTS`, guardja `429 RATE_LIMITED`, foglaltság/hash/DB hibája `503 SERVICE_UNAVAILABLE`; üres details és biztonságos üzenet. Login: `401 INVALID_CREDENTIALS`; cookie/token/DB-user hiány a `/me` guardban `401 AUTH_REQUIRED`; auth DB/KDF/sign vagy kapacitáshiba `503 SERVICE_UNAVAILABLE`. Login/logout Origin és login DTO/rate-limit implementált. A többi domain/provider-mapping tervezett. A tényleges ellenőrzési eredményt a [tesztriport](../04_quality/test_report.md) tartalmazza.

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

## HTTP- és domainhibakód-katalógus (a fenti auth kódok implementáltak, a többi tervezett)

### Közös, auth és request hibák

| HTTP | Kód | Jelentés és biztonsági szabály |
|---:|---|---|
| 400 | `INVALID_REQUEST` | Hibás JSON, ismeretlen vagy rossz alakú közös request |
| 400 | `VALIDATION_ERROR` | Regisztráció implementált, `details: {}`; más DTO-knál a tervezett `details.fields` csak mezőnevet és stabil okot tartalmazhat |
| 400 | `CURSOR_INVALID` | Nem dekódolható, rossz verziójú/scope-ú vagy hibás szerkezetű cursor; nem aláírt jogosultság |
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
| 409 | `IDEMPOTENCY_CONFLICT` | Azonos owner/init-kulcs eltérő normalizált payloadhoz; nincs új fájl vagy foglalás |
| 409 | `QUOTA_EXCEEDED` | `used + reserved + requested` meghaladná a limitet |
| 409 | `UPLOAD_NOT_READY` | Az objektum a 15 perces határ előtt még nem látható; confirm később megismételhető |
| 410 | `UPLOAD_EXPIRED` | A pending confirm határideje lejárt; új upload init szükséges |
| 413 | `FILE_TOO_LARGE` | A deklarált vagy tényleges méret meghaladja a konfigurált plafont (legfeljebb 104857600 bájt = 100 MiB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | A deklarált MIME nincs a pontos allowlisten |
| 415 | `PREVIEW_NOT_ALLOWED` | A fájl letölthető lehet, de inline preview nem engedélyezett |
| 422 | `UPLOAD_VALIDATION_FAILED` | `HEAD` méreteltérés, MIME/magic mismatch, unknown/hiányos signature; nem teljes képsértetlenségi vizsgálat |
| 503 | `UPLOAD_VERIFICATION_UNAVAILABLE` | `HEAD` vagy bounded range-read átmeneti storage-hibája; confirm retry lehetséges |

Az első képszelet MIME-jai: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, a konfigurációval tovább szűkíthetően. A tágabb tervezett Core MIME-lista videót is tartalmaz (`video/mp4`, `video/webm`), de ezek nem az első képfeltöltési szelet részei. A pontos init/confirm, TTL, idempotencia és retry szerződés az [API Upload szakaszában](api.md#upload--első-képfeltöltési-szelet-tervezett) szerepel.

Az `ACTIVE` fájl ismételt confirmja nem hiba: `200 OK`, ugyanaz a reprezentáció és nulla új számlálómódosítás. A cleanupnak ki kell zárnia a confirm-aktiválást és a későbbi PUT-befejezésből történő objektum-újrakeletkezést; URL-lejárat vagy pillanatnyi 404 önmagában nem bizonyíték. Invalid/abandoned cleanup storage-hibája belső retry-állapot; nem szabad azt állítani a kliensnek, hogy reservation már felszabadult.

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
| Upload init | Timeout/503 után ugyanaz az ownerhez kötött `Idempotency-Key` és normalizált payload; egy fájl/foglalás, változatlan határidők. Eltérő payload 409; garantált megőrzés legalább 24 óra és minden nyitott storage/cleanup életciklusa. Új kísérlethez új kulcs, nem vak új init |
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

## Implementált belső storage-hibák

A storage adapter `StorageError` kódjai: `INVALID_ARGUMENT`, `NOT_FOUND`, `OBJECT_CHANGED`, `INVALID_RESPONSE`, `UNAVAILABLE`. A publikus üzenet mindig generikus; SDK-cause, URL és credential nem kerül bele. A HEAD csak meglévő/elérhető bucket ellenőrzése után adhat nullt; más konfigurációs vagy hálózati hiba nem objektumhiány. Az `OBJECT_CHANGED` a feltételes olvasás 412/416 hibája, nem engedély automatikus aktiválásra. Ezek belső hibák; az upload HTTP-mapping és tartós hibareceipt az init/confirm implementációjánál készül el.

## Upload-init implementált hibák – 2026-10-24

Az init a dokumentált VALIDATION_ERROR, INVALID_FILE_NAME, UNSUPPORTED_MEDIA_TYPE, FILE_TOO_LARGE, QUOTA_EXCEEDED, IDEMPOTENCY_CONFLICT, RESOURCE_STATE_CONFLICT, UPLOAD_EXPIRED, UPLOAD_VALIDATION_FAILED, DATABASE_UNAVAILABLE és STORAGE_UNAVAILABLE domainkódokat használja a megfelelő állapotokban. A 413/422 tartalmi végkódok jelenleg megőrzött receipt-replay ágak; új tartalomellenőrzést az init nem végez. Origin/session/limiter a DTO előtt fut. Az upload service az ismeretlen DB-/commit-hibát is maszkolt DATABASE_UNAVAILABLE válasszal zárja; a kliens ugyanazt az idempotenciakulcsot használja. A filter minden hibára no-store-t állít, és nem adja tovább a provider/Prisma üzenetet.

## Első képgaléria/preview – lista/preview implementált, 2026-10-27

A GET /files és GET /files/{fileId}/preview-url hibái implementáltak. Az [API részletes szerződése](api.md#fájllista-és-lifecycle) rögzíti a mappinget. GET /files: hibás limit/extra query VALIDATION_ERROR 400; üres/ismételt/rossz/max512 fölötti cursor CURSOR_INVALID 400. A v1 tuple cursor nem aláírt: egy szerkezetileg helyes, módosított pozíció nem szükségszerűen hiba; az owner/state/type szűrés minden esetben kötelező. Üres lista 200, DB-hiba DATABASE_UNAVAILABLE 503, nem hamis üres eredmény.

GET /files/{fileId}/preview-url: hibás UUID/query 400; nem létező/idegen/saját nem ACTIVE sor és bizonyítottan hiányzó saját objektum egységes FILE_NOT_FOUND 404. Az owner/state ellenőrzés előzi meg a MIME- és storage-vizsgálatot. Saját ACTIVE, de nem támogatott/missing/mismatch detectedMimeType esetén PREVIEW_NOT_ALLOWED 415. HEAD/presign/bucket/access hiba vagy tényleges méreteltérés STORAGE_UNAVAILABLE 503; metadata-DB hiba DATABASE_UNAVAILABLE 503. A 404 és hiba sem módosít kvótát/életciklust.

Közös: AUTH_REQUIRED 401; a meglévő SessionGuard user-lekérdezési hibája SERVICE_UNAVAILABLE 503 (nem 401); explicit eltérő Origin ORIGIN_NOT_ALLOWED 403; külön per-user list/preview ablak túllépése RATE_LIMITED 429 és olvasható Retry-After; ismeretlen hiba INTERNAL_ERROR 500. Details mindig {}, no-store; providerhiba, signed URL, cursor és storage key nem kerül vissza/logba. A storage kép-GET hibája nem backend JSON-hiba: a UI képbetöltési hibát jelez, és nem talál ki belőle 401/404 domainkódot. Teljes státusz csak új jogosított API-kérésből ismert.

A preview implementáció a signing utáni második saját-ACTIVE queryvel újraellenőriz: eltűnt/idegen/nem aktív sor FILE_NOT_FOUND, újonnan tiltott MIME PREVIEW_NOT_ALLOWED, változott storageKey/név/méret/egyéb MIME-metaadat STORAGE_UNAVAILABLE. Hibás/lejárt/túl hosszú presign-lejárat vagy érvénytelen URL ugyancsak STORAGE_UNAVAILABLE, capability nélkül. A megosztott FileIdPipe most kifejezett 36-karakteres UUID-határt ellenőriz, így a trailing newline nem válik DB-hibává.

## Thumbnail processing – tervezett hibák, 2026-10-29

**Nem implementált**, az [API](api.md#első-thumbnail-processor-api--tervezett-2026-10-29) és [adatmodell](data_model.md#első-thumbnail-processor--tervezett-szerződés-2026-10-29) kiegészítése. A workerhiba nem változtat sikeres confirmot HTTP-hibává, és nem törli az eredetit. A status válasz safe kódot tartalmaz; nyers Sharp/libvips/S3 exception, inputadat, storage key és EXIF nem kerül klienshez/logba.

| Kód | Állapot / retry | Magyar felületi jelentés |
|---|---|---|
| PROCESSOR_INPUT_UNSUPPORTED | FAILED, nem retryable | Ehhez a képtípushoz nem készíthető kiskép. |
| PROCESSOR_INPUT_INVALID | FAILED, nem retryable | A kép nem dekódolható kiskép készítéséhez. Az eredeti megmaradt. |
| PROCESSOR_INPUT_LIMIT | FAILED, nem retryable | A kép túllépi a feldolgozási korlátot. |
| PROCESSOR_OUTPUT_LIMIT | FAILED, nem retryable | Nem készíthető a korlátnak megfelelő kiskép. |
| SOURCE_CHANGED | FAILED, nem retryable; operátori vizsgálat | A kép állapota megváltozott, a feldolgozás leállt. |
| PROCESSOR_TIMEOUT / PROCESSOR_RESOURCE_LIMIT | RETRY_WAIT, keret után FAILED; kézi retry korlátozott | A feldolgozás erőforráskorlátba ütközött. |
| PROCESSING_STORAGE_UNAVAILABLE / PROCESSING_DATABASE_UNAVAILABLE | RETRY_WAIT, keret után FAILED; kézi retry korlátozott | A kiskép feldolgozása átmenetileg nem fejezhető be. |
| DERIVED_QUOTA_EXCEEDED | BLOCKED_QUOTA, nincs automatikus retry | A kisképhez nincs elég szabad tárhely. Az eredeti használható. |
| SOURCE_NOT_ACTIVE | CANCELLED; restore után kézi retry kereten belül | A kép jelenleg nem dolgozható fel. |
| WRITE_CLOSURE_UNPROVEN / DERIVED_CLEANUP_UNAVAILABLE | Attempt CLEANUP_BLOCKED; nem original-/job-failure | Egy korábbi feldolgozási próbálkozás tárhelyfoglalása még nem szabadítható fel. |

Az API által dobott új hibák:409 THUMBNAIL_NOT_READY,409 PROCESSING_RETRY_NOT_ALLOWED,503 PROCESSING_UNAVAILABLE; üres details és meglévő wrapper. 404 FILE_NOT_FOUND/415 PREVIEW_NOT_ALLOWED/401 AUTH_REQUIRED/403 ORIGIN_NOT_ALLOWED/429 RATE_LIMITED a meglévő jelentéssel, a tervezett guardokban használva. Cleanup-hiba külön warning lehet SUCCEEDED mellett is. Ismeretlen decoder/worker exception safe PROCESSING_UNAVAILABLE vagy retry-keretes belső hiba, nem korlátlan újrapróbálás; konfiguráció/build ismeretlen processorverziója nem claimelhető és operátori jelzés.

### Implementált thumbnail-storage belső hibák – 2026-10-29

A readOriginal/writeDerived a meglévő generikus StorageError-üzenetet használja: INVALID_ARGUMENT, INVALID_RESPONSE, UNAVAILABLE; conditional read412/416 OBJECT_CHANGED, conditional write412 OBJECT_EXISTS és409 WRITE_CONFLICT. Az utóbbi kettő új belső adapterkód, nem új publikus HTTP-hiba. Az abort oka, providerbody, credential, kulcs és bájtok nem kerülnek az errorba/logba. Write timeout/abort vagy hibás200-meta eredménye bizonytalan lehet, nincs retry/delete/kvótarelease mellékhatás. A későbbi processing-service/API mapping továbbra nincs implementálva. A törlés és a proof nélküli cleanup-kapu változatlan.


### Implementált tiszta processor-hibák – 2026-10-29

A `ProcessorError` nem HTTP-exception és nem indít retry-t: `PROCESSOR_INPUT_UNSUPPORTED`, `PROCESSOR_INPUT_INVALID`, `PROCESSOR_INPUT_LIMIT`, `PROCESSOR_OUTPUT_LIMIT`, `PROCESSOR_TIMEOUT`, `PROCESSOR_RESOURCE_LIMIT`, `PROCESSOR_ABORTED`, `PROCESSOR_INTERNAL_ERROR`. Egységes safe message: `Image processing failed.`; nincs raw Sharp/stack/path/inputadat. Nem támogatott MIME vagy külön posteres APNG UNSUPPORTED; támogatott MIME-mismatch/sérült dekódolás INVALID. Child signal RESOURCE_LIMIT, de önmagában nem bizonyít OOM-ot. Hibás IPC/fingerprint/hash/geometria INTERNAL_ERROR; méretprotokoll-túlcsordulás OUTPUT_LIMIT. Abort/timeout után megvárjuk a child kilépését. Az eredeti fájlt, DB-t, kvótát egyik sem módosítja; job/HTTP mapping a későbbi orchestration feladata.


### Explicit processing-state és publication hibák – 2026-10-30

A `ProcessingStateError` safe belső kódot ad (`PROCESSING_INVALID_ARGUMENT`, `PROCESSING_NOT_FOUND`, `SOURCE_NOT_ACTIVE`, `SOURCE_CHANGED`, `PROCESSING_POLICY_MISMATCH`, `PROCESSING_LEASE_LOST`, `PROCESSING_STATE_CONFLICT`, `PROCESSING_RETRY_EXHAUSTED`, `PROCESSING_DATABASE_UNAVAILABLE`), egységes message-gel, raw Prisma/stack/provideradat nélkül. Nincs új HTTP mapping. Kvótahiány tartós BLOCKED_QUOTA, automatikus retry nélkül; ismeretlen/policy-input hiba nem örökíthet tetszőleges error-stringet jobba. Transient hiba keretes5s/30s retryt kap, input/source hiba terminális.

A `ProcessingPublicationError` storage-részhibát `PROCESSING_STORAGE_UNAVAILABLE`, caller abortot `PROCESSOR_ABORTED` kóddal jelez. Receipt/HEAD eltérés sem jogosít törlésre vagy kvótafelszabadításra. MarkStored/finalize DB-hibája külön marad a storage-failure ágtól: a commit lehet sikeres elveszett válasz mellett, ezért nincs vak fail/DELETE/PUT-kompenzáció. Sikertelen hibaállapot-mentés esetén is megmarad az előző tartós reservation. Cleanup proofhiány esetén CLEANUP_BLOCKED, nem implicit óra-alapú release.
