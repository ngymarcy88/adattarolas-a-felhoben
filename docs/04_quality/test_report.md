# Test report

## Képes galéria és nagy előnézet – 2026-10-28

**Verzió:** `feature/gallery-image-previews`, `fbe77f0` metaadatgaléria-alap után. **Környezet:** WSL Bash, Linux Node 22.23.2/npm 10.9.8, Jest/Vitest izolált unit/SSR. Szintetikus fájl-ID, URL, válasz és idő; nincs új backend/séma/dependency vagy thumbnail.

**Eredmény:** `npm test` **923 PASS** = 589 backend + 332 frontend (15 fájl) + 2 container helper. A 42 új eset API/state/template. `npm run typecheck` és `npm run build` mindkét workspace-re PASS. Az első 429 teszt fixture-e túl korán feloldotta a többi kérést; a ténylegesen sorban várakozó kérést modellező javítás után PASS. Egy további eseményteszt-kísérlet nem futott a meglévő SSR fordítás mellett; elhagyva, nem számít bizonyítéknak.

| Lépés / bemenet | Elvárt és tényleges izolált eredmény |
|---|---|
| Láthatóság/megnyitás, több ID, ismételt demand | Csak szükséges kérés, max. négy; azonos ID dedupe, PASS. |
| API-hiba, img-error, lejárat és 429 | Külön biztonságos hiba, URL törlés, kézi retry/cooldown; nincs időzített hurok, PASS. |
| Retain, késői válasz/esemény, 401/unmount | Memóriaürítés és stale-védelem; abortált fizikai kérés korlátba számít, PASS. |
| Sikeres explicit refresh | Hibák újrapróbálhatók, jó kép nem törlődik, PASS. |
| Template/fókusz helper | Anonymous/no-referrer img, feliratok/loading/modal; showModal/close, scroll és visszatérő fókusz fake elemekkel PASS. |

**Bizonyíték:** `frontend/tests/preview-api.spec.ts`, `previews-state.spec.ts`, `preview-templates.spec.ts`; a korábbi galéria és upload unitok is PASS. Független frontend/security review után a terminális preview-hibák explicit frissítési útja javítva, regressziós teszttel.

**Határ:** nem történt valódi browser/DB/MinIO próba, képernyőkép vagy külső UAT. Külön manuálisan ellenőrizendő a lazy kép/CORS, nagy nézet Tab/Shift+Tab/Enter/Space/Escape és fókusz-visszaadás, offline/lejárt kép retry, fiókváltás. Eredeti képeket töltünk, a thumbnail processor és automatikus upload utáni listafrissítés még külön feladat. A lenti korábbi riportok az adott szelet akkori állapotát rögzítik.


## Saját képek metaadatgalériája – 2026-10-28

Verzió: `feature/gallery-metadata-ui`, a `fe2ef8b` preview backend után. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, meglévő Vitest Node-környezet és izolált Vue SSR render. Backend, séma, dependency és preview végpont nem változott; nincs új integration/e2e runner.

**Unit:** `npm test` PASS: **589 backend** (14 suite) + **290 frontend** (12 fájl) + **2 container helper** = **881 eset**. A 70 új galéria API/state/template eset mellett az upload sikerüzenet meglévő tesztje a kézi frissítési útmutatóra frissült. A célzott 290-es frontend futás/typecheck is PASS volt. A végleges `npm run typecheck` és `npm run build` mindkét workspace-re PASS; 39 helyi dokumentációs link, git diff --check és a tényleges környezeti credentialök repó-/frontendbundle-ellenőrzése is PASS. Független frontend/security review nem talált blokkoló hibát.

| Bemenet/lépés | Elvárt és tényleges unit/template eredmény |
|---|---|
| Első/folytató GET /files, limit20 és opaque cursor | PASS: include/no-store/redirect error, JSON-only metadata, nincs body/preview/storage kérés |
| Hibás page/row, privát extra mező, nem ACTIVE vagy eltérő MIME, rossz UUID/dátum/méret | PASS: runtime sémaellenőrzés, biztonságos generikus hiba; raw body/URL nem kerül a UI-ba |
| Initial loading vs üres 200 | PASS: betöltési állapot, üres siker külön feltöltési linkkel, nincs korai üres státusz |
| Több oldal, ismételt ID-k és párhuzamos További képek kattintás | PASS: szerverrend megmarad, egy ID egy kártya, egyszerre egy folytatás |
| Lapozási hiba, majd retry | PASS: korábbi kártyák és cursor maradnak; pontosan az elbukott oldalt kéri újra |
| CURSOR_INVALID/ismétlődő nextCursor vagy sikertelen frissítés | PASS: nem folytatja a rossz/régi láncot, kártyák sikeres elsőoldalas frissítésig megmaradnak |
| Felülírt kérés, dispose, késői siker/401 | PASS: abort + generation védelem, régi válasz nem ír vissza adatot és nem indít új auth-callbacket |
| 401 és 429/Retry-After (szám/dátum/fallback) | PASS: 401 előtt listaürítés és callback, 429 alatt a frissítés sem kerüli meg a várakozást |
| SSR kártyák/loading/error/retry/disabled/üres | PASS: fájlnév escape, olvasható méret, time datetime és betöltött elemszám; nincs img/iframe/video/picture |

Az AccountPage a galériát és a feltöltőt user.id kulcshoz köti; a galéria 401 eseményére csak ugyanazon aktuális user esetén törli a profilt és navigál loginra. A template-tesztek izolált SSR-ek, onMounted nem indít bennük valódi hálózatot.

**Bizonyítékhatár:** nem történt valódi böngészős megnyitás, DOM-interakció/hydration, viewport/keyboard próba vagy a GET /files valódi DB-vel futtatott ellenőrzése. A teljes auth/lista UI → backend/DB elfogadás külön kapu. A kártyák most kizárólag metaadatok: képek betöltése, nagy előnézet és automatikus upload utáni frissítés még nincs. A korábbi szerzői sikeres feltöltési próba nem galéria-UAT.

## Eredeti kép előnézeti URL-je – 2026-10-27

Verzió: `feature/image-preview-url`, a `7fdea88` képlista-szelet után. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, Prisma 7.10.1, Jest/Vitest izolált runnerek. Nincs frontend-, download-endpoint-, thumbnail-, séma- vagy dependency-változás; valódi DB/MinIO/browser próba nem történt.

**Unit:** `npm test` PASS: **589 backend** (14 suite) + **220 frontend** (9 fájl) + **2 container helper** = **811 eset**. Az új esetek: 76 file-preview unit és 1 inline storage-adapter unit, összesen 77. Az első célzott futásban az adapter 59 esete PASS volt, a preview suite a Jestből hiányzó Vitest-specifikus ExactlyOnceWith matcher miatt nem indult; Times(1)+With párosra javítva a teljes futás PASS. A végleges `npm run typecheck` és `npm run build` mindkét workspace-re PASS; 49 helyi dokumentációs link, git diff --check és a tényleges környezeti credentialök repó-/frontendbundle-ellenőrzése is PASS.

| Bemenet/lépés | Elvárt és tényleges unit eredmény |
|---|---|
| Saját/idegen/hiányzó/pending/törölt sor | PASS: mindkét metadata-query id+ownerId+ACTIVE feltételű; nem jogosult vagy nem aktív sor egységes 404, storage és típusvizsgálat előtt |
| JPEG/PNG/GIF/WebP, video/SVG/HTML/XML/JS/unknown, null/mismatch/config-disabled MIME | PASS: négy tényleges ellenőrzött képtípus; saját ACTIVE tiltott/missing/mismatch típus 415 PREVIEW_NOT_ALLOWED, kiterjesztés vagy storage Content-Type nem jogosít |
| HEAD null, provider/bucket/access hiba, 0/negatív/tört/unsafe/eltérő méret | PASS: bizonyított hiány 404, provider- és mérethiba 503, nincs presign/fallback vagy kvótamódosítás |
| Inline GetObjectCommand/no-store/MIME/UTF-8 név | PASS: meglévő adapterrel inline; filename*=UTF-8 percent-encoding, biztonságos ASCII fallback; nem tényleges HTTP-fejlécpróba |
| Config TTL 1/30/300/900, rövidebb adapterexpiry és HEAD-késleltetés | PASS: legfeljebb 300s a signing előtt számítva, a tényleges adapter-lejárat kerül a kétmezős response-ba |
| Lejárt/NaN/túlhosszú expiry, átadott Date-mutáció, végső DB-read alatti lejárat, hibás URL | PASS: 503 STORAGE_UNAVAILABLE és nincs visszaadott capability |
| Signing közben eltűnő/idegenné/pendingdé/töröltté váló sor vagy változó key/név/méret/MIME | PASS: végső recheck eldobja a már előállított URL-t; 404/415/503 a dokumentált ok szerint |
| Kezdeti/végső DB-hiba és presignhiba | PASS: generikus DATABASE_UNAVAILABLE/STORAGE_UNAVAILABLE, provideradat vagy URL nélküli nested error |
| UUID/query/body, 120/perc user-ablak, más user és külön listabudget, 4096-os kapacitás | PASS: szigorú 36-karakteres UUID (trailing newline tiltva), safe GET őrök, felfelé kerekített Retry-After és lejárati újrahasznosítás |
| Controller/module/filter | PASS: SessionGuard → FilePreviewGuard, GET és no-store; csak url/expiresAt publikus, nincs storage-/owner-metaadat az error bodyban |

Független backend/security review nem talált blokkoló hibát; a numerikus deadline a presignnek átadott Date módosításától is független. A service nem tart nyitott DB-tranzakciót a provider I/O alatt, és nincs file/usage/derived/audit írás. A megosztott FileIdPipe hosszellenőrzését az új UUID-regresszió fedi, a régi confirm/init/lista tesztek is sikeresek.

**Bizonyítékhatár:** a DB és provider doubles, illetve a mockolt signer parancsparaméterei unit bizonyítékok. Nem igazolják a valódi SQL/HTTP-fejléceket, MinIO GET/CORS-képbetöltést vagy egy már kiadott read URL azonnali revokációját. A capability a TTL alatt session nélkül is használható; logout nem vonja vissza. A frontend galéria/preview, letöltési endpoint, thumbnail/processor és teljes kézi DB/storage/browser elfogadás külön feladat.

## Saját képek listázása – GET /files, 2026-10-27

