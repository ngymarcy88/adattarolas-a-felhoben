# ADR-017: Direct S3 multipart transfer PoC

## Status and date

Accepted for the isolated PoC, 2026-11-01. Uppy S3 is the selected candidate for direct multipart integration. This is **not** acceptance of complete SZD2 resumable image import or authorization to replace the production upload path.

## Implementation status

`tools/multipart-poc/` contains a real MinIO + browser experiment. The PoC itself left the application's single-PUT init/confirm, Prisma schema, storage adapter, worker and UI unchanged. The subsequent persistence-only slice implements the import/multipart Prisma schema and additive migration, with legacy transport/type guards; multipart orchestration, API and UI remain unimplemented. Uppy is pinned in root devDependencies, using the existing single lockfile. The experiment is opt-in, outside application builds and CI; it uses an isolated native MinIO process with random credentials, temporary data and its own bucket. It does not read `.env` or the app DB.

## Context

The October requirements call for actual resumable batch image import. Replaying a complete PUT and idempotent confirm do not retain a partially transferred file. The experiment must distinguish retained complete parts from a failed part, and must include images smaller than the S3 minimum non-final part size.

## Decision

- Client: `@uppy/core@6.3.0` + `@uppy/aws-s3@6.3.0`, without Dashboard or Companion. A Vue 3 Composition API component uses the headless client; the existing application UI can be retained in a later integration.
- Protocol: S3 multipart, not a custom chunk protocol and not HTTP form `multipart/form-data`. Part bodies go directly from browser to MinIO. The isolated signing adapter uses the existing AWS SDK and returns short-lived presigned URLs; credentials stay in the server process.
- PoC part size: **5 MiB = 5,242,880 bytes**. Force multipart for both test files to expose the small-file boundary. This is a measurement configuration, not a final production size threshold.
- One active Uppy file; installed Uppy 6.3.0 sends that file's parts sequentially. Production global concurrency and validated configuration remain a separate contract decision.
- Restore a new Uppy instance with the public `s3Multipart` file state (`key`, `uploadId`), then let it issue ListParts and send only missing parts. That identity is supplied by the local PoC server in memory; it is not a durable authorized import implementation.
- Experiment signing is restricted to pre-created synthetic sessions and bounded part numbers, with exact loopback Host/Origin checks. This is not production authentication or quota enforcement.

## Alternatives considered

| Alternative | Assessment |
|---|---|
| Current full PUT retry | Retain as production baseline; cannot resume within a file. |
| Uppy S3 direct multipart | Selected candidate: fits existing presigned MinIO path, provides standard part listing and reconstruction; no new transfer service. |
| tus-js-client / Uppy tus + Node tus server or tusd | Remains relevant for small-image resumability. Extra receiving service/data path and temporary storage/accounting need evaluation. tus may itself use S3 multipart underneath. |
| Hand-written chunk protocol/uploader | Rejected: unnecessary protocol and client lifecycle work. The PoC's raw HTTP interruption driver only injects a real fault; it is not a product transfer protocol. |

## Consequences and limits

The storage-confirmed unit is a **complete part**, not every byte written to a request. An interrupted part is resent from its beginning. A small image that fits in one part is fully resent. AWS requires at least 5 MiB for non-final parts; the final/only part may be smaller. Therefore direct multipart alone does **not** resolve the small-image intra-file resume requirement. Do not silently declare small-file retry equivalent to resume or assume supervisor acceptance. A tus PoC or explicit scope agreement is still needed for that gap.

Production integration must add durable owner-bound import/transfer identity, file re-selection/content identity after refresh, expiry and access renewal, transactionally reserved quota, authoritative part validation, complete/confirm recovery and once-only activation/job creation. Never infer content identity from a multipart ETag. Cleanup must exclude late publication and respect uncertain-write reservations; this PoC's synthetic cleanup is not application quota-release proof. Incomplete parts consume physical storage before a final object exists.

Uppy lifecycle must be wrapped in a client-layer adapter. `destroy()`/cancel is not a durable pause/recovery strategy. The PoC does not persist files, URLs or credentials in browser storage and suppresses default client logging. Existing UI controls/progress/error models can be connected later; no existing Vue upload components were changed.

## Verification

