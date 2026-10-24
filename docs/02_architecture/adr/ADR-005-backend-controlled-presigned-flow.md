# ADR-005: Backend-controlled presigned upload/download flow

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

A belső storage adapter implementált; az upload-init/confirm API implementált, a read/download endpoint még tervezett. Az adapter nem végez authorizationt, DB-állapotváltást vagy kvótakönyvelést.

## Context

A browsernek médiaobjektumot kell mozgatnia anélkül, hogy tartós storage credentialt kapna vagy az authorizationt saját maga döntené el. A közvetlen bináris adatút tehermentesíti a backendet, de pending rekordot, confirm lépést, storage-oldali ellenőrzést és hibás objektum cleanupot igényel.

## Decision

Az első képszelet tervezett backend-kontrollált presigned flow-ja (a teljes resumable SZD2 adatútját nem választja ki):

1. Az authenticated init kérés validálja a deklarált metaadatot és kvótát.
2. A backend `PENDING_UPLOAD` rekordot hoz létre, kvótát foglal, és ötperces presigned PUT URL-t ad.
3. A browser közvetlenül a privát MinIO/S3 bucketbe tölt.
4. A kliens confirmot kér.
5. A backend `HEAD` művelettel ellenőrzi a tényleges méretet és metadata-t, majd bounded range-readből magic-number vizsgálatot végez.
6. Csak siker esetén aktivál és könyvel usage-ot, idempotens módon.

Preview és download előtt a backend ownershipet vagy share tokent ellenőriz, majd külön, rövid életű read URL-t ad a megfelelő response headerekkel.

A backend proxy nem automatikus CORS-fallback. A lokális MinIO CORS beállítása a presigned böngészős adatút előfeltétele.

## Alternatives considered

- Frontend tartós credentialdel: elfogadhatatlan security és authorization kockázat.
- Backend proxy minden bináris adathoz: erősebb központi kontroll, de felesleges API-terhelés és rosszabb skálázhatóság.
- Nyilvános bucket: egyszerű demo, de nem felel meg a privát alapállapotnak.
- Multipart az első képszeletben: most nincs kiválasztva; a kötelező resumable képimporthoz külön PoC/ADR kell. Csak a nagyvideós bővítés marad egyértelműen Later (ADR-009).

## Consequences

- A backend marad az authorization és metadata igazságforrása.
- A browser csak szűk és rövid életű storage-jogot kap.
- Szükséges a CORS, pending expiry, idempotens confirm és cleanup dokumentált kezelése.
- A presigned URL nem kerülhet logba, audit metadata-ba vagy MI-provider provenance mezőbe.
- A `HEAD` és bounded range-read műveletek a storage adapter kötelező részei.

## Verification

- Unit teszt ellenőrzi az init authorizationt, quota reservationt és presign paraméterezést.
- Unit teszt ellenőrzi a confirm validationt és exactly-once transitiont.
- Manuális log review igazolja, hogy URL vagy credential nem kerül naplóba.
- A későbbi lokális smoke check igazolja a MinIO CORS és presigned PUT/GET működését; ez nem része a jelen dokumentációs körnek.

## Első képfeltöltési szerződés pontosítása – 2026-10-20

A kanonikus request/response és hibaút az [API Upload részében](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) található. Az init kötelező ownerhez kötött `Idempotency-Key` alapján egyetlen fájlt/foglalást hoz létre; a normalizált payload és a határidők replaykor változatlanok. A tartós nyilvántartás konkrét adatmodellje külön következő feladat.

A szokásos presigned PUT többször használható és felülírhatja a már ellenőrzött objektumot; a korábbi egyszerű HEAD→ACTIVE leírás ezt önmagában nem zárja ki. Az API elvárt create-only iránya az aláírt `If-None-Match: *`, de a tényleges MinIO/S3 kompatibilitás, megkerülhetetlenség, méretkikényszerítés és a HEAD/range objektumazonosság még implementáció előtti bizonyítási kapu. Belső storage URL nem helyettesíthet böngészőből elérhető, helyesen aláírt publikus URL-t; CORS szükséges.

A késői in-flight PUT és cleanup versenyénél puszta URL-lejárat/HEAD 404 nem elég a reservation felszabadításához. Biztonságos íráslezárás és confirm/cleanup kizárás szükséges; ennek adapteres bizonyítéka külön feladat. Amíg a kapuk nem teljesülnek, ez dokumentált követelmény, nem igazolt biztonsági képesség. A teljes képintegritás/processor eredményét a magic-number ellenőrzés nem garantálja.

## Adapter implementáció – 2026-10-23

AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, 3.1156.0), Nest `OBJECT_STORAGE` provider. Belső és publikus endpoint külön konfiguráció; rövid, abszolút lejáratot nem hosszabbító hozzáférés. Csak JPEG/PNG/WebP/GIF eredeti objektumkulcsok, UUID-alapú owner/fájlútvonal; a kulcsformátum nem helyettesít ownership-vizsgálatot. A PUT aláírás köti a Content-Type, Content-Length és If-None-Match headereket; a böngésző a Blob méretéből állítja a tiltott kézi Content-Length headert.

A HEAD 404 után külön bucketellenőrzés előzi meg az objektumhiány kimondását (ListBucket jogosultság kell); a hibás/hiányzó bucket nem takarítási siker. Az ETag átlátszatlan feltétel, nem integritási checksum. A maximum 64 KiB-os prefixolvasás If-Match-et, pontos 206/range/length választ és határidőt követel, eltérésnél lezárja a streamet. Nem teljes képfeldolgozás vagy magic-number detektor. Download csak a kép-allowlisttel, biztonságos Content-Dispositionnel és no-store-ral. A hibaobjektum nem tartalmaz providerüzenetet, URL-t vagy credentialt.

A DeleteObject csak fizikai művelet. Az adapter `writeClosureEvidence = 'unproven'` jelzése szándékos: sem a törlés, sem a 404, sem a presign lejárata nem bizonyítja a már elindított írások befejeződését. `writesClosedAt` nem állítható ezekből; automatikus reservation-release nem implementált. A késői PUT/cleanup kapu továbbra is nyitott, ezért teljes upload-életciklus késznek nem tekinthető.

Provider-próba: `npm run storage:verify`, [eredmények és korlátok](../../04_quality/test_report.md). Elsődleges háttér: [AWS conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [presigned URL érvényesség](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), [HEAD hiba-szemantika](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html). Más S3 providerre a kompatibilitást külön ellenőrizni kell.

Az init→PUT→confirm backend-adatút implementált; sikeres confirm nem követel cleanup-quiescence-t, mert az aktív objektumot nem törli, és a régi create-only PUT nem írhatja felül. A quiescence külön törlési/release kapu, jelenleg nincs igazolva. A worker ezért csak a lejárati és retry-kezelést teljesíti ténylegesen; writesClosedAt nélkül nincs delete vagy reservation-release.