Verzió: `feature/list-own-images`, `4500045` main és a `fde61c1` dokumentált galériaszerződés után. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, Prisma 7.10.1, Jest/Vitest izolált runnerek. Nincs frontend-/preview-/séma-/dependency-változás; valódi PostgreSQL/MinIO/HTTP próbát ez a futás nem végzett.

**Unit:** `npm test` PASS: **512 backend** (13 suite) + **220 frontend** (9 fájl) + **2 container helper** = **734 eset**. Ebből 83 új `backend/test/file-list.spec.ts` eset; előzetesen a 82-es célzott futás is PASS volt, majd külön plusz projekciós regresszió került be. A végleges `npm run typecheck` és `npm run build` mindkét workspace-re PASS; 48 helyi dokumentációs link, git diff --check és a tényleges környezeti credentialök repó-/frontendbundle-ellenőrzése is PASS.

| Bemenet/lépés | Elvárt és tényleges unit eredmény |
|---|---|
| Üres query, limit 1/20/100 és hibás/extra/ismételt query | PASS: default 20, szigorú kanonikus egész; hibás limit VALIDATION_ERROR 400, hibás cursor CURSOR_INVALID 400 |
| Base64url/UTF-8/JSON/v1/scope/UUID/UTC ezredmásodperc/max512 | PASS: hibás/hiányzó/extra mező, padding/padbit, érvénytelen dátum és trailing newline elutasítva; valid pozíció roundtrip pontos |
| Saját/idegen owner, ACTIVE/pending/törölt, kép/video, null/eltérő MIME | PASS: az egyetlen Prisma where owner+ACTIVE+allowlist+MIME-mezőegyezést tartalmaz, minden cursoros oldalon is |
| 105 képes statikus fixture, több azonos createdAt, 1/20/100-as oldalméret | PASS: teljes elvárt DESC sorrend kihagyás és ismétlés nélkül; cursor az utolsó visszaadott sorból, nem lookaheadből |
| Törölt horgony, oldalméretváltás, más user cursorja, üres/beyond-end/exact-limit oldal | PASS: stabil tuple-folytatás, nincs horgony-404 vagy owner-határ átlépés; üres 200 és null/false végjelzés |
| Hétmezős select és explicit mapper, túl bő DB-double válasz, BigInt határok | PASS: nincs owner/key/URL/receipt; méret biztonságos JSON szám, hibás/nem biztonságos érték nem kerekítődik csendben |
| DB-kivétel | PASS: DATABASE_UNAVAILABLE 503, generikus üzenet, nem hamis üres lista/provideradat |
| 60 user-kérés/perc, két user, ablakhatár és 4096-os mapkapacitás | PASS: külön ablak, 429 és felfelé kerekített Retry-After, lejárt bejegyzések újrahasznosítása |
| Controller/module metadata és globális filter | PASS: SessionGuard → FileListGuard, GET/no-store, user kizárólag sessionből; nested code/details/requestId és megőrzött Retry-After |

A CORS exposedHeaders konfiguráció Retry-After-rel bővült; valódi browser/CORS visszaolvasás nem történt. A service kizárólag Prisma+config függőséget kap, a listázás nem kér storage-hozzáférést és nem módosít foglalást/usage-ot. Független backend/security review nem talált blokkoló hibát.

**Bizonyítékhatár:** a query double a Prisma-paraméterek szerkezetét és determinisztikus modellezett szűrést/rendezést igazolja; nem helyettesíti a PostgreSQL-lekérdezés vagy a teljes Nest/HTTP/adatbázis-folyamat tényleges próbáját. A preview végpont, frontend galéria és valós SQL/browser elfogadás továbbra is külön feladat. Új integration/e2e suite nem készült.

## Szerzői kézi feltöltési próba – visszaigazolva 2026-10-27

**Eredmény: PASS a felületen megfigyelt sikeres feltöltésre, a szerző visszajelzése alapján.** A formátumkorrekció elkészülte után a szerző manuálisan tesztelte a feltöltést, és ezt jelezte: „sikeresen teszteltem a feltoltest”. Ez a korábbi, kizárólag unit/SSR és helyi fájl-előkészítési bizonyítékot pozitív kézi alkalmazáspróbával egészíti ki.