Actual inputs, payload counts, browser requests and full-object SHA-256 results are recorded in the [test report](../../04_quality/test_report.md#multipart-poc--2026-11-01) and its JSON evidence. The interruption is a Node HTTP request with a full Content-Length, a successfully written prefix and socket destruction before request completion. A fresh Uppy browser instance resumes the same transfer through standard S3 operations. This proves mixed-driver protocol interoperability; **not** Uppy-native mid-request pause, actual page-refresh persistence, MinIO restart or end-to-end application integration.

Measurement counts application payload bytes handed to the interrupted HTTP request and the successful browser PUT bodies. It excludes headers/TCP/TLS overhead and does not claim receiver-side partial-byte telemetry. The final complete object is fetched and SHA-256-compared, and the retained part's ETag is checked unchanged before CompleteMultipartUpload.

## Sources

- [Uppy S3 API and server-side signing](https://uppy.io/docs/aws-s3/)
- [S3 multipart part size limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [S3 multipart lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Incomplete upload storage and abort](https://docs.aws.amazon.com/AmazonS3/latest/userguide/abort-mpu.html)

## Product contract clarification – 2026-11-01 (documentation only)

The planned [multipart API](../../03_design/api.md#multipart-képimport--tervezett-szerződés-2026-11-01) and [durable model](../../03_design/data_model.md#multipart-import-és-transfer--tervezett-2026-11-01) now define owner-bound import/file/transfer identity, one reservation, fixed session expiry, part-only browser grants and backend-controlled completion/confirmation. Defaults:5MiB immutable parts,120s part grants,24h import lifetime,50 accepted files/import, two active files with one sequential part each. These are target configuration, not installed runtime settings or acceptance of the small-image resume gap.

**Material PoC limitation:** Uppy6.3.0 exposes `signRequest` and its S3 uploader performs direct ListParts/Complete. The PoC demonstrated that path; it did not demonstrate a supported adapter to the new cookie-auth JSON control plane with backend-owned manifest/complete. Before frontend integration, prove a supported public library extension or revisit the client choice through ADR/PoC. Do not assume old Uppy5 callbacks exist in6.3.0, fork private uploader internals, weaken backend checks, introduce an S3-emulation protocol, change authentication or install an alternative implicitly. No browser Create/List/Complete/Abort presigned rights are authorized by the product contract.

Create-only CompleteMultipartUpload support, exact size enforcement and attempt-specific write-closure evidence require real provider verification. AWS documents that a complete response can carry an error inside HTTP200, and abort can race in-flight parts; SDK response parsing and conservative recovery are required. Unknown outcomes retain reservation. References: [complete semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html), [abort semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).

Production single-PUT remains unchanged; transport cannot switch within a file attempt. This documentation is not an implementation or cutover approval.


### Backend implementation snapshot (2026-11-02)

The owner-bound import/transfer service and HTTP control plane are implemented with the documented configuration, durable create/complete intents, fenced request-driven recovery, full streaming hash/signature verification and atomic activation/accounting/job creation. The adapter now includes bounded exact-key session discovery and complete-object verification. No frontend cutover or automatic multipart cleanup is included; unknown outcomes keep reservations. The public Uppy6 adapter/control-plane fit and real provider size/create-only/CORS/late-write verification remain open. The PoC and small-image intra-file resume limitations above remain unchanged; unit and disposable-DB service checks do not close those gates.


### Frontend integration gate – historical proposal, rejected (2026-11-02/03)

Inspection of the installed6.3.0 declarations/implementation and the official [migration guide](https://uppy.io/docs/guides/migration-guides/) confirms that create/list/sign/complete/abort callbacks were removed. The plugin directly performs S3 control requests; signing cannot adapt it to the existing authenticated JSON API without changing the contract or emulating S3. Neither workaround is accepted.

Concrete proposal: pin `@uppy/core@5.2.0` and `@uppy/aws-s3@5.1.0` in the frontend workspace only; keep root6.3.0 and the PoC unchanged, with the single root lockfile. Read-only inspection of the5.1.0 package declarations confirms public createMultipartUpload/listParts/signPart/completeMultipartUpload/abortMultipartUpload/uploadPartBytes/getChunkSize/limit/retryDelays hooks. No package was installed or version changed. Approval was requested because the clarification above explicitly prohibits an implicit downgrade.

The planned adapter maps opaque application transfer identity to the library's in-memory handle, never exposes the storage key/provider uploadId, and ignores any client complete manifest: the backend remains authoritative. Public listParts entries can omit ETag for already completed parts (its type is optional); retained parts must be verified in a focused library-level resume test before cutover. Complete and ACTIVE confirm remain separate; UI success and gallery refresh follow only ACTIVE. Two globally active files with sequential parts, no automatic retries/re-init, explicit pause distinct from terminal cancel, and fresh backend resume/hash verification on re-selection are required. This is a reviewable proposal, not an accepted dependency change or working panel.

Independent preparation: `frontend/src/api/multipart.ts` provides validated session-auth JSON calls and safe pending/ACTIVE distinction. It is not wired to the panel; the working single-PUT path remains unchanged while the client decision is pending.


### User decision (2026-11-03)

The user rejected the Uppy5 proposal and explicitly authorized keeping Uppy6 with redesigned server integration. [ADR-018](ADR-018-uppy6-companion-bridge.md) resolves the gate through the public Companion JSON adapter in the existing application and same-origin routing. The product frontend uses the pinned6.3.0 libraries; the isolated PoC remains unchanged. No downgrade or private library patch was performed. The small-image resume and real provider acceptance limitations remain.

## Kis képek folytatása – technikai döntés, 2026-11-23

**Státusz:** a tus 1.0 és a tartós, fájlalapú tusd átmeneti tárolás a kis képes alkalmazásintegráció kiválasztott jelöltje. Az elkülönített átviteli PoC sikerült. A termékbevezetéshez külön döntés kell a függőségről és a szolgáltatásról. A működő CloudVault még az ADR-018 szerinti Uppy 6 + S3 multipart útvonalat használja.

**Mérés:** ugyanazt az 1 229 603 bájtos szintetikus PNG-t, azonos 393 216 bájtos elküldött előtag után szakítottuk meg. A jelenlegi CloudVault S3 út egyetlen része 0 bájtot tartott meg, a folytatás 1 229 603 bájtot küldött. A helyi, tartós kötetre író tusd 393 216 bájtot jelentett HEAD-del a félbeszakadt PATCH után és a tényleges szerverrestart után is. A következő PATCH 836 387 bájtot küldött. A kész fájl SHA-256 értéke mindkét úton egyezett. Ez egy kontrollált payload-minta, a részletes próba a [tesztriportban](../../04_quality/test_report.md#kis-képek-folytatása--s3-és-tus-poc-2026-11-23) és a [mérési adatokban](../../assets/evidence/small-image-resume-poc-2026-11-23.json) szerepel.

**Választás és határ:** integráció után a kép egyetlen S3-résznyi mérettartományában a tus út adhat valódi fájlon belüli folytatást. A határ a ténylegesen konfigurált részmérethez igazodjon. A pontos határt, beleértve az egyenlőség esetét, a termékintegráció előtt külön mérjük. A több részes képekhez a közvetlen S3 út marad az elsődleges. Egy import kezelhet két átviteli módot, de a mód és a feltöltésazonosító egy fájl elindítása után rögzített. A korábban létrehozott importok az eredeti útvonalon folytathatók.

**Illesztési feltételek:**

1. A NestJS backend a POST, HEAD és PATCH előtt ellenőrzi az aktív munkamenetet, a tulajdonost és a tartós feltöltési állapotot. Az átmeneti tusd nem érhető el közvetlenül a böngészőből. Az új munkamenet ugyanahhoz a feltöltéshez tér vissza. Újraválasztáskor a méret és a teljes SHA-256 egyezik, a folytatás bájthelyét a szerver HEAD válasza adja.
2. Az alkalmazás az átviteli URL-t a saját tartós importból rendeli hozzá, memória alapú böngészős kezeléssel. Az Uppy 6 mellé vizsgálandó a hivatalos Uppy tus kliens. A kiválasztott verzión igazolni kell, hogy meglévő URL-t tud folytatni, ki lehet kapcsolni az alapértelmezett böngészős URL-tárolást, és meghiúsult folytatáskor nincs új feltöltés vagy átvitelimód-váltás.
3. A kvóta a feltöltés előtt, tranzakcióban foglalódik. A lemezes átmeneti adatokra külön fizikai hely- és párhuzamossági korlát kell, mert véglegesítés közben a lemezes és az objektumtárolós példány átmenetileg együtt létezhet. A fordított proxy adatfolyamként továbbítsa a PATCH-et. A kérés összevonásával vagy teljes pufferelésével elveszne a mérésben igazolt előny.
4. A feltöltés kész tus állapota után a backend ellenőrzi a teljes méretet, a hash-t és a képszignatúrát, majd az adapterrel csak újként írja az eredeti objektumot. A fájl aktiválása, a foglalt hely használttá alakítása, az audit és a tartós feldolgozási feladat együtt, egyszer történik. Egy elveszett vagy ismételt webhook nem dönt a végleges állapotról. A kész staging állapotnak későbbi státusz vagy confirm kérésből is helyreállíthatónak kell lennie.
5. Lejárat és megszakítás után előbb végleg ki kell zárni az aktiválást. A foglalás csak az adott írási kísérlet bizonyított lezárása és az átmeneti, illetve félkész végleges példányok igazolt hiánya vagy takarítása után oldható fel. Bizonytalan kimenetnél foglalt marad. A PoC fájlalapú újraindítása ehhez nem adott takarítási bizonyítékot.

**Alternatívák:** a jelenlegi S3-only út a kis, egyrészes képnél teljes fájlt küld újra. A tusd S3 hátterét külön kellene mérni azonos bájtpontú megszakítással. A fájlalapú staging működéséből nem következik ugyanaz a részleges viselkedés S3 háttérrel. A hivatalos Node tus szerver csökkenthetné a külön futtatandó szolgáltatások számát, de a meglévő NestJS folyamat terhelését és tárolóviselkedését ehhez külön kellene igazolni. Saját átviteli protokoll nem indokolt.

**Források:** [tus 1.0 protokoll](https://tus.io/protocols/resumable-upload/1-0-x), [tusd helyi tárolás](https://tus.github.io/tusd/storage-backends/local-disk/), [Uppy tus](https://uppy.io/docs/tus/), [tus-js-client publikus API](https://github.com/tus/tus-js-client/blob/main/docs/api.md).

### Helyi alkalmazásintegráció, 2026-11-24

A külön Compose-konfigurációban a meglévő Uppy 6 feltöltőpanel közvetlenül a `tus-js-client` 4.3.1 publikus API-ját használja a próba fájljához. A kliens az alkalmazás munkamenethez kötött átvitel-URL-jével `HEAD`-del kezd, amelyet a meglévő importból állít elő. A konfiguráció kikapcsolja a böngészős URL-tárolást. Sikertelen folytatás után a felületről indított újrapróbálás ugyanezt a műveletet használja.

A próba határa szándékosan 5 MiB alatti méret és importonként az első elfogadott fájl, ha támogatott kép. A NestJS a kész staging fájl hash- és szignatúra-ellenőrzése után egy S3-részt tölt fel. A már létező create-only véglegesítés és a tárolt objektum teljes újrahash-elése után az eredeti confirm könyveli a kvótát. Függő staging átvitel kézi folytatásához az eredeti helyi fájl újraválasztása szükséges. A prototípusnak véges staging kapacitása van, és a végleges staging takarítás vagy felszabadítás továbbra is külön feltétel a szélesebb bevezetéshez. [Alkalmazáspróba és eredmények](../../04_quality/test_report.md#kis-képes-tus-integráció--2026-11-24).

### Staging takarítás elfogadási feltételei, 2026-11-24

A fájlalapú tusd elkülönített próbájában a termination lezárta a nyitott PATCH-et, a bináris és a `.info` fájl eltűnt. Az integrált útvonalon a végleges megszakítás után a staging elérhetetlenné vált a felhasználónak, a fájl és a foglalás megmaradt. [Futtatott próbák](../../04_quality/test_report.md#tusd-és-backend-újraindítása-staging-lezárása).

- **Sikeresen véglegesített fájl:** a staging másolat takarítható, ha az ACTIVE confirm tartósan rögzítette az ellenőrzött eredetit és kizárható az új staging-írás. A staging takarítása ekkor nem módosítja a felhasználói kvótát.
- **Megszakított vagy lejárt fájl:** tartósan ki kell zárni az aktiválást és az új írást. Ezután ugyanahhoz az írási kísérlethez kell igazolni a tusd oldali lezárást és a staging fájlok hiányát, az objektumtárolói írások lezárását, valamint az eredeti objektum és a félkész részek hiányát vagy sikeres eltávolítását. Csak ezek együttes igazolása után könyvelhető el egyszer a felszabadítás.
- **Bizonytalan kimenetel:** elveszett létrehozási válasz és ismeretlen staging azonosító esetén az erőforrás további egyeztetést igényel. Az S3 adapter íráslezárási bizonyítéka továbbra is `unproven`. Az S3 abort alatt futó részírás még befejeződhet, ezért az abort válasza önmagában elégtelen. A foglalás ilyen helyzetben megmarad. [tusd helyi tárolás](https://tus.github.io/tusd/storage-backends/local-disk/) · [S3 AbortMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).

A külön staging-takarítási próba igazolta a helyi fájlok törlésének lehetőségét. A teljes felszabadítási feltétel nyitott, ezért a több kis képes bővítés és a hozzá kapcsolódó 10/50 képes mérés továbbra is ezt követi.

### Korai megszakítás MinIO-írás előtt

Az új staging átvitelekhez a NestJS csak a teljes fájl méret-, hash- és szignatúra-ellenőrzése után rögzíthet S3 CREATE szándékot. A szándék és a visszavonhatatlan S3-engedély ugyanabban a zárolt tranzakcióban születik, amely a végleges megszakítással versenyez. A MinIO-engedély előtt lezárt átvitelre az integráció bizonyítani tudja, hogy S3-művelet nem indulhatott. A már engedélyezett és a korábbi átvitelek a meglévő foglalásmegőrzési szabályt követik.

A backend a privát, rögzített tusd verzión keresztül kéri a termination műveletet. Az alkalmazás a DELETE 204 vagy 404 és egy utána kapott HEAD 404 mellett az ugyanarra a kötetre csatolt, csak olvasható könyvtárban ellenőrzi a bináris és a `.info` fájl hiányát. A végleges átvitel és az immutable tus azonosító kizárja az új erőforrás-létrehozást ehhez az átvitelhez. A tusd a létező fájlt megnyitva ír részadatot, és a PATCH nem hozza újra létre a törölt bináris fájlt. [A rögzített tusd fájltároló implementációja](https://github.com/tus/tusd/blob/v2.10.3/pkg/filestore/filestore.go).

A függő takarítás tulajdonos által újrapróbálható. Ha az egyik staging fájl megmarad, vagy az elveszett létrehozási válasz miatt az erőforrás azonosítója ismeretlen, a foglalás megmarad. A staging nélkül megszakított műveletnél a tartós létrehozási szándék hiánya igazolja, hogy staging-erőforrás sem indulhatott. A kvótafelszabadítás és bizonyítéka egy tranzakcióban rögzül.

### Sikeresen véglegesített staging másolat

A meglévő takarítási worker külön, lokálisan engedélyezett körben választja ki a `SUCCEEDED`, hash-ellenőrzött és véglegesen elszámolt tus átviteleket. A tartós terminális állapot kizárja a folytatást. A worker ugyanazzal a privát tusd- és fájlhiány-ellenőrzéssel töröl, mint a korai takarítás. A törlés igazolásakor csak a staging marker és a staging újrapróbálási idő változik. Az eredeti fájl és a felhasználói kvóta nem része a takarításnak.

A worker egy futásban legfeljebb négy sikeres átvitelt kezel, egy perces újrapróbálási idővel. Válaszvesztés vagy újraindítás után ugyanazt a tartós tus azonosítót egyezteti. Ha a tusd 404-et ad és mindkét fájl igazoltan hiányzik, a marker rögzíthető. Ha bármelyik fájl megmaradt, az átvitel továbbra is foglal staging helyet. A jelölés a korábbi sikeres tus rekordoknál is alkalmazható. A bizonytalan MinIO-írások kvótafelszabadítása ettől külön nyitott.