| Jegyzőkönyvi mező | Rögzített adat |
|---|---|
| Ellenőrző és bizonyíték | A szakdolgozat szerzője; közvetlen visszajelzés ebben a projektbeszélgetésben. Nem az AI saját böngészős futtatása és nem külső UAT. |
| Dátum | A visszajelzés dátuma 2026-10-27; külön tesztidőpont nem lett megadva. |
| Kapcsolódó verzió | Formátumjavítás: `9073970`, [PR #26](https://github.com/ngymarcy88/adattarolas-a-felhoben/pull/26). A ténylegesen tesztelt build/commit külön nem lett megadva; nem állítjuk, hogy már mainre merge-elt verzió. |
| Környezet | A szerző saját alkalmazáskörnyezete; böngészőverzió és indítási mód nem lett külön rögzítve. |
| Bemenet és előzmény | Képfeltöltés újrapróbálása a javítás után. Az előző hibajegy két JPEG-tartalmú, PNG-kiterjesztésű fájlra vonatkozott; az új próba pontos fájllistája/darabszáma nincs külön megerősítve. |
| Lépés, elvárt és tényleges eredmény | A feltöltési felület manuális kipróbálása; elvárt a sikeres feltöltés, ténylegesen a szerző sikeres feltöltést igazolt vissza. Részletes kattintássorozat vagy külön mezőnkénti megfigyelés nem került átadásra. |
| Képernyőkép | Ehhez a sikeres próbához új képernyőkép nem érkezett; a korábbi kép a javítás előtti hibát mutatja. |

**A 7. pont állapota: részben igazolt.** A pozitív kézi feltöltési út visszaigazolt. A közvetlen PostgreSQL-/MinIO-állapot, tényleges MIME/fájlnév, fájl-/audit-darabszám és pontos tárhelyelszámolás külön ellenőrzése még nincs e próba részeként dokumentálva. Hálózatmegszakítás/retry, ismételt confirm miatti duplikációmentesség, negatív fájlesetek és munkamenet-lejárat kézi próbájáról sem érkezett most eredmény; az ezekre meglévő unit bizonyíték külön szerepel lent. A teljes 7. pont és a cleanup fizikai release-proofja ettől nem zárult le.

## Tartalom alapján javított képformátum – 2026-10-27

Verzió: `fix/detect-upload-image-format`, `63b5331` main baseline és a `8fa3fd2` ágon merge-elt #25 UI átvezetése után. A #25 az előző feature ágba került, ezért a mainhez a UI-függőséget is be kellett emelni. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, meglévő Jest/Vitest/TypeScript. Nincs új dependency, backend endpoint vagy migráció.

**Unit:** `npm test` PASS: 429 backend + 220 frontend + 2 container helper = **651 eset** (47 új frontend formátum/batch/template regresszió). A kezdeti 218-as frontend futás is PASS volt; a TS-ellenőrzésben a tesztfixture Uint8Array általános ArrayBufferLike típusa DOM BlobPart-hoz túl tág volt, ArrayBuffer-paraméterrel pontosítva. A végleges `npm run typecheck` és `npm run build` mindkét workspace-re PASS. A helyi Markdown-linkek és a tényleges környezeti credentialök repó-/frontendbundle-ellenőrzése is PASS.

| Bemenet/lépés | Elvárt és tényleges eredmény |
|---|---|
| JPEG/PNG/GIF87a/GIF89a/WebP VP8/VP8L/VP8X prefix, hiányos/ismeretlen/HTML/SVG/XML fejléc | PASS: négy támogatott MIME, ismeretlen tartalom init nélkül elutasítva |
| JPEG-bájtok PNG-névvel/browser MIME-mal | PASS: image/jpeg és .jpg név; változatlan bájt/méret/lastModified; eredeti File érintetlen |
| Érvényes PNG üres vagy hibás browser MIME-mal | PASS: tartalom alapján image/png, megfelelő név |
| Hiányzó/többszörös/hidden/nagybetűs suffix és 255 kódpontos Unicode név | PASS: típushelyes kiterjesztés, felső határ és Unicode-pár megőrzése |
| Slice/arrayBuffer spy, név-/mérethiba | PASS: legfeljebb 16 fejlécbájt; nem olvassuk a teljes forrást; lokális név-/mérethibánál fejléc és init sem indul |
| Ismeretlen init-kimenetel javított metadata után | PASS: ugyanaz a key/payload/File, nem ismételt fejléc-felismerés |
| Dispose vagy másik worker AUTH_REQUIRED válasza fejléc-olvasás közben | PASS: az olvasás után nem indul init, nincs hamis siker |
| Korrekciós notice HTML-szerű névvel | PASS: eredeti név + magyarázat, Vue escape |

**Helyi reprodukció az érintett két képpel:** a felhasználó által megadott két `.png` fájl tényleges tartalma JPEG/JFIF, egyenként 120396 bájt. A Vite SSR-rel betöltött valódi `prepareImage` függvény mindkettőt image/jpeg és megfelelő .jpg névvel adta vissza. A visszaadott teljes bájtsor `assert.deepEqual` szerint egyezett a forrással. Ez hálózat/DB/object-storage nélküli célzott regresszió: a képek csak helyben lettek olvasva, nem módosultak, nem kerültek a repóba vagy CI-fixture-be, és feltöltés nem történt. Reprodukció: az adott fájlt File-ként PNG MIME-mal átadni a prepareImage-nak, ellenőrizni a JPEG MIME-ot, .jpg suffixet és teljes byteazonosságot.

**Review/korlát:** a független review az új async header-read mellett egy session-race-et jelzett; init előtt új authRequired ellenőrzés és külön regresszió készült. A backend signature/MIME egyezést továbbra is szigorúan ellenőrzi, frontend-korrekcióval sem kerülhető meg. Magic number nem teljes dekódolás vagy sértetlenségi bizonyíték. A letöltési végpont és a 7. pont teljes böngészős/DB/MinIO tesztje továbbra is külön feladat; a helyes név most display/download metaadatként tárolható. A cleanup-proof és régi REJECTED foglalások kezelése nem változott.

## Első képköteg-felület – 2026-10-24

Verzió: `feature/batch-upload-ui`, a `893bd0c` confirm/cleanup commitra építve (függőség: PR #24). Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, meglévő workspace dependencyk, Vitest Node-környezet és Vue SSR template render. Nincs új dependency, adatmodell/migráció, backend endpoint vagy integration/e2e suite.

**Unit eredmény:** 429 backend + 173 frontend + 2 container helper = **604 sikeres eset**; 68 új frontend eset. A frontend kezdeti fixture-jét javítani kellett: a File konstruktor USVString-ként helyettesíti a pár nélküli surrogate-et, ezért a hibás Unicode-metaadatot közvetlen szintetikus objektummal ellenőrizzük. A típusellenőrzés két fejlesztés közbeni hibát jelzett (ES2022-ben nem deklarált isWellFormed, felesleges constructor-spy); a megoldás codepoint-alapú regexp, illetve a felesleges spy eltávolítása. A végleges `npm run typecheck` és `npm run build` mindkét workspace-re PASS; a frontend ismételt 173-as tesztfutása is PASS. A lokális Markdown-linkek és a valódi környezeti credentialök repó-/frontendbundle-ellenőrzése PASS.

| Bemenet és lépések | Elvárt és tényleges unit/template eredmény |
|---|---|
| Támogatott/nem támogatott MIME, üres/100 MiB/limit+1 méret, Unicode/útvonal/vezérlő fájlnév | PASS: helyi korai hiba; invalid fájl nem indít API-t, érvényes testvér továbbhalad |
| Több mint 20 fájl, ismételt picker-választás, három jó fájl két elakított PUT-tal | PASS: 20-as limit/dedupe, legfeljebb két aktív folyamat; a harmadik vár, majd elindul |
| API init/confirm request és szigorú response-ellenőrzés | PASS: include/no-store/redirect error, azonos init-kulcs; confirm body/Content-Type nélkül, csak saját ACTIVE válasz siker |
| Fake XHR File-küldés és 25%/100% progress | PASS: pontos két header, nincs kézi Content-Length/auth, cross-origin withCredentials=false; 100% után confirm állapot, nem korai siker |
| Init-timeout, elveszett PUT-válasz/412, átmeneti confirm-hiba | PASS: azonos key/fileId, előbb confirm; csak UPLOAD_NOT_READY és élő eredeti access után teljes resend |
| Lejárt/null access, ACTIVE init replay | PASS: korábbi siker confirmálható, kész fájl nem kerül újra PUT-ra; nincs credential-megújítás/új kvótafoglalás |
| 422/410/kvótahiba, 429 és Retry-After, ismeretlen/prototípuskulcs-hibakód | PASS: terminális/átmeneti különbség, biztonságos magyar üzenet, kézi késleltetett retry, nincs nyers provideradat |
| AUTH_REQUIRED, dispose aktív PUT közben, késői callback | PASS: további queued fájl nem indul, abort, nincs késői progress/siker vagy confirm |
| Vue SSR: üres picker, átvitel/confirm, siker+hiba, XSS-név, login/disabled | PASS: címkék, progress/status/alert, escape és külön fájlonkénti állapot |

**Független review:** nem talált blokkoló hibát; az error-whitelist `in` vizsgálata helyett Object.hasOwn és külön prototype-key regresszió került be. Az oldalhagyás/foglalásmegtartás és a teljes-file retry korlátja a UI-ban és a README/API/UX dokumentációban is szerepel.

**Böngészős korlát:** a beépített Node/browser-runtime környezeti inicializálási hibával leállt, a fallback Playwrightból hiányzik a Chrome; nem történt sikeres böngészős fájlkiválasztás vagy feltöltés. A tesztek mockolt logikát és SSR HTML-t igazolnak; nem bizonyítják a valódi CORS-t, browser által küldött content-length kikényszerítését vagy az objektum/kvóta tényleges együttműködését. **A 7. pont teljes kézi UI → API → DB/MinIO tesztriportja, képernyőképei és külső UAT továbbra is nyitott.** A jelenlegi cleanup proof-korlátja változatlan.

## Confirm és őrzött cleanup – 2026-10-24

Verzió: `feature/upload-confirm-cleanup`, a merge-elt initet tartalmazó `38cbd80` main után. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, Prisma 7.10.1, PostgreSQL 17.9, Docker Linux engine 26.1.1 és a repóban rögzített MinIO-forrásbuild. Nincs új dependency, séma/migráció, frontend vagy integration/e2e suite.

**Automatikus ellenőrzés:** `npm test` PASS: 429 backend (12 suite) + 105 frontend (5 fájl) + 2 container-helper = **536 unit eset**. Az új confirm/cleanup/signature/guard/worker esetek száma 72. Workspace typecheck/build és Prisma-generálás PASS. A buildelt egyköteges cleanup CLI valódi AppModule-lal sikeresen lefutott: selected/released/blocked/retry/skip/failed mind 0, nem volt esedékes pending rekord a kontrollált fixture-ek eltávolítása után. A proof-függő release ág csak szintetikus, megbízható proof-fixture-rel unit tesztelt; **nem valós provider-bizonyíték és nem aktív produkciós képesség**.

**Helyi HTTP/DB/MinIO-próba:** az aktuális buildből valódi AppModule/NestFactory, request-ID middleware és globális filter indult véletlen loopback porton. Két szintetikus `.invalid` fiók, 2000 bájtos kvótával; véletlen UUID-k, memóriában tartott session-cookie-k és egy 68 bájtos 1×1 PNG volt a bemenet. A kliens tényleges presigned Blob PUT-ot küldött a privát MinIO-ba. A válaszok/tokenek/URL-ek nem kerültek logba vagy fájlba.

| Lépések | Elvárt és tényleges eredmény |
|---|---|
| Hiányzó Origin/session, hibás UUID, JSON body | PASS: 403/401/400/400 |
| Idegen és hiányzó fileId | PASS: mindkettő FILE_NOT_FOUND 404, nincs ownership-szivárgás |
| Confirm a PUT előtt | PASS: UPLOAD_NOT_READY 409, OPEN/foglalás megmarad |
| Valódi PNG PUT, majd hat egyidejű confirm | PASS: mind 200 ACTIVE, pontosan egy 68 bájtos reserved→used átvezetés és egy UPLOAD_CONFIRMED audit |
| Ismételt ACTIVE confirm | PASS: 200, nincs új könyvelés/audit |
| PNG-ként deklarált, azonos méretű ismeretlen tartalom | PASS: tartós 422 REJECTED, ismételve ugyanaz; foglalás megmarad |
| Cleanup a REJECTED műveletre proof nélkül | PASS: blocked, WRITE_CLOSURE_UNPROVEN és retry-idő; az objektum HEAD-del még jelen, reserved változatlan, writesClosedAt/release null |
| Szintetikus, már lejárt OPEN fixture | PASS: confirm 410 EXPIRED; cleanup blocked; az 1 bájtos foglalás megmarad |
| Kontrollált range-read hiba, majd egészséges retry | PASS: 503 UPLOAD_VERIFICATION_UNAVAILABLE és OPEN, majd sikeres 200 |
| Kontrollált audit-create hiba a valódi tranzakció utolsó lépésénél | PASS: 503 DATABASE_UNAVAILABLE; file PENDING/receipt OPEN és mindkét számláló változatlan; normál HTTP retry sikeres |

A reprodukció: működő helyi PostgreSQL/MinIO, alkalmazott commitolt migrációk és backend build mellett indítsd az API-t, két saját szintetikus userrel. Az API-szerződés szerinti initből kapott URL-re küldj Blob PUT-ot, majd body nélküli confirmot. Párhuzamossághoz hat egyidejű HTTP-kérés kell; a DB-ben ownerhez kötve ellenőrizd a FileObject/UploadOperation/User és audit darabszámot/állapotot. A hibás tartalom ugyanolyan hosszú, signature nélküli bájtsorozat. Az expiry-eset kizárólag saját fixture-en, konzisztens múltbeli t0/+5/+15 perces időkkel készült. A provider-/audit-hibák csak az ideiglenes harness saját service-példányába injektálva futottak. A harness nincs bekötve a unit/CI suite-ba. Végül minden ismert PUT befejeződését megvárva csak a saját szintetikus objektumok, sorok és auditok törlődtek; alkalmazásadat/volume nem. Ez a kontrollált fixture-takarítás nem általános cleanup-proof.

**Késleltetett PUT kísérlet:** külön véletlen objektumkulcson 2 másodperces presigned joggal indult HTTP PUT. A kliens az első 4 PNG-bájtot elküldte, majd 3 másodpercet várt; az URL lejárta után HEAD és DELETE indult. Egy másodperc múlva mindkettő még várt. A PUT maradékának elküldése után a PUT **200** lett; HEAD jelenlétet látott, DELETE sikerült, a végső objektum hiányzott. Következtetés: a lejárat nem zárja le a már elfogadott PUT-ot. A megfigyelt MinIO-zárolás egyetlen ismert kérésnél nem bizonyítja az összes lehetséges in-flight írás végét; ebből sem készült writesClosedAt. A próba csak saját kulcsot érintett és végül takarított.

**Review-javítások:** a REJECTED végső írásánál is ellenőrizni kell a közben elért határidőt: rollback után külön zárolt körben EXPIRED az eredmény. A success-ágnál ugyanilyen végső deadline és rollback védi a könyvelést. A mock SQL-tranzakció fixture ezért snapshotból visszaállítja a hibás callback módosításait; ez nem helyettesíti a fenti valós rollback-próbát. Leállításkor a worker AbortSignal-lel megszünteti a batch további elemeit, az aktuális fájl próbáját megvárja. Mindkettő új unit regresszióval ellenőrzött.

**Nyitott kapu:** a jelenlegi adapter nem állít elő megbízható íráslezárási bizonyítékot, ezért valós automatikus fizikai pending-delete/reservation-release még **blokkolt**. A cleanup őrzött mechanizmusa és retry-ja kész, a teljes 5. pont fizikai felszabadítási feltétele nincs lezárva. Receipt-pruning, aktív purge, browser-flow és teljes képintegritás/processor továbbra is külön feladat.

## Upload-init backend – 2026-10-24

Verzió: `feature/upload-init`, `6294b6e` main baseline utáni init-szelet; a PR commitjai adják a végleges kódot. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, Prisma 7.10.1, meglévő helyi PostgreSQL 17.9 és MinIO, Docker Linux engine 26.1.1. Nincs új dependency vagy migráció.

Automatikus ellenőrzés: a teljes `npm test` 461 PASS (354 backend, 105 frontend, 2 container helper); három további határeset hozzáadása után az upload-init célzott újrafuttatása **74/74 PASS**. A végleges suite így 464 eset; a teljes végleges futást a PR CI-je ellenőrzi. A `npm run typecheck` és `npm run build` PASS mindkét workspace-re; a Prisma-generálás is sikeres. Nincs új telepítés/migráció.

A `backend/test/upload-init.spec.ts` unit esetei a szigorú DTO/headereket, NFC/codepoint-határt, Python hashlib-fix fingerprintet, guard-sorrendet és limitert, új initet/replay-t, BigInt-kvótát, párhuzamos győztes visszaolvasását, sign közbeni állapot-/határidőváltozást, tartós terminális ágakat és DB/presign/commit hibákat ellenőrzik. A filter-unit az új no-store hibafejlécet is ellenőrzi. Mockolt tranzakció önmagában nem bizonyít PostgreSQL rollbacket vagy sorzárolást.

**Kézi HTTP/DB-próba:** ideiglenes helyi harness az aktuálisan buildelt AppModule-t valódi NestFactory-val, request-ID middleware-rel és globális filterrel, véletlen loopback porton indította. Két saját szintetikus `.invalid` user, 150/1000 bájtos kvóta, 100 bájtos PNG-metaadat, véletlen owner/init UUID és a meglévő SessionService által csak memóriába kiadott cookie volt a bemenet. A frontend nem futott. Storage PUT nem történt, a presigned URL-ek/tokenek nem kerültek kimenetre vagy fájlba.

| Lépés | Elvárt és tényleges eredmény |
|---|---|
| Valódi Nest indítás és DB-csatlakozás | PASS a lenti bekötési javítás után |
| Hiányzó Origin/session, extra owner mező, SVG | PASS: rendre 403/401/400/415 |
| Hat egyidejű, azonos owner+kulcs kérés | PASS: egy 201 és öt 200, egy fileId/receipt, azonos URL-lejárat, pontosan 100 reserved és 0 used |
| Más payload ugyanazon kulccsal | PASS: IDEMPOTENCY_CONFLICT, új foglalás nélkül |
| Új kulcs, elégtelen kvóta; öt ilyen kérés párhuzamosan | PASS: QUOTA_EXCEEDED; a reserved változatlanul 100 |
| Más owner ugyanazzal a klienskulccsal | PASS: külön 201 és saját fájl/foglalás |
| Új service-példányból ugyanazon kulcs replay | PASS: ugyanaz a tartós fileId, nincs új foglalás; ez nem teljes folyamat-újraindítási próba |
| Kontrollált hiba a valódi DB-tranzakció file-create és receipt-create lépése között | PASS: DATABASE_UNAVAILABLE, PostgreSQL rollback; sem árva file, sem új reservation nem maradt |
| Másik tranzakció által tartott User-lock | PASS: 3s lokális SQL lock_timeout után 503 DATABASE_UNAVAILABLE, reserved változatlan |

A reprodukcióhoz indítsd a meglévő PostgreSQL-t, alkalmazd a commitolt migrációkat, buildeld a backendet. Az initet a fenti szintetikus bemenetekkel és a dokumentált cookie/Origin/JSON/Idempotency-Key fejlécekkel hívd; a válaszokat memóriában tartva ellenőrizd a státuszokat és a DB-ben a saját ownerhez tartozó counts/used/reserved értékeket. Párhuzamossághoz azonos időben indított hat HTTP-kérés kell. Rollbackhez kizárólag e próba service-példányában, a valódi transaction kliens receipt-create hívásánál injektálj hibát. A harness nincs a unit/CI suite-ba kötve. A próba vége minden elindított kérést megvárt, majd kizárólag saját szintetikus upload/file/user sorait távolította el. Mivel PUT nem történt és a jogok nem hagyták el a folyamatot, ez nem termék-cleanup vagy általános íráslezárási bizonyíték.

**Talált és javított hibák:** a független forrásreview megfelelőnek ítélte a guard-exportot, de a tényleges Nest indítás `UnknownDependenciesException` hibát jelzett: a FilesModule guardjához SessionService/AuthService export is kell. Ezt javítottuk. Az installed Nest forráskódja igazolta, hogy passthrough válasznál az alap POST 201 felülírhatja a kézzel beállított 200-at; ezért a controller explicit státusz+JSON választ küld. A tényleges párhuzamos HTTP-próba a 201/200 különbséget is igazolta. A DB-lock várakozás külön lokális SQL-határidőt kapott a Prisma timeout mellett.

A helyi Markdown-link/secret/diff ellenőrzés szintén sikeres.

**Nyitott:** confirm, magic-number, automatikus expiry/cleanup/release, valódi browser/file PUT, galéria és resumable import nem része ennek a szeletnek. A foglalás lejárattal nem szabadul fel. A `writesClosedAt` bizonyítási kapu továbbra is nyitott; az init és e szintetikus próba nem zárja le.

## Upload Prisma-séma és migráció – 2026-10-23

Verzió: `feature/upload-schema-migration`, `4be1b7c` main baseline utáni sémaszelet; a végleges kódot a PR commitjai azonosítják. A sémaszelet eredetileg mainről külön készült; a végső ellenőrzés előtt a #21-es adaptert tartalmazó `b20f14d` mainnel össze lett fésülve. Környezet: WSL Bash, Linux Node 22.23.2/npm 10.9.8, Prisma 7.10.1, Docker Linux engine 26.1.1 és a Compose PostgreSQL **17.9** service-e. Nem futott új integration/e2e suite vagy böngészőteszt; ez explicit kézi SQL-migrációpróba és meglévő unit regresszió.

| Ellenőrzés | Elvárt és tényleges eredmény |
|---|---|
| `npm run db:validate`, `npm run db:generate` | PASS: séma valid, kliens generálható |
| `npm test` | Első sémaszelet: 328 PASS; a #21-et tartalmazó friss main integrálása után **390 PASS** (2 helper + 283 backend + 105 frontend) |
| `npm run typecheck`, `npm run build` | PASS: mindkét workspace és Prisma-generálás |
| Új migráció friss, elkülönített sémán | PASS: a kezdeti és az upload-migráció együtt alkalmazható |
| Upgrade meglévő szintetikus user/ACTIVE fájl/share mellett | PASS: teljes sor-JSON összehasonlítás szerint minden korábbi adat változatlan |
| Dedupe, ownership és állapotkényszerek | PASS: a lent felsorolt 26 SQL-állítás elvárt eredménye teljesült |
| Legacy pending / orphan reservation | PASS: mindkét eset visszagörget; sor és foglalás megmarad, új tábla/enum nem marad |
| Normál helyi `npm run db:migrate`, majd ismétlés | PASS: migráció alkalmazva; ismételve nincs függő migráció. Az előzetes read-only ellenőrzés 0 pendinget és 0 nem nulla reserved számlálójú usert talált |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS: No difference detected. Ez nem vizsgálja a Prisma DSL-ben nem reprezentálható CHECK-eket; azokat a SQL-próba fedte |

Bemenet: csak szintetikus, `.invalid` emailes fiókok, UUID-k, 100 bájtos fájlmetaadat, 1000 bájtos kvóta, `v1:` + 64 hex fingerprint és rögzített UTC időpontok. Nincs bináris feltöltés vagy object-storage művelet. A SQL-próba ideiglenes helyi harnessből Docker `compose exec -T postgres` → `psql -X -v ON_ERROR_STOP=1` útvonalon futott, a konténer meglévő DB-azonosságával, credentialkiírás nélkül. A harness nincs bekötve npm/CI alá.

Reprodukciós lépések: hozz létre négy véletlen nevű, kizárólag a próbához tartozó PostgreSQL-sémát; minden kapcsolaton állítsd a `search_path`-ot erre. Alkalmazd a változatlan `20261018000100_initial_core/migration.sql`-t, majd a [20261023000100_upload_operations migrációt](../../backend/prisma/migrations/20261023000100_upload_operations/migration.sql). Az egyik séma üres, a másodikban meglévő aktív fájl/share, a harmadikban pending+100 reserved, a negyedikben fájl nélküli 100 reserved legyen a migráció előtt. Utóbbi kettőn a migráció hibája után külön kapcsolatról ellenőrizd a rollbacket. A validált sémán tranzakciós savepoint/PLpgSQL exception subtransaction alatt próbáld a negatív írásokat, ellenőrizve a tényleges SQLSTATE/constraint-et. Végül kizárólag e saját próbasémákat távolítsd el; alkalmazásadat vagy kötet nem törölhető.

A 26 PASS: friss lánc; aktív upgrade-adatmegőrzés; azonos owner+kulcs 23505; második file-operation 23505; más owner fájlja 23503; eltérő owner azonos init-kulccsal megengedett; nem v4 UUID; hibás UUID-variant; hibás fingerprint; OPEN closedAt-tal; REJECTED és EXPIRED null hibakóddal; FINALIZED hibakóddal; REJECTED expiry-kóddal; release bizonyíték nélkül; release a bizonyíték előtt; 24 óránál rövidebb receipt; infinity-bizonyíték; létrehozás előtti closedAt; file/user Restrict törlés; korábbi quota- és size-CHECK megtartása; szabályos finalized/rejected/released sorok; kétféle legacy-preflight rollback.

Az első Prisma-validálás az összetett one-to-one relációnál a teljes `(fileObjectId, ownerId)` unique kulcsot is megkövetelte; ezt a sémába és SQL-be is felvettük a külön `fileObjectId` unique mellé. Újabb validálás/generálás és független séma/SQL-review PASS. Ez nem új termékkövetelmény.

A végső 183 helyi Markdown-link, a tényleges credentialértékek repo/frontend-bundle ellenőrzése, `git diff --check` és a kezdeti SQL-migráció változatlansága PASS.

**Korlát:** a SQL sor-CHECK-ek nem igazolják a cross-row kvótakönyvelést, tranzakciós állapotátmenetet, fingerprint-képzést, automatikus pruningot vagy storage-quiescence-t. A `writesClosedAt` csak nullable bizonyítékmező; a migráció nem tölti ki. Init/confirm/cleanup és a következő üzleti unit tesztek külön lépések.

## MinIO/S3 storage adapter – 2026-10-23

Verzió: `feature/minio-storage-adapter`, a `4be1b7c` main baseline utáni adapterváltozás; a PR commitjai azonosítják a végleges kódot. Környezet: WSL Bash, Node 22.23.2/npm 10.9.8, Windows Docker Desktop Linux engine 26.1.1, a repóban rögzített MinIO `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, privát bucket és bucketre korlátozott alkalmazáscredential. Csak MinIO indult el; a próbához PostgreSQL, backend HTTP-szerver és frontend nem szükséges. Ez fejlesztői provider-próba, nem UAT vagy teljes user flow.

| Ellenőrzés / lépések | Elvárt / tényleges eredmény | Bizonyíték |
|---|---|---|
| `npm test`: container helper, backend, frontend | PASS: 2 + 283 + 105 = **390 unit teszt** | 9 Jest suite, 5 Vitest fájl; a runner exit 0 |
| `npm run typecheck` | PASS: Prisma generation és mindkét workspace | exit 0 |
| `npm run build` | PASS: Prisma generation, Nest build, frontend typecheck és Vite build | exit 0 |
| MinIO `compose up -d --wait minio`, majd `compose run --rm minio-init` | PASS: healthy service, privát bucket és scoped user | Windows Docker CLI; root `.env` nem került kimenetre |
| `node scripts/verify-storage.mjs` a backend build után | PASS: 11 megnevezett provider-ellenőrzés | A verziózott script determinisztikus állításai és PASS kimenete |

A script bemenete egy 68 bájtos szintetikus 1×1 PNG, négy véletlen `originals/<ownerUUID>/<fileUUID>` kulcs és az alkalmazáscredential. Ellenőrzések: hiányzó kulcs null; hiányzó/nem elérhető bucket nem null; automatikus Blob Content-Length mellett sikeres presigned PUT; ugyanazzal az URL-lel más bájtok feltöltése 412; HEAD és 8 bájtos If-Match range pontos egyezés; külön friss kulcsokon eltérő méret, módosított Content-Type, illetve hiányzó If-None-Match elutasítása és az objektumhiány ellenőrzése; aláírt download bájt-/disposition-egyezés; anonim GET 403; CORS OPTIONS 204, megfelelő origin, PUT és mindkét header. Végül a script minden saját kulcsát kétszer törli, és HEAD-del ellenőrzi a hiányt. Más kulcsot, bucketet és DB-rekordot nem töröl. A Compose-config validálása, `git diff --check`, 181 helyi Markdown-link és a valódi `.env` credentialértékek repo/frontend-bundle ellenőrzése is PASS.

A próba közben a kombinált hibás-header kérés 400-at adott a várt 403 helyett. A végleges próba külön vizsgálja a két headert, és mindkét szabályos 400/403 elutasítást elfogadja; sikeres objektum nem maradhat utánuk. A HEAD általános 404 válasza unit review során külön bucketellenőrzést kapott, így konfigurációs hiba nem igazolhat véletlenül objektumhiányt.

**Nyitott kapuk:** a HTTP preflight és Node Blob feltöltés nem tényleges böngészőteszt. AWS/OCI runtime nem volt elérhető. Az ETag nem checksum; a prefix nem teljes képintegritás. A már megkezdett PUT biztos lezárása/cleanup-verseny nincs bizonyítva (`writeClosureEvidence = 'unproven'`), ezért `writesClosedAt`, kvótafelszabadítás vagy a teljes upload készenléte ebből nem következik. A törléspróba csak a saját, már befejezett kérésekre bizonyít fizikai törlést. URL-lejárat, támadó párhuzamos PUT és böngészős viselkedés további célzott próba; init/confirm/cleanup/DB-accounting még nincs implementálva.

## GitHub Actions unit CI – 2026-10-22

Vizsgált változat: `feature/unit-test-ci`, `fe5887d` main baseline utáni CI-iteráció. A szerző külön engedélyezte a meglévő tesztek Actions-futtatását. A workflow az `.nvmrc` szerinti Node-ot, root lockfile-t, `npm ci`, `npm run db:generate`, majd `npm test` parancsokat használja Ubuntu 24.04 alatt. Nincs service container, valódi credential vagy deployment; a DATABASE_URL szintetikus, a generálás nem kapcsolódik DB-hez.

Statikus ellenőrzés: workflow YAML és trigger-set, read-only permission, teljes SHA-pinek PASS (PyYAML). Az action-referenciák a hivatalos repositoryk v6 Git-refjeivel összevetve helyesek. Független workflow/security review nem talált javítandó hibát. A Node `yaml` modul első próbán nem volt telepítve; a YAML-ellenőrzés a meglévő Python/PyYAML használatával sikerült, dependency telepítése nélkül.

A helyi Prisma-generálás CI=true és a workflow szintetikus DATABASE_URL értékével PASS. A helyi `CI=true DATABASE_URL=<szintetikus URL> npm test` PASS: 8 backend suite / 213 teszt és 5 frontend fájl / 93 teszt, összesen **306**, 0 failed/skipped. Környezet: WSL, Linux Node 22.23.2, npm 10.9.8; meglévő függőségek, újratelepítés nélkül. A tényleges GitHub-hosted futás külön ellenőrzés; a statikus konfiguráció vagy helyi siker önmagában nem sikeres CI-futás. **Tényleges GitHub-hosted CI: PASS.** [Tests #1 futás](https://github.com/ngymarcy88/adattarolas-a-felhoben/actions/runs/39751340008), workflow-commit `0ea63bd`, job `Unit tests` (119732390430). A GitHub API alapján minden lépés sikeres: checkout, Node setup, tiszta `npm ci`, Prisma-generálás, `npm test` és post lépések. A run a [PR #19](https://github.com/ngymarcy88/adattarolas-a-felhoben/pull/19) pull_request eseményére indult; nincs kézi triggerre vagy main-pushra vonatkozó külön futtatási bizonyíték ebben a bejegyzésben. Ez a futás a workflow-kódot igazolja; az eredmény dokumentálása későbbi docs-commitot eredményezhet.

A helyi link/secret/diff ellenőrzés PASS (160 helyi hivatkozás a PR előtti állapotban). A unit suite nem integrációs/böngészős működési bizonyíték.

## Auth kézi ellenőrzése és újraindítás utáni belépés – 2026-10-20

**Eredmény: PASS a szerző által visszaigazolt folyamatokra.** Ellenőrző: a szakdolgozat szerzője, saját helyi gépén. Módszer: kézi böngészős használat, majd az alkalmazás újraindítása és ismételt belépés. Ez szerzői fejlesztői ellenőrzés, nem AI által végrehajtott teszt, automatizált e2e vagy külső UAT.

- Kapcsolódó fejlesztési változat: `feature/full-app-compose`, `39e212b` (jelszómegjelenítés és élő követelmények), [PR #17](https://github.com/ngymarcy88/adattarolas-a-felhoben/pull/17). A ténylegesen futó image commitját a szerző nem adta meg külön; ez a verziókapcsolat fejlesztési referencia, nem ellenőrzött image-azonosító.
- Környezet: a szerző Windows gépén futó helyi Docker Compose-alkalmazás és böngésző. A Docker Desktop/Compose és a böngésző pontos verziója nincs rögzítve.
- Bemenet: a szerző által korábban létrehozott fiók és a hozzá tartozó helyes belépési adatok. Email, jelszó, cookie és token nem kerül a riportba.
- Bizonyíték: a szerző beszélgetésbeli visszajelzése. Először működő alkalmazást és fióklétrehozást jelzett, majd a „belépés → védett fiókoldal → kijelentkezés, újraindítás után ismét belépés” ellenőrzésére kifejezetten azt válaszolta, hogy működik. Képernyőkép, parancskimenet és közvetlen DB-lekérdezés nem érkezett.

| Azonosító | Lépés | Elvárt eredmény | Tényleges eredmény | Minősítés |
|---|---|---|---|---|
| AUTH-M01 | Fiók létrehozása a regisztrációs felületen | Létrejön a később belépésre használható fiók | A szerző sikeres fióklétrehozást jelzett | PASS, szerzői visszajelzés |
| AUTH-M02 | Belépés helyes adatokkal | A felhasználó eljut a védett fiókoldalra | A szerző visszaigazolta a sikeres belépést és fiókoldalt | PASS, szerzői visszajelzés |
| AUTH-M03 | Kijelentkezés a fiókoldalról | A felhasználó kijelentkezik | A szerző a folyamat kijelentkezési lépését is működőnek jelezte | PASS, szerzői visszajelzés |
| AUTH-M04 | Újraindítás, majd ismételt belépés ugyanazzal a fiókkal | A fiók az újraindítás után is használható | A szerző visszaigazolta az ismételt belépést | PASS, szerzői visszajelzés |

**Következtetés:** a pozitív auth-alapfolyamat és a fiók újraindítás utáni használhatósága kézzel kipróbált, a szerző által visszaigazolt. Az ismételt belépés a fiók megmaradásának felhasználói szintű bizonyítéka; nem teljes adatbázis- vagy MinIO-adatmegőrzési vizsgálat.

Külön még nem igazolt: kijelentkezés után a `/app` közvetlen újranyitásának tiltása/átirányítása, hibás jelszó és lejárt munkamenet, cookie-attribútumok böngészős vizsgálata, közvetlen DB-rekord és storage-próbaobjektum megmaradása. A jelszó-UX-re kapott általános „működik” visszajelzés nem jelent minden karakterfeltétel, billentyűzet/fókusz vagy autocomplete külön dokumentált próbáját. Képernyőkép később csatolható, de ebben a bejegyzésben nincs nem létező képmelléklet. A teljes SZD2-1 mérföldkő ezzel önmagában nem zárul le.

## Jelszómegjelenítés és élő regisztrációs policy – 2026-10-20

Vizsgált változat: `feature/full-app-compose`, `4744c69` utáni auth-kiegészítés. Környezet: WSL/Linux Node 22.23.2, npm 10.9.8; szintetikus jelszó-fixture-ök, mockolt auth/perzisztencia, Vue SSR template-render. A szerző új összetételi szabályokat kért; a 15-ös minimumot a NIST-forrás ellenőrzése után megtartottuk. Ez nem teljes NIST-megfelelőségi állítás.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| `npm test` | PASS: 2 container-helper + 221 backend + 105 frontend = **328 unit/template teszt**; 0 failed/skipped |
| `npm run build` | PASS: Prisma-generálás, NestJS, vue-tsc és Vite production bundle |
| Link/secret/diff ellenőrzés | PASS: 140 helyi Markdown-link, tényleges credential nincs a forrásban/frontend bundle-ben; whitespace ellenőrzés sikeres |
| FE/BE regisztrációs policy | PASS: min. 15 kódpont, Unicode nagybetű/számjegy/írásjel vagy szimbólum; külön hiányzó feltételek, whitespace/zero-width nem speciális karakter; kódolt Unicode és 1024 UTF-8 bájtos határ |
| Élő visszajelzés | PASS: közös reaktív formból minden követelmény állapota frissül; a javított jelszó elavult mezőhibája törlődik; érvénytelen jelszó nem jut az API-ig |
| Mutatás/Elrejtés | PASS: külön mezők, változatlan jelszó és nincs submit; rejtés beküldéskor/dispose-kor, pending/siker/dispose után nincs újra megjelenítés; SSR type és ARIA controls/pressed, élő szöveges követelménylista |
| Meglévő fiók kompatibilitása | PASS unit szinten: login rövid és az új összetételnek nem megfelelő meglévő jelszót is ellenőriz, nincs automatikus jelszócsere |
| Független frontend/backend security review | Javítandó hiba nincs; policyparitás, Unicode/bájtkorlát, titokéletciklus, accessibility átnézve |

A korábbi fióklétrehozás a szerző visszajelzése, nem az új policy böngészős elfogadása. Ez az iteráció nem tartalmaz új integration/e2e suite-ot, DB-migrációt vagy dependencyt. Kézi újrateszt: rebuild után régi fiókkal login, minden jelszómező mutatása/rejtése, hibás regisztrációs jelszónál a pontos hiányok, majd mind a négy feltételt teljesítő, egyező jelszóval új szintetikus fiók. Billentyűzet/fókusz és jelszókezelő-autocomplete browser-próba még szükséges; az SSR nem interaktív browser-bizonyíték.


## Szerzői indítási visszajelzés – 2026-10-20

A szerző a Compose-útmutató után azt jelezte: az alkalmazás működik, fiókot létrehozott. Ez saját gépes, felhasználó által jelentett indulási és regisztrációs siker; nem független AI-futtatás és nem külső UAT. Ennél a korábbi visszajelzésnél a pontos futó commit/image és a teljes auth-/újraindítási folyamat még nem volt külön visszaigazolva. A későbbi szerzői ellenőrzés eredményét a riport elején található „Auth kézi ellenőrzése és újraindítás utáni belépés” bejegyzés rögzíti. Az ezt követően készülő jelszópolicy/UX-módosításnak még nincs szerzői újratesztelési eredménye. A korábbi Docker-hiány az akkori AI-kísérlet állapotát írja le.


## Teljes alkalmazás Docker Compose-konfigurációja – 2026-10-20

Vizsgált változat: `feature/full-app-compose`, `197cdec` baseline utáni Compose-iteráció. Környezet: Windows/WSL2, Node 22.23.2, npm 10.9.8. Bemenet: meglévő generált lokális `.env` (értékei nem publikáltak), szintetikus URL-fixture kódolt jelszóval. A várt viselkedés: encoded credential/query megőrzése a konténeres hostcserénél, hibás konfiguráció elutasítása, explicit bind-address validálása, sikeres fordítás és Compose-séma.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| Windows Docker CLI `compose config --quiet` | PASS, a gyökérbeli `docker-compose.yaml` automatikus felfedezésével; feloldott credential nem került kiírásra |
| `npm run test:container` | PASS: 2 Node builtin unit teszt; encoded password, schema és biztonságos hibakezelés |
| `npm run test --workspace backend` | PASS: 8 suite / 215 teszt; bind alapérték és 0.0.0.0 elfogadása, hibás/üres bind elutasítása |
| `npm run build` | PASS: Prisma Client generálás, NestJS fordítás, vue-tsc és Vite production bundle |
| Független Docker/security review | Blokkoló hiba nincs: függőségi kapuk, nem root runtime, secret-kizárás és Nginx SPA fallback átnézve |
| Link/secret ellenőrzés | PASS: 140 helyi Markdown-link; tényleges `.env` credential nincs a forrásban vagy ellenőrzött frontend bundle-ben |
| Teljes Docker image build / indulás | NEM FUTOTT: a Docker Server nem érhető el; a Windows CLI `docker_engine` named pipe hiányát jelzi |

A frontend viselkedése nem változott, frontend unit suite ebben az iterációban nem futott újra. A Compose-config és a host build nem igazolja az image-építést, Nginx runtime-ot vagy a szolgáltatások együttműködését. A health kapu liveness, nem folyamatos DB/storage readiness.

Kézi elfogadás működő Docker motorral: `node scripts/init-env.mjs`, `docker compose up -d --build --wait`, majd `docker compose ps -a`: négy futó/healthy service, db-migrate és minio-init Exited (0). Ellenőrizendő közvetlen /register, /login és /app betöltése, szintetikus regisztráció → belépés → védett profil → logout, tényleges DB-rekord/cookie, privát bucket és korlátozott storage-azonosság. `docker compose down` és ismételt indítás után a DB és a nem érzékeny storage próbaobjektum maradjon meg; `down -v` nélkül. Ez még nyitott saját fejlesztői ellenőrzés, nem UAT vagy tiszta másik gépes telepítési bizonyíték.


## Regisztrációs és belépési felület – 2026-10-19

Vizsgált változat: `feature/registration-ui`, a `dfeec7d` main baseline utáni űrlap-iteráció. Környezet: Windows/WSL2, Linux Node 22.23.2, npm 10.9.8. Szintetikus név/e-mail/jelszó, mockolt API és tényleges Vue reaktív form-kezelő; SSR template-render és memory router. A meglévő backend és sémája változatlan; nincs új dependency, integration/e2e suite vagy CI.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| `npm run test --workspace frontend` | PASS: 5 suite / **93 teszt**, 0 failed/skipped; az előző 55 frontend esethez képest 38 új |
| `npm run typecheck --workspace frontend` | PASS; a build a végleges tesztek/template-ek típusait is újra ellenőrzi |
| `npm run build --workspace frontend` | PASS: vue-tsc és Vite production bundle |
| Független frontend/security review | Nincs javítandó észrevétel; backendhez illeszkedő mezők, pending/dupla-submit, megszakítás/jelszóürítés, success/no-auto-login és ARIA-kapcsolatok átnézve |
| Link/secret/diff ellenőrzés | PASS: 136 helyi Markdown-link, tényleges credential nincs a repóban/ellenőrzött frontend bundle-ben; `git diff --check` sikeres |
| Backend regresszió | A baseline backend kódja változatlan, ebben a kizárólag frontend-szeletben nem futott új backend tesztkör. Az előző 213 backend teszt külön, korábbi bizonyíték; nem állítunk frissen futott 306-os teljes kört |
| Valódi browser/DB-próba | **NEM FUTOTT:** a beépített browser Node REPL ismét `sandboxCwd`/URI környezeti hibát adott. A backend perzisztencia nem változott, a korábban hiányzó valós DB-/cookie-elfogadás továbbra is nyitott |

A form unit tesztek a tényleges két oldal által közösen használt állapotkezelőt hívják: pontos register/login paraméterek, helyi kötelező/név/Unicode/jelszó-bájthatár/megerősítés, meglévő rövid jelszó loginja, beküldés alatti pending és dupla-submit tiltás, 400/409/429/kiesés és váratlan hiba biztonságos üzenete, retry, megerősített regisztrációs siker, auto-login hiánya, jelszóürítés és dispose utáni késői siker/hiba/navigáció kizárása. Az API-klienst 201/409 és hibás 200/204 regisztrációs státuszra is vizsgáltuk; confirmation nem kerül a backendhez. A template-próbák valódi Vue SSR-renderrel ellenőrzik a regisztrációs mezőket, label/ARIA/hibakapcsolatot, loading státuszt és disabled attribútumokat, siker után az űrlap helyetti login linket. Minden végleges elvárás teljesült.

A kezdeti két loading-template assertion tévesen a Tailwind `disabled:` osztályokat is disabled attribútumnak számolta; a teszt valódi attribútumra szűkítve, a termékkód változtatása nélkül javult. Ez nem loading-funkcióhiba volt. Az SSR-próba továbbra sem interaktív browser/DOM bizonyíték.

Kézi elfogadás: kezdőlap → regisztráció; hiányzó/hibás mező és eltérő jelszó érthető javítása; lassú kérés alatt nincs dupla beküldés; 201 után siker és login link, automatikus belépés nélkül; 409-nél biztonságos foglalt-email üzenet; 429 és szerverkiesés után újrapróbálás. Jó login → szerveres session-check → saját profil; rossz login után biztonságos hiba és ürült jelszó. Ellenőrizendő a valódi DB-rekord, browser-cookie, tab/fókusz, natív email-validáció, mobil layout és oldalváltás alatti megszakítás. Ne használj valódi személyes adatot vagy publikálj jelszót/tokenes képernyőképet. Regisztrációs success nem email-verifikáció, a kliensvalidáció nem backend-jogosultság.


## Védett backend végpont és frontend útvonal – 2026-10-19

Vizsgált változat: `feature/protected-route`, a `d18cc7b` main baseline utáni útvonalvédelmi iteráció. Környezet: Windows/WSL2, Linux Node 22.23.2, npm 10.9.8. Szintetikus profilok/jelszavak, mockolt fetch/Prisma-függőségek, tényleges Vue Router memory history és Vue SSR template-render. A már létező `/api/v1/auth/me` valódi védett backend végpontját használjuk, nem hoztunk létre mesterséges példavégpontot. Nincs új dependency, migráció, integration/e2e vagy CI.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| `npm run test --workspace backend` | PASS: 8 suite / **213 teszt**, 0 failed/skipped |
| `npm run test --workspace frontend` | PASS: 4 suite / **55 teszt**, 0 failed/skipped; együtt **268**, az előző 228-hoz képest 40 új eset |
| `npm run typecheck` | PASS: Prisma generate + backend/frontend typecheck; a végső frontend build a módosított template-tesztek típusait is ellenőrzi |
| `npm run build` | PASS: Prisma generate, Nest build, frontend vue-tsc + Vite production bundle |
| Független frontend/security review | Nincs javítást igénylő találat; backend guard, API-validáció, navigációs versenyek, cookie/token határ és lifecycle átnézve |
| Helyi dokumentumlink/secret/diff ellenőrzés | PASS: 137 helyi Markdown-link; tényleges lokális credential nem található a repóban vagy ellenőrzött frontend bundle-ben; whitespace check sikeres |
| Valós böngészős próba | **NEM FUTOTT:** a beépített browser Node REPL környezeti `sandboxCwd`/URI hibával megállt; fallback Playwright Chrome bináris hiányzik (`/opt/google/chrome/chrome`). Nem telepítettünk új browser- vagy tesztfüggőséget |
| Valós DB + böngészős auth-folyamat | Továbbra is nyitott; az előző auth-iterációban a Docker daemon nem volt elérhető, ebben a szeletben a perzisztencia nem változott |

Backend-regresszió: a tényleges controller `/auth/me` metódusán a SessionGuard marad; DB-user hiánya és DB-hiba esetén nincs attached user. A korábbi suite a JWT nélküli/hibás tokent és a tényleges DB-lookup paramétereit is védi. Frontend input/lépések: credentialed login/me/logout; váratlan/érzékeny mező vagy hibás válasz kizárása; 401/400/403/429/503, hálózati hiba, teljes request/body timeout és megszakított JSON-read; a logout csak 204-et fogad el. Router: közvetlen `/app`, hamis kliensprofil, 401 login, kiesés retry, újraellenőrzés és lejárati elutasítás; régi siker/hiba és megszakított navigáció nem állíthat vissza elavult profilt vagy redirectet. Vue template-render: belépőmezők/autocomplete, ellenőrzés alatti adatrejtés, escaped profil és retry link. Elvárt/tényleges eredmények a végleges tesztkörben minden esetben egyeznek.

A template-render **nem** igazol böngészős hydrationt, űrlap-interakciókat, tényleges cookie-tárolást, history/back viselkedést, layoutot vagy külső UAT-ot. A login/logout handler dupla-submit, jelszóürítés és hibás logout viselkedése kódreview-val ellenőrzött, interaktív browser-próba szükséges. Egy kezdeti custom-renderer tesztharness hibásan klienskomponensként mountolta a Vitest node módban SSR-re fordított SFC-ket; ezt helyes Vue SSR template-próbára cseréltük, nem termékkódhibaként kezeltük.

Kézi elfogadás a Quickstart és API-ból szintetikus fiók létrehozása után: cookie nélkül közvetlen `/app` → login; rossz jelszó → biztonságos hiba és ürült jelszó; jó login → ellenőrzés → saját profil; refresh/back és lejárt/törölt cookie → új szerveres ellenőrzés; backend kikapcsolva → adatmentes retry oldal, visszakapcsolva retry → profil; sikertelen logout maradjon javítható hiba, sikeres logout után `/app` ne nyíljon meg új belépés nélkül. Ellenőrizendő a mobil elrendezés, billentyűzet/fókusz, localStorage/sessionStorage tokenmentesség és HttpOnly JS-hozzáférés tiltása. Tétlen oldalon nincs session-polling vagy cross-tab szinkron; backend guard minden védett kérésnél kötelező. Token/PII ne kerüljön screenshotba vagy logba.


## Login/logout/me HttpOnly cookie – 2026-10-19

Vizsgált változat: `feature/cookie-auth`, a `452239f` main baseline utáni auth-iteráció. Környezet: Windows/WSL2, Linux Node 22.23.2, npm 10.9.8. Szintetikus felhasználók/jelszavak/JWT-k. Valós JWT-könyvtár és a meglévő password suite-ban valós scrypt; AuthService unit függőségei mockoltak. Nincs migráció, frontend auth, új integration/e2e suite vagy CI.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| `npm run test --workspace backend` | PASS: 8 suite / **210 teszt**, 0 failed/skipped |
| `npm run test --workspace frontend` | PASS: **18 teszt**, 0 failed/skipped; összesen **228**, az előző 171-hez képest 57 új eset |
| `npm run typecheck --workspace backend` | PASS |
| `npm run build --workspace backend` | PASS |
| Link-, secret- és whitespace-ellenőrzés | PASS: 136 helyi Markdown-link; helyi credentialérték nem került repóba/frontend bundle-be; `git diff --check` sikeres |
| Független security/backend review | Nem talált blokkoló hibát; same-site/HTTPS és stateless logout korlátai az API/ADR-010-ben rögzítve |
| `npm audit --json` | 20 moderate, 0 high/critical; az érintett csomagok a Jest/coverage dev-tooling ágán vannak; jsonwebtoken és közvetlen runtime függőségei nem szerepelnek az advisory-listában. Nem általános biztonsági megfelelőségi bizonyíték, auditfix nem része e szeletnek |
| Licencek | Rögzített `jsonwebtoken@9.0.3`, `@types/jsonwebtoken@9.0.10`: MIT, package metadata alapján. Nincs külső auth-provider vagy adatküldés |
| Kézi HTTP smoke, buildelt tényleges AppModule | PASS: tényleges route/DTO/Origin/guard/scrypt/JWT és cookie response-headerek, **mockolt perzisztenciával**, DB-connect nélkül. Register → login → me → logout → cookie nélküli 401; egységes ismeretlen-user/rossz-jelszó hiba, no-store/HttpOnly/Lax/Path, tokenmentes JSON, idempotens logout, másolt token ADR szerinti replay-korlátja, hibás/dupla cookie, törölt user, DB-hiba/recovery és közös attempt-limit ellenőrizve. Nem valós DB-/browser-igazolás |
| Valós PostgreSQL-/browser-próba | **NEM FUTOTT:** Docker Server nem érhető el (`docker_engine` named pipe hiányzik); frontend auth nincs. A valós perzisztencia, böngészős cookie-tárolás/JavaScript-hozzáférés és production HTTPS környezet külön elfogadási kapu |

Unit-bemenetek és elvárt/tényleges ágak: pontos login DTO, shared email-normalizálás, változatlan jelszó és regisztrációs erősségtől külön login; HS256/issuer/audience/iat/exp/UUID/TTL, más kulcs/algoritmus, hiányzó claim, jövőbeli claim és lejárati határ elutasítása; túlméretes/dupla cookie és bearer figyelmen kívül hagyása; helyi/production cookie-opciók és azonos attribútumú clear; hibás jelszó/ismeretlen email azonos 401 és dummy verify; DB/KDF/sign hibák biztonságos kezelése; register/login közös párhuzamosság és felszabadítás; törölt DB-user 401; idempotens Origin-védett logout. Minden unit-elvárás teljesült. Tesztkód: `backend/test/cookie-auth.spec.ts`, módosított registration/environment/error tesztek.

Kézi következő próba: Quickstart és szintetikus regisztráció után az [API](../03_design/api.md#get-authme) curl-folyamata (200 login + cookie → 200 me → 204 logout → 401 me), valódi User rekorddal. Böngészőben igazolandó a credentials/include működése, HttpOnly miatti JS-olvashatatlanság, tárolási hely, same-site és production Secure/HTTPS; token ne kerüljön képernyőképbe, logba vagy localStorage-ba. Logout nem vonja vissza a korábban másolt JWT-t: ez elfogadott ADR-010 korlát, nem elvárt szerveroldali revokáció. Terhelési benchmark és külső UAT nem készült.


## Backend regisztráció – 2026-10-19

Vizsgált változat: `feature/backend-registration`, a `43f1827` main baseline utáni regisztrációs iteráció. Környezet: Windows/WSL2, Linux Node 22.23.2, npm 10.9.8. Szintetikus adatok, valós scrypt a korábbi password suite-ban; a regisztrációs unit suite Prisma/hash mockot használ. Nincs új npm-függőség, migráció vagy integration/e2e/CI suite.

| Ellenőrzés | Elvárt / tényleges eredmény |
|---|---|
| `npm test` | PASS: 7 backend suite / **153 backend + 18 frontend = 171 teszt**, 0 failed/skipped; az előző 109-hez képest 62 új eset |
| `npm run typecheck --workspace backend` | PASS |
| `npm run build --workspace backend` | PASS |
| Független backend/security review | A Prisma 7 adapter-specifikus unique meta kezelése javítva és unit tesztelve; ismételt review szerint nincs további blokkoló észrevétel |
| Kézi HTTP smoke, buildelt tényleges AppModule | PASS: loopback/ephemeral port, tényleges route/guard/DTO/scrypt; **mockolt Prisma-adattárolás**, startup DB-connect kihagyva. HTTP 201/400/403/409/429/503, safe usermezők, no-store, request ID, nincs Set-Cookie; hash visszaellenőrizve, 503 után új kérés sikeres. Ez nem valós DB-/CORS-/telepítési bizonyíték |
| Link- és secret-ellenőrzés; `git diff --check` | PASS: 135 helyi Markdown-link; helyi credentialérték nem került repóba/frontend bundle-be; whitespace check sikeres |
| Valós PostgreSQL-es regisztráció | **NEM FUTOTT:** a Windows Docker CLI Server nem érhető el (`docker_engine` named pipe hiányzik). Nincs állítás tényleges DB-írásról vagy DB-concurrency bizonyításáról |

Unit bemenetek/lépések: DTO-normalizálás, extra mezők/null/array/rossz típus, email/name/password határok, Unicode/vezérlőkarakter; Origin-hiány/eltérés; öt peer-próba után hatodik elutasítás, időablak lejárta és 1024 peerállapot telítése/felszabadítása; szerverkvóta és csak hash-t tartalmazó Prisma create; publikus response allowlist és ISO dátum; ismételt email P2002 (legacy és tényleges pg-adapter shape); egyidejű drága kérés elutasítása és minden hiba utáni kapacitás-felszabadítás; biztonságos HTTP-mapping és új config-határok. Elvárt eredmény minden pozitív/negatív ág szerint teljesült; tesztkód: `backend/test/registration.spec.ts`, `environment.spec.ts`, `http-exception.filter.spec.ts`.

Még kézzel ellenőrzendő: Docker/Quickstart után az [API](../03_design/api.md#post-authregister) curl példájával 201 és valós `User` rekord (normalizált email, scrypt hash, nulla used/reserved, szerverkvóta); ismétlés és párhuzamos azonos email nem készít második rekordot, 409 megfelelő; Origin nélkül 403; rossz input 400. Ne kerüljön valódi jelszó/hash vagy személyes adat screenshotba/logba. Nem készült terhelési benchmark, külső UAT, login/cookie, UI, audit vagy email-verifikáció.


## Jelszóhash/check szelet – 2026-10-19

Vizsgált változat: `feature/password-hashing`, a `63e1469` main baseline utáni PasswordService-iteráció. Környezet: Windows/WSL2, Node 22.23.2, npm 10.9.8. Szintetikus unit-jelszavak, valós scrypt `N=131072/r=8/p=1` profillal; a költség tesztben sem csökkentett. Nincs DB-/HTTP-művelet vagy új függőség.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| Új password unit suite a teljes futtatásban | PASS: **35 teszt** |
| `npm test` | PASS: 6 backend suite / **91 backend + 18 frontend = 109 teszt**, 0 failed/skipped |
| `npm run typecheck --workspace backend` | PASS |
| `npm run build --workspace backend` | PASS |

A tesztek ellenőrzik a hash alakját/DB-mezőbe férését, a különböző saltokat, helyes/hibás jelszót, független Python `hashlib.scrypt` fixture elfogadását, whitespace és Unicode megőrzését, 72 bájton túli eltérést, ASCII/multibyte UTF-8 határokat, nem párosított surrogate és nem-string bemenet elutasítását. Malformed/unknown/eltérő költségű rekord nem indít KDF-et; a helyes alakú módosított digest elutasított. A randomforrás és scrypt hibái mockoltak, biztonságos kivételt adnak.

A végleges 35 esetet a teljes kör futtatta; a salt/digest végére tett sortörésre külön negatív esetek is vannak. A service nem logol, nem ír adatbázisba, nincs auth-végpontba kötve. A jelszóerősségi policy, dummy verify/enumeration-védelem, rate limit és párhuzamos terhelési mérés későbbi auth-feladat. Timing-benchmark, coverage, új integration/e2e vagy CI nem készült. Döntés és korlátok: [ADR-014](../02_architecture/adr/ADR-014-password-hashing.md).

## PR #10 review-javítás – 2026-10-19

Vizsgált változat: CloudVault 0.1.0, a `131e3cd` baseline utáni 415-hibamapping javítási iteráció. Környezet: Windows/WSL2, Node 22.23.2, npm 10.9.8. A korábbi scaffold baseline eredményei alább megmaradnak.

A Copilot-észrevétel helyes volt: a body-parser `charset.unsupported` és `encoding.unsupported` hibái nem Nest `HttpException` példányok; a filter korábban `500 INTERNAL_ERROR` választ adott. A javítás mindkettőt `415 UNSUPPORTED_MEDIA_TYPE` válaszra képezi, üres details és request ID mellett. A klienshibák nem kerülnek 5xx hibaként a loggerbe.

| Ellenőrzés | Tényleges eredmény |
|---|---|
| Két új regressziós eset a javítás előtt | 2 FAIL, 8 PASS: az elvárt 415 helyett 500; a hiba reprodukálva |
| `npm test` a javítás után | PASS: 56 backend és 18 frontend, összesen **74 unit teszt**, 0 failed/skipped |
| `npm run typecheck --workspace backend` | PASS |
| `npm run build --workspace backend` | PASS |
| Elkülönített NestJS HTTP-próba a buildelt filterrel | PASS: két nem támogatott charset/encoding kérés 415, biztonságos wrapper és egyező request ID; health 200 és hibás JSON 400 változatlan |

A HTTP-próba ideiglenes, adatbázis nélküli Nest-modult használt a tényleges HealthControllerrel, request-ID middleware-rel, filterrel és alapértelmezett body-parserrel; a próbaszerver utána leállt. A teljes lokális stack nem futott e review-javítás próbájánál: a Docker daemon nem volt elérhető.

Az új esetek a státuszkód mellett a hibakódot, a titokmentes választ, az üres details-t, a request ID-t és a 4xx logolásának hiányát ellenőrzik. A frontend forrása nem változott; új frontend build nem futott. Coverage-mérés, új integration/e2e suite vagy CI nem készült.

## Lokális technikai alap – 2026-10-19

Hatókör: scaffold, konfiguráció, health, hibakezelés, kezdeti adatbázisséma és lokális infrastruktúra. Auth, feltöltés, import és processor még nincs; ezek tesztelése nem tekinthető teljesítettnek.

Környezet: Windows/WSL2, Node 22.23.2, npm 10.9.8, Docker Engine 26.1.1 és Compose 2.27.0. PostgreSQL 17.9; a MinIO/mc rögzített forráscommitból épül (ADR-013). A gépen a WSL Docker-integráció nincs bekapcsolva: az infrastruktúra-próba a telepített Windows `docker.exe` CLI átmeneti PATH-wrapperével futott. A README normál `docker` parancsához az adott WSL-disztribúció Docker-integrációját engedélyezni kell. Globális Docker-beállítást nem módosítottunk.

## Automatikus unit és fordítási eredmények

| Parancs | Eredmény |
|---|---|
| `npm ci --no-audit --no-fund` | PASS: tiszta telepítés a root lockfile-ból, 802 csomag |
| `npm test` – backend Jest | PASS: 5 suite, 54 teszt; 0 failed/skipped |
| `npm test` – frontend Vitest | PASS: 1 fájl, 18 teszt; 0 failed/skipped |
| `npm run typecheck` | PASS: mindkét workspace |
| `npm run build` | PASS: NestJS és Vite production build |
| `npm run db:migrate:dev -- --help` | PASS: a Prisma súgóját adja, a kapcsolótovábbítás működik |

Összesen **72 unit teszt PASS**. Backend: konfiguráció, request ID, hibamaszkolás, health és mockolt Prisma-életciklus. Frontend: publikus API URL és health kliens, hibás válaszok és hálózati/abort hiba. A Vue komponens DOM-viselkedése nincs automatizáltan lefedve. Coverage nem lett mérve; integration/contract/e2e tesztkészlet és CI nincs bevezetve.

## Manuális infrastruktúra-ellenőrzés

Ezek egyszeri fejlesztői futtatási próbák, nem automatikus integration/e2e tesztkészlet és nem külső UAT.

| Próba | Eredmény |
|---|---|
| `npm run env:init`, majd ismételt futtatás és tartalomhash összevetése | PASS: létrehozás után a meglévő `.env` változatlan, credential nincs kiírva |
| Compose config validálás és `npm run infra:up` | PASS: PostgreSQL és MinIO healthy, forrásból épített szerver/kliens; privát bucket és app user elkészül |
| Ismételt MinIO-init | PASS: sikeres, a meglévő bucket megmarad |
| Anonymous bucket hozzáférés | PASS: HTTP 403 |
| App identity object PUT/GET/DELETE és tartalom-összevetés | PASS: ideiglenes próbaobjektum létrejött, olvasható volt és törölve lett |
| App identity admin-hozzáférés | PASS: megtagadva |
| Frontend origin MinIO CORS preflight | PASS: a konfigurált origin engedélyezett; a majdani upload-adatút külön validálandó |
| `npm run db:validate`, `npm run db:generate`, `npm run db:migrate` | PASS: schema valid, kliens generálva, egy migráció alkalmazva |
| Ismételt `npm run db:migrate` | PASS: nincs függő migráció |
| Prisma migrate diff az élő DB és schema között | PASS: `No difference detected` |
| Épített backend `npm run start --workspace backend` | PASS: elindult, Prisma PostgreSQL-kapcsolat sikeres |
| HTTP health, CORS, request ID és hibaválasz | PASS: health 200, engedélyezett credentialed origin; idegen origin 403; biztonságos 404/hibás JSON 400, érvénytelen request ID cseréje |
| `npm run dev:frontend` és HTML HTTP-próba | PASS: Vite elindult, HTML 200 és Vue entrypoint kiszolgálva; renderelt állapot nincs ellenőrizve |
| Repository Markdown-link, whitespace, ignore és secret ellenőrzés | PASS: minden vizsgált helyi link feloldódik, nincs diff whitespace-hiba; `.env`, generált kliens és build ignore-olt; valós helyi credential nincs repository-fájlban vagy frontend JS-bundle-ben |
| Nyolc negatív SQL-próba, rollbackelt tranzakcióban | PASS: negatív usage, kvótatúllépés, túlméretes fájl, ACTIVE detected MIME nélkül, hibás soft-delete dátumok, más owner megosztása, túl rövid expiry, hibás token hash mind elutasítva |

Az SQL-próba szintetikus adatot használt és rollbackelt; nincs valós személyes adat. A DB-constraint nem helyettesíti a későbbi szolgáltatásszintű authorizationt, tranzakciós kvótakezelést vagy lifecycle-teszteket.

## Böngészős ellenőrzés korlátja

A beépített böngésző Node REPL-je `sandboxCwd is not a local file URI` környezeti hibával nem indult. A külön Playwright böngésző sem indult, mert a hoston hiányzik a Chrome binary (`/opt/google/chrome/chrome`). Ezért vizuális/renderelt UI-ellenőrzés nem igazolt; a frontend API-kliensét unit tesztek és a futó Vite HTTP-próba ellenőrzi. Emberi teendő: a README frontend URL-jén a sikeres kapcsolat, az API leállításakor a hiba és az újraellenőrzés megtekintése.

## Függőségek és korlátok

A 2026-10-19-i `npm audit --omit=dev --json` eredménye **0 ismert sérülékenység**. A teljes audit **20 moderate, 0 high, 0 critical** érintettséget jelez egyetlen gyökérokból: a Jest/ts-jest fejlesztői lánc tranzitív `sprintf-js <=1.1.3` függőségének [DoS advisory-ja](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Nincs javított upstream sprintf-js verzió az ellenőrzött registry-metaadat szerint; az audit major downgrade javaslata nem került alkalmazásra. A tesztek nem fogadnak külső formátumsztringet. Új függőségfrissítéskor újra ellenőrizendő; a teljes audit nem tiszta.

A közvetlen dependency-verziók és npm-források lockfile-ban rögzítettek; a MinIO base image tagek nem digestre rögzítettek, a build nem bitazonos reprodukció. Container-image CVE- és teljes tranzitív licencaudit nem történt. Másik gépes telepítés és külső UAT továbbra is nyitott. A health csak liveness; a backend induláskor kapcsolódik PostgreSQL-hez, folyamatos readiness vagy storage adapter még nincs.

## A próba során javított hibák

- Az eredeti NestJS 12 ESM-függőségei nem futottak a választott CJS/Jest transzformációval. NestJS 11.2.7, Config 4.0.4 és CLI 11.0.24 mellett történik a végső ellenőrzés.
- Független review során javítva lett a gyökér `db:migrate:dev` script kapcsolótovábbítása; `--help` már a Prisma migrate dev súgóját adja.
- Két TypeScript-hiba (CORS callback paraméterek és teszt request cast) javítva lett.
- A kezdeti npm proxykapcsolat megszakadt; a projekt `.npmrc`-je és a lockfile publikus npm-registryt használ.
- A MinIO kliens image-e nem volt hozzáférhető; rögzített upstream forrásból épül a Docker multi-stage buildben.
