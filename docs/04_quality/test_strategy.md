# Test strategy

**Unit-first stratégia – a technikai alap tesztjei implementáltak, a termékmátrix tervezett.**

## Cél és hatókör

Az első implementációs fázis unit tesztekkel védi a Core MVP üzleti szabályait. A technikai alaphoz Jest és Vitest runner, konfigurációs/hiba/request-ID/health/API-kliens és mockolt Prisma-életciklus unit tesztek készültek. A jelszóhash/check primitív is unit tesztelt valós scrypttel, független fixture-rel, malformed-input és hibamaszkolási esetekkel. A regisztráció DTO-, guard-, service- és controller-unit tesztjei mockolt Prisma/hash függőséggel ellenőrzik a DB-írás paramétereit, publikus választ, adapter-specifikus unique mappinget és hibák utáni kapacitás-felszabadítást. Az időablak/peertábla és párhuzamossági korlát is unit tesztelt; valós DB-működést ezek nem bizonyítanak. A login/logout/me unit tesztek a JWT/cookie attribútumokat, alg/signature/claim/expiry elutasítást, dummy verify-t, aktuális DB-user boundaryt, közös KDF-korlátot és Origin/idempotens logout viselkedést fedik. A frontend auth API, tényleges Vue Router memory history-val és Vue SSR template-renderrel unit tesztelt: credentials, 401/kiesés/retry, timeout/abort, késői navigációs siker/hiba és profil adatrejtés/escaping. A template-próba nem böngésző vagy interaktív DOM-validálás. A közös regisztráció/login form-kezelő külön unit tesztelt: mezőhiba, Unicode/bájthatár, jelszómegerősítés, dupla-submit, loading, 400/409/429/kiesés, retry, siker, jelszóürítés, abort/dispose és késői válasz. A valódi natív form-interakció továbbra is kézi browser-kapu. A további upload/import/processing tesztek tervezettek; a futtatott suite és eredménye a test reportban található.

A unit-first fejlesztés nem a végső SZD2 elfogadási kapu. Az októberi célhoz komponensek együttműködését, teljes folyamatokat, recoveryt és használhatóságot is bizonyítani kell. A roadmap SZD2-6 minőségi fázisában az alábbiak tervezettek, bevezetésük előtt az AGENTS.md szerinti külön engedélyezéssel:

- PostgreSQL/Prisma integration tesztek;
- MinIO/S3 adapter integration tesztek;
- API contract tesztek;
- Playwright vagy más e2e/UI tesztek;
- A unit CI-n túli build/typecheck quality gate és coverage enforcement.

## Ellenőrzések összevonása – 2026-10-31

Az [AGENTS.md](../../AGENTS.md) szerint a tesztek a részfeladat stabil implementációja után, egy összevont körben fussanak. Kész kód-PR-nél a végső unit/typecheck/build kör helyettesíti az előzetes, azonos célzott futást; korábbi részlépésnél elég az érintett suite/workspace. Konkrét hiba vizsgálatára korábbi célzott futás megengedett. Javítás után először az érintett ellenőrzést ismételjük; sikeres szélesebb kört csak új releváns változás vagy fennmaradó kockázat indokol.

Csak dokumentáció módosításakor diff/link/konzisztencia-ellenőrzés kell, alkalmazásteszt/build/typecheck nem. A meglévő GitHub Actions eseményei és tesztköre változatlanok. Ez a futtatások ismétlését csökkenti; az üzleti, biztonsági és SZD2 elfogadási követelmények megmaradnak.

## Engedélyezett unit CI – 2026-10-22

A szerző kifejezett kérésére a korábban későbbre tervezett CI első, szűk része most bevezetésre kerül: [GitHub Actions Tests](../../.github/workflows/tests.yml). Események: PR a mainre, push a mainre, valamint default branchre kerülés után kézi indítás. Ubuntu 24.04, `.nvmrc` szerinti Node, root lockfile és `npm ci`; utána Prisma Client generálás szintetikus URL-lel és a teljes meglévő `npm test`. Ez az aktuális root scripthez igazodik, ezért későbbi scriptváltozásnál a workflow és a dokumentáció együtt ellenőrizendő.

Nincs futó DB/MinIO, valós credential vagy artifact-feltöltés. Az actionök teljes commit SHA-ra rögzítettek, a token `contents: read`, checkout credential nem marad a Git-configban. PR-kód nem `pull_request_target` privilegizált eseményben fut. Függő azonos-ref futások megszakíthatók; a job 15 percre korlátozott. A megoldás a [GitHub biztonsági útmutatóját](https://docs.github.com/en/actions/reference/security/secure-use) és a [setup-node dokumentációját](https://github.com/actions/setup-node) követi.

A futási link és tényleges eredmény a tesztriportba kerül. A workflow-fájl nem állít automatikusan GitHub required checket: branch protection/ruleset külön beállítás. Integration/e2e/contract tesztek, coverage enforcement, deployment és automatikus merge továbbra is külön engedélyezendő scope.

## Tesztelhetőségi elvek

- Business logic service-ben vagy pure functionben legyen, ne controllerben.
- Prisma, storage, clock, random/token generator, audit, processor és opcionális MI-provider porton keresztül mockolható.
- Időfüggő szabály injektált clockot használ.
- A state transition és counter update egy use case-ként tesztelendő.
- Minden negatív teszt külső hibakódot és belső információszivárgás hiányát is ellenőrzi.
- A teszt fixture nem tartalmaz valós személyes adatot, credentialt vagy elérhető presigned URL-t.
- Unit teszt nem nevezhető storage/database integrációs bizonyítéknak.

## Core MVP unit tesztmátrix

| Csoport | Kötelező tervezett esetek | Kapcsolódó story |
|---|---|---|
| Auth | password hash/check; duplikált email; generic invalid credentials; egyórás JWT; `HttpOnly`, `SameSite=Lax`, production `Secure`; logout cookie-törlés; Origin allowlist | US-01 |
| Authorization | owner hozzáfér; más user és nem létező file egységes `FILE_NOT_FOUND`; auth nélkül `AUTH_REQUIRED` | US-01–US-06 |
| Storage key | nem eredeti fájlnévből készül; collision-safe; owner referencia nem szivárog API-ba | US-02 |
| Upload init | 100 MB boundary; pontos MIME allowlist; invalid név; quota boundary; tranzakció rollback | US-02, US-04 |
| Concurrent reservation | párhuzamos init nem lépi túl a limitet; `used + reserved <= limit`; sikertelen init nem foglal | US-02, US-04 |
| Confirm | object missing; `HEAD` méreteltérés; range-read hiba; magic-number mismatch; támogatott signature; `PENDING_UPLOAD → ACTIVE` | US-02 |
| Exactly-once accounting | első confirm transfer; ismételt és párhuzamos confirm no-op/azonos eredmény; counter nem megy negatívba | US-02, US-04 |
| Abandoned cleanup | 15 perces pending boundary; object absent; delete success; delete failure reservationt megtart; retry metadata | US-02, US-04 |
| Cursor pagination | default 20/max 100; invalid cursor/limit; `createdAt DESC, id DESC`; azonos timestamp; nincs kihagyás/duplikáció | US-03 |
| Preview/download | inline allowlist; HTML/SVG/JS/XML/unknown tiltás; attachment névnormalizálás; 5 perces TTL | US-03 |
| Usage | available érték; soft delete/restore nem változtat used-on; reservation látható | US-04, US-06 |
| Soft delete/restore | ownership; 30 nap előtt/határon/után; idempotens/stabil ismétlés; share-linkek invalidálása; restore nem éleszti újra őket | US-06 |
| Sharing | 32 random byte token; base64url; SHA-256 hash; 1 óra–7 nap expiry; invalid/expired/non-active egységes publikus hiba | US-05 |
| Audit | kötelező események; request ID; allowlistelt metadata; nincs jelszó, token, URL, file content vagy raw MI adat | US-01–US-06 |
| Error mapping | nested wrapper; stabil kód; üres/biztonságos details; request ID; nincs stack/providerüzenet | US-01–US-06 |

## Kötelező SZD2 unit tesztmátrix-kiegészítés

Az alábbiak az SZD2-0-ban pontosítandó import-/feldolgozási szerződés alapján készülnek; a nevek nem jelentenek létező entitásokat vagy API-kat. Az eredeti 5 perces URL és 15 perces pending határértéket külön össze kell egyeztetni a resumable session lejáratával és megújításával.

| Csoport | Tervezett esetek | Roadmap |
|---|---|---|
| Importazonosság | ismételt és párhuzamos azonos művelet nem hoz létre másolatot; idegen owner sessionje nem folytatható | SZD2-2–SZD2-3 |
| Átviteli állapot | kész fájl megmarad; tartós részállapotból folytatás; párhuzamosság korlátozott; lejárt jogosultság/session, megújítás, cancel és cleanup | SZD2-3 |
| Hibaelkülönítés | egy hibás fájl nem állítja le a többit; csak sikertelen lépés retry-ja; stabil megismételt confirm/import | SZD2-2–SZD2-4 |
| Processor és eredmény | közös interface; verziózott, egyedi eredményazonosság; hiányzó képadat érvényes eredmény; eredeti és sikeres testvéreredmény hozzáférhető | SZD2-2, SZD2-4 |
| Tartós workerállapot | félbeszakadt job helyreállítható; ismételt/párhuzamos végrehajtás nem duplikál outputot vagy charge-ot; elavult worker eredménye nem írhatja felül az újabb állapotot | SZD2-4 |
| Származtatott lifecycle | előnézet és részleges tartalom foglalása/véglegesítése/takarítása; cleanup-hiba; pontos kvóta; soft delete/restore és owner határok | SZD2-4–SZD2-5 |
| Metadata-biztonság | kinyert adat untrusted; hiány/hibás mező; szükségtelen helyadat és egyéb személyes adat nem kerül logba vagy megosztási válaszba | SZD2-4 |

A mockolt unit teszt az állapotlogikát bizonyítja; a tényleges bájtszintű folytatáshoz és restart recoveryhez azonosított lokális környezetben végzett kísérlet és később engedélyezett komponensellenőrzés is kell.

## Opcionális MVP+ unit tesztek

Az alábbiak csak az MI-metaadat-javaslat külön jóváhagyása után készülnek:

- csak owner és `ACTIVE` kép indíthat suggestiont;
- videó, pending, deleted és cross-user file elutasítása;
- automatikus upload utáni providerhívás hiánya;
- `PENDING → READY | FAILED`, majd `READY → ACCEPTED | REJECTED`;
- szerkesztett accept alkalmazza a user által megadott értéket;
- accept/reject ismétlés stabil eredménye;
- provider timeout/hiba mellett core file service változatlanul működik;
- raw provider response, kép és URL nem kerül auditba vagy logba;
- tiltott biometrikus/szenzitív eredmény nem fogadható el automatikusan.

## Frontend unit teszt irány

Vitest csak indokolt, izolált logikára:

- file size és usage formázás;
- cursor page merge és duplikációvédelem;
- error-code → user message mapping;
- importonkénti és fájlonkénti state/progress reducer, részleges siker, folytatás és külön retry;
- MI suggestion accept/edit/reject state, ha MVP+ elkészül.

Egyszerű statikus renderelésre nem szükséges tesztet írni kizárólag darabszám növelése érdekében.

## Névkonvenció és szerkezet

- Tesztnév: `should <expected behavior> when <condition>`.
- Egy teszt egy üzleti állítást bizonyítson.
- Arrange–Act–Assert szerkezet ajánlott.
- Idő, random és adapter mock explicit legyen; globális rejtett state kerülendő.
- Fixture neve jelezze, hogy szintetikus, például `user@example.test`.

## Minőségi kapu vertikális szeletenként

Egy jövőbeli slice csak akkor zárható le, ha:

1. a hozzá tartozó unit tesztek futnak és PASS eredményűek;
2. legalább a dokumentált negatív és boundary esetek fedettek;
3. a tesztparancs és eredmény bekerül a test reportba;
4. API-, adatmodell-, threat- és UX-dokumentáció megfelel a kódnak;
5. ismert hiányosság nem marad jelöletlen.

## Coverage

A jelenlegi baseline nélkül nincs hiteles százalékos coverage-küszöb. A későbbi első futtatás rögzíti a baseline-t. A kritikus auth-, ownership-, accounting-, validation- és lifecycle-ágak teljes viselkedési lefedése fontosabb a puszta globális százaléknál.

## SZD2 minőségi és átadási fázis

Az SZD2-6 fázisban a teljes alkalmazás bizonyításához az alábbi ellenőrzési terv tartozik; a jelenlegi unit CI nem hoz létre nagyobb tesztszintet. Az integration/e2e/contract és a CI további bővítése külön felhatalmazást igényel. Bevezetéskor rögzíteni kell a környezetet, fixture cleanupot, MinIO/PostgreSQL izolációt, CI-erőforrást és flake-kezelést.

| Szint | Bizonyítandó viselkedés |
|---|---|
| Integration | Prisma-tranzakció és párhuzamos kvótafoglalás; valódi storage-adapter és kiválasztott átviteli mechanizmus; worker-tartósság, restart és derived-output cleanup |
| API contract | import/resume/retry/confirm, auth és ownership; hibák; verziózott eredmények és a dokumentált állapotválaszok |
| Teljes folyamat / e2e | belépés → köteg → megszakítás → folytatás → feldolgozott galéria; külön retry; sharing, delete/restore és usage negatív esetekkel |
| CI | reprodukálható build/typecheck és jóváhagyott automata tesztkészlet; a tényleges konfiguráció elkészülte után kötelező PR-kapu |
| Kontrollált kísérlet | 10/50 képes újrakezdő–folytatható összehasonlítás; hálózati megszakítás, worker-restart, sérült kép; bájt/idő/helyes eredmények és DB/storage számlálók |
| Külső UAT és telepítés | SZD2-7: néhány próbafelhasználó feladatai, visszajelzés, javítás és retest; tiszta, lehetőleg másik gépen követett Quickstart |

A részletes kísérleti protokoll és metrikák a [metrics.md](../01_product/metrics.md) dokumentumban vannak. Egy worker-restart demonstráció vagy fejlesztői manuális próba nem nevezhető automatikusan e2e tesztnek vagy külső UAT-nak.

A korábbi v1.2 rubric 30+ tesztet, tesztmixet és CI-t tárgyal, az új Coospace érdemi bizonyítékot kér. A végső kapu pontos alkalmazása egyeztetendő; egyik követelmény sem tekinthető automatikusan eltöröltnek. A tesztdarabszám önmagában nem bizonyít minőséget.

Minden futás jelentése tartalmazzon dátumot, commitot, környezetet/verziókat, inputot, lépéseket, elvárt/tényleges eredményt és bizonyítékot. A végső app, kézirat, screenshot, riport és telepítési leírás ugyanazt a verziót mutassa. A tesztriport csak ténylegesen lefuttatott eredményeket nevezhet sikeresnek; jelenleg nincs futtatási baseline.

## Upload-séma ellenőrzési határa

Az UploadOperation tárolási invariánsait SQL CHECK/unique/FK korlátok védik; ezekhez a sémafeladat elkülönített PostgreSQL-sémákon végzett kézi migrációpróbát alkalmazott, nem mintaszöveget visszaellenőrző unit tesztet. A meglévő unit suite regresszióként lefutott. A következő init/confirm/cleanup service-ek üzleti viselkedése külön unit teszteket igényel; a teljes integration/e2e fázis és CI változatlanul külön engedélyezésű. Reprodukciós lépések és tényleges eredmény a tesztriportban.

## Storage adapter szelet

A `backend/test/storage.spec.ts` izolált SDK/stream unit tesztjei a kulcsokat, MIME/mérethatárt, aláírt headereket és fix lejáratot, hibamaszkolást, bucket/objektumhiány megkülönböztetését, feltételes és korlátozott olvasást, timeout-streamlezárást és download-headereket ellenőrzik. Egy offline valódi SigV4-aláíráspróba mock nélkül ellenőrzi a hostot és signed-header listát. Nem igazolják a provider kikényszerítését. A külön explicit `storage:verify` kézi provider-próba szintetikus adatokkal ezt részben vizsgálja; nincs új integration/e2e suite vagy CI-szolgáltatás. Valódi browser és in-flight cleanup bizonyíték továbbra is külön kapu.

## Upload-init üzleti szelet

Az upload-init külön unit teszteli a DTO/guard/controller mellett a zárolási/számláló paramétereket, canonical fingerprintet, fix határidőket, státusz szerinti replay-t és safe hibatérképet. A korábbi hipotetikus init-esetekből ezek implementáltak; confirm/cleanup/import/processing esetei továbbra is tervezettek. A valódi SQL-zárolást és rollbacket külön dokumentált, szintetikus kézi HTTP/DB-próba vizsgálta; nincs új integration/e2e suite vagy CI-szolgáltatás.

## Confirm és őrzött cleanup

A signature, confirm-guard, owner-check, friss terminális állapot elsőbbsége, konkurens egyszeri könyvelés/audit, DB-írás alatt elért határidő és rollback, valamint cleanup-proof/backoff/idempotencia külön unit tesztelt. A shared fixture a hibás mock-tranzakció írómódosításait visszagörgeti, de ez nem SQL-bizonyíték. A proof-függő release ág csak szintetikus bizonyítékkal unit tesztelt; valós proofot a provider nem szolgáltat. A valódi MinIO/DB confirm és a késleltetett PUT külön, explicit helyi próba, nem új integration/e2e suite.

## Első képköteg UI unit ellenőrzése

`frontend/tests/upload-api.spec.ts`: credentialed init/bodyless confirm, response/payload/UUID validáció, biztonságos hibakód-whitelist, Retry-After, API-timeout és abort; fake XHR-rel pontos File/headerek, cookie-mentes cross-origin PUT, progress és storage-hibák. `upload-batch.spec.ts`: név/MIME/méret, legfeljebb 20 sor/két worker, elszigetelt hibák, stabil init-kulcs, uncertain PUT → confirm, csak hiánynál élő joggal resend, ACTIVE replay, terminális/átmeneti különbség, munkamenet és dispose. `upload-panel.spec.ts`: izolált Vue SSR template, escape, címkék, üres/progress/confirm/részleges siker/hiba/retry/login és disabled állapotok.

Ezek mockolt unit/template próbák, nem browser-CORS vagy valódi storage-méretkikényszerítési bizonyítékok. A teljes UI → DB/object és screenshot ellenőrzés külön 7. pont. Nem került be integration/e2e runner vagy új dependency.

A `frontend/tests/image-format.spec.ts` támogatott/hiányos/hamis fejléceket, legfeljebb 16 bájtos olvasást, fájl-bájtazonosságot, hibás/hiányzó/Unicode/hosszú kiterjesztést és biztonságos olvasási hibát ellenőriz. A batch-regressziók az előkészített MIME/név/File továbbítását, cache-elt init-retryt, ismeretlen tartalom előtti kvótavédelmet és az olvasás közbeni dispose/session elvesztését fedik; template-teszt a korrekciós szöveg escape-jét. A valódi felhasználói fájlok nem tesztfixture-ek a repóban; külön helyi előkészítési próba eredménye a riportban van.

## Első galéria/preview elfogadási terv – nem lefutott tesztek, 2026-10-27

- UT-PAGINATION/OWNERSHIP: saját ACTIVE/ellenőrzött kép szűrés, idegen/pending/törölt/video kizárás; pontos hétmezős projekció, nincs key/URL; 20 default, 1/100 határ és hibás query; cursor encoding/verzió/scope/dátum/UUID/max512; azonos timestamp tie-breaker; limit+1, last-returned cursor, üres/utolsó oldal, törölt horgony; változatlan adathalmaz kihagyás/duplikáció nélkül. Másik user cursorja sem lépheti át az owner-szűrést. MinIO-hiba nem akadályozza a metadata-listát.
- UT-DELIVERY: auth/UUID/owner/state ellenőrzési sorrend és egységes 404; saját ACTIVE kép-allowlist, null/eltérő MIME 415; HEAD hiány vs provider/bucket hiba/méreteltérés; recheck állapotváltozáskor; biztonságos inline/read MIME/filename/no-store és tényleges TTL<=300s; presignhiba/lejárat URL nélkül, nincs kvóta-/file-update vagy thumbnail generálás.
- Frontend unit/template: első és további loading, üres lista, részhiba mellett megmaradó kártyák, ID-dedupe, cursor reset, külön képhiba és korlátozott URL-kérések; lejárat utáni új jogosítás végtelen hurok nélkül; 401/dispose késői válasz; Escape/fókusz és fájlnév escape. URL csak memóriában.
- Későbbi kézi bizonyíték: két user saját képei, oldalfrissítés, több oldal/azonos időbélyeg, hiányzó objektum, lejárat és negatív jogosultság, storage GET CORS + anonymous képbetöltés, sikeres upload utáni frissítés. Signed URL-t nem tartalmazó képernyőkép és DB/object állapot együtt; fejlécfelismerés nem teljes képdekódolás.

Ez tervezett ellenőrzési lista, nem PASS-riport; nem hoz létre unit/integration/e2e kódot vagy CI-változást. A thumbnail/processor-verzió, derived quota és recovery külön szerződés/tesztfeladat.

### GET /files implementált unit szelet – 2026-10-27

A fenti galéria-terv lista részét a `backend/test/file-list.spec.ts` fedi: query/limit/cursor invalid és 512-es mérethatár, UTF-8/base64url/verzió/scope/dátum/UUID, owner+ACTIVE+allowlist+MIME-mezőegyezés, hétmezős select/projekció és BigInt határ, 105 képes statikus minta 1/20/100 oldalmérettel/azonos időbélyegekkel, lookahead/utolsó visszaadott cursor, törölt horgony, idegen user cursorja, üres oldal és DB-hiba. A limiter 60-as user-ablaka, Retry-After, 4096-os tárolási korlátja, a controller guard/header és a nested error filter is izoláltan tesztelt.

Ezek mockolt unit ellenőrzések; az SQL-t nem futtatják és nem bizonyítanak valós HTTP/CORS/browser/MinIO együttműködést. Preview/frontend és a megfelelő kézi tesztek külön feladatok maradnak. Új integration/e2e suite nincs.

### Preview backend unit szelet – 2026-10-27

`backend/test/file-preview.spec.ts`: SessionGuard/route/module és no-store bekötés, UUID/query/body validáció, owner/ACTIVE egységes 404 storage előtt, négy tényleges képtípus és konfiguráció/mismatch/null ellenőrzés, bizonyított objektumhiány vs provider/bucket hiba, méret, inline presign, actual expiry/config/max300 és Date-mutáció, signing utáni owner/state/key/név/MIME/size változás, végső DB-olvasás alatti lejárat, biztonságos hiba-wrapper. Külön 120/perc user-limiter, Retry-After, 4096-os bound és listalimittől függetlenség. A storage-unit mockolt GetObjectCommandon ellenőrzi az inline/no-store/MIME/UTF-8 filename* paramétereket, nem tényleges HTTP-fejléceken.

A tesztek izolált doubles-t használnak, nem igazolnak valódi SQL/MinIO/browser viselkedést vagy azonnali read URL-visszavonást. A preview nem thumbnail, és nem processor-készültség vagy teljes képintegritás bizonyítéka. Új integration/e2e suite nincs.

### Metaadatgaléria frontend unit/template – 2026-10-28

`gallery-api.spec.ts`: exact request, credential/no-store/redirect/limit/cursor, három/hétmezős response, ACTIVE/ellenőrzött MIME/UUID/dátum/safe méret, privát mezők tiltása, kontrollált hibák, Retry-After/fallback, timeout a body végéig és abort. `gallery-state.spec.ts`: üres vs első loading, szerverrend és ID-dedupe, megtartott kártyák/azonos cursor page-retry, invalid/looping cursor, új lánc, felülírt kérés és dispose/session lejárat utáni késői válaszok, cooldown. `gallery-panel.spec.ts`: izolált Vue SSR kártyák/escaped név/méret/time, loading/empty/retry/reset/disabled állapot, kép/preview nélkül.

A template render nem browser/hydration vagy teljes auth/DB/storage bizonyíték. Nem vezet be integration/e2e keretrendszert; a védett account valódi megnyitását, kézi lapozását, 401 navigációját és az elérhetőségi/viewport próbát külön kell rögzíteni. A képes preview és az automatikus upload utáni refresh további implementált szeleteit a következő bekezdések írják le.

### Képes galéria unit/template – 2026-10-28

42 új izolált eset: preview-kliens pontos DTO/URL/deadline/hibák/cancel; max. négy fizikai kérés, demand/dedupe, cooldown, kézi retry, stale API-/img-verzió, account/dispose és listafrissítés-hibareset; SSR kép/loading/error/modal attribútumok, fake IntersectionObserver és native-dialog/fókusz helper. A fake dialog és SSR nem teszteli a böngésző tényleges fókuszcsapdáját vagy Escape-viselkedését. Kézi kapu: saját képek lazy betöltése; nagy nézet Enter/Space, Tab/Shift+Tab/Escape és visszatérő fókusz; MinIO CORS, offline kép és kézi retry, lapozás, logout/fiókváltás. Nincs új integration/e2e suite.

### Feltöltés utáni összevont listafrissítés – 2026-10-28

Upload-state unitok: több párhuzamos confirm egy hullámjelzés, részleges siker + hibás fájl külön retry-ja, PUT 100%/all-fail/ACTIVE-init-replay/dispose nem új jelzés. Gallery-state fake-timer unitok: 20 gyors jelzés egy read, aktív refresh/lapozás mögött egy trailing read, új cursorlánc/ID-dedupe, kézi refresh összevonás, hibánál timer törlése, 429 és session/dispose. Owner-jelzés külön izolált tesztje kizárja az előző usert. Nincs browser/DB/integration/e2e bizonyíték; a rövid kézi ellenőrzőlista a tesztriport új szakaszában nyitott.

## Első thumbnail-processor – tervezett ellenőrzések, 2026-10-29

**Nem lefutott tesztek.** Az [ADR-016](../02_architecture/adr/ADR-016-thumbnail-processing.md), [adatmodell](../03_design/data_model.md#első-thumbnail-processor--tervezett-szerződés-2026-10-29) és [API](../03_design/api.md#első-thumbnail-processor-api--implementált-2026-10-31) implementációs elfogadási kapui; nem új integration/e2e engedély.

| Csoport | Unit / izolált ellenőrzés később |
|---|---|
| Decoder/output | Szintetikus JPEG/PNG/WebP/GIF, animált GIF/WebP/APNG első frame, átlátszóság, EXIF forgatás+tükör, kis kép nem nagyítódik, portrait/landscape/extrém arány, WebP MIME/hash/méret, metadata/GPS/XMP/ICC hiánya |
| Limit/adatvédelem | Exact/plus-one32MiB,40Mpixel,20000dimenzió,4csatorna,512KiBoutput; warning/truncated/malformed header; támogatott magic alatt rossz decoder; SVG/HTML/TIFF/AVIF/PDF és URL/path kizárva; nem teljes animáció-validálás |
| Queue/identity | Confirm+job egy commit, confirm rollback és replay, unique job/result/owner FK, version/build/source-fingerprint és teljes source hash; nincs automatikus legacy backfill |
| Quota | PontosR reservation commit írás előtt, egyenlő limit megengedett, konkurens eredeti/derived foglalás, egyszeri R reserved→used, blokkolt kvóta mellett eredeti használható |
| Recovery/fencing | Két claim, heartbeat/lejárat/old worker, PUT előtt/után és DB-publication előtt/után crash-pontok; valid candidate adoption új fence alatt;9 generation/korlátozott recovery-probe, nincs számlálóreset restarttal |
| Cleanup-race | Cleanup irréverzibilis ORPHANED claimje előtt/után ütemezett adoption; PUBLISHED sosem törölhető attempt-cleanupból. Lease/HEAD404/DELETE200 nem proof; régi candidate R megmarad az új winner mellett |
| Lifecycle/API | Parent soft delete/restore és stale worker, purge részhiba/markerek; batch status ownership egész kérésre, old-state egységes404, thumbnail-url409/415/TTL/HEAD+finalrecheck; retryRevision CAS/replay/exhaustion; limiter/Origin/401 és safe error |
| Frontend későbbi szelet | Pending/failed/quota/cleanup figyelmeztetés, eredeti fallback, thumbnail kártya/original modal; batch polling10s/20ID/egy in-flight, hidden/unmount stop, signed URL csak memory és max4 párhuzamos kérés |

**Külön valódi környezeti kapuk, még nyitottak:** pontos Sharp/bináris telepítés root lockfile-lal WSL/Linux és a Debian-image-ben; codec-allowlist és fixture-eredmény; worker512MiB/1CPU/pids64 limit és child15s kill/OOM mérése (a mock timeout nem bizonyítja); tényleges DB/storage job/objektum/used/reserved darabszám ismételt delivery és restart előtt/után; parent lifecycle és másik user; ambiguous PUT és closure-proof/cleanup. A worker lefagyasztása, késői PUT és publication–cleanup verseny külön próbát igényel, nem elég egy normál restart. Az exact input/output és erőforráslimitek helyessége csak implementáció után válik futtatással igazolttá.

Minden későbbi riport: commit, dátum, OS/browser/worker-image, fixture formátum/méret/pixelszám és hash (nem személyes fájl), lépések, elvárt/tényleges állapot és DB/storage/kvótamérés, idő/peak memória, bizonyíték. Sérült fájl mellett a jó képek és az eredetik használhatóságát is ellenőrizni kell. Thumbnail-siker nem második metadata-processor-, resumable-import- vagy teljes SZD2 PASS.

### Processor-séma és migráció ellenőrzése – 2026-10-29

Opt-in helyi migráció-kísérlet: scripts/verify-processing-schema.mjs, backend/prisma/verification/processing-model.sql. Csak saját, véletlen nevű, ideiglenes PostgreSQL17 konténer, synthetic datasource és rollbackolt fixture-ek; nem érinti az alkalmazás DB-jét/volume-jait. A már létező image-et használja, nincs letöltés/új dependency, nincs CI-service vagy Jest-integration suite. A konkrét SQLSTATE-ek tesztelése a valódi adatbázis-korlátokra vonatkozik, nem SQL-szöveg regex-ellenőrzésére.

Upgrade: régi migrációk és ACTIVE/PENDING/File/UploadOperation/User/Share/Audit fixture-ek után az új migrate deploy; minden régi táblasnapshot és reserved/used változatlan. Friss DB-n a teljes lánc is deployolható. Migrációs history/status és migrate diff strukturális egyezés; a Prisma diff által nem reprezentált CHECK-eket külön75 SQL-eset vizsgálja. Duplicate logical job/result, új processorverzió, cross-owner/file/job/attempt/key FK, hash/MIME/méret/geometria, teljes és hiányos lease, counters, proof nélküli release/NULL/finite dátumok, RESTRICT és a régi kvóta-check a fókusz. Az egész generált kliens-sémát normál Prisma-create/default timestamp próbával is ellenőrizzük, rollbackkel. A pozitív row/FK-fixture nem teljes publikálási use case.

A cross-row jobSUCCEEDED/result, aktuális fence/state history és User-counter összegek könyvelését későbbi service-tesztek igazolják; a séma nem ennek implementációja. A frontend/backend meglévő unitok, typecheck és build kompatibilitási regressziót jelezhetnek, új képfeldolgozási működést nem bizonyítanak.

### Thumbnail storage I/O unitok – 2026-10-29

Az új storage-transfers.spec.ts mockolt SDK mellett vizsgálja a teljes conditional32MiB-limitű readet és512KiB write-ot. Pontos/plus-one/config cap, ETag/206/ContentRange/ContentLength, short/long/nonbinary/stalled/late stream, caller abort/preabort és teljes deadline; write snapshot/ChecksumSHA256/IfNoneMatch/maxAttempts1,400/409/412/503 és hibás successmeta; canonical original/derived key és végső sortörések; külön source-allowlist/derived-WebP, SDK-close egyszeriség. A régi storage tesztek regressziós kapuk. Ez nem valódi provider-kérés vagy új integration/e2e suite, nem képdekódolás/ownership/fence/quota-teszt. A fizikai DELETE után unproven marad a closure; derived recovery full-read és providerproof későbbi külön ellenőrzés.


### Implementált thumbnail unitok – 2026-10-29

Három Jest suite,107 eset:42 tényleges decoder-child/Sharp szintetikus kép,17 kontrollált process/IPC/deadline/abort,48 független WebP-header validálás. A fixture-ek futáskor kis szintetikus inputból keletkeznek; output újra Sharp-dekódolással formátum/méret/alpha/orientáció/pixel/metadata szerint ellenőrzött. Túlméretes pixelheaderhez nincs óriási raster allokálva. GIF/WebP/APNG frame0 és külön posteres APNG elutasítása külön eset. A fake child hibái nem natív OOM/time bizonyítékok. Worker/cgroup, DB/storage orchestration/recovery, Debian runtime, browser/UAT változatlanul nyitott; nem indult új integration/e2e suite.


### Explicit processing-state és publication unitstratégia – 2026-10-30

A Prisma-port tranzakcióit mutexes, rollbacket modellező izolált fixture ellenőrzi; a locksorrend és DB-clock lekérdezése megfigyelhető. Konkurens claim/reserve/finalize, külön jobok közös userkvótája, azonos végrehajtás replay-je, minden véglegesítési lépés DB-hibája, commit utáni elveszett válasz, lease/source/build eltérés és retry-keretek kapnak regressziót. A publisher külön mockolt storage receipt/HEAD és DB-service határon ellenőriz commit-before-PUT-ot, inputsnapshotot, egyszeri írási jogot, storage/DB részhibát és tiltott DELETE/release-t. A published winner védett, régi bizonytalan R megmarad.

Ez nem valódi PostgreSQL-lock/transaction-izoláció vagy MinIO conditional-write/recovery bizonyíték. Worker/full-read adoption/provider-closure és végpont/browser elfogadás továbbra külön kapu; a schema korábbi SQL-verifier eredménye nem bizonyítja ezt a service-szeletet.


### Tartós confirm-hook unitok – 2026-10-31

A valódi UploadConfirmService és ProcessingStateService közös mockolt Prisma transaction porton fut. Mutex + file/receipt/counter/job/audit rollback és lost-commit-response fixture ellenőrzi a közös commitot; nincs második enqueue-tranzakció. Párhuzamos/replay confirm, FAILED job, legacy ACTIVE job nélkül, kizárt állapot/MIME/storage verification, mindegyik DB-írási hiba és deadline-rollback kap ellenőrzést. A provider factory ugyanazt a build descriptort adja, process-hívás nem történik. Ezek nem valódi PostgreSQL-lock vagy processzkilövéses recovery bizonyítékok; a tényleges DB/MinIO/restart kapu külön marad.


### Worker/recovery izolált unitok – 2026-10-31

A valódi worker/state/publication service-ek közös mutexes/rollbackes DB-double és storage-port mellett teszteltek, a processor maga mockolt (a meglévő külön processor-suite valódi szintetikus képeket dekódol). Promise-gate és fake timer idézi elő a fizikai slot/heartbeat/abort/drain/late-result versenyeket; a DB-clock külön vezérelt. Recovery-fence, full-read evidence, writepending/stored crashpontok, read-only probe-budget, generation-budget végén adoption, rollback/lostack, candidate-hash/header/source hiba, source delete/restore, claim-gap race és closure nélküli R-retention külön esetek. Derived adapter ugyanazon bounded full-read primitíven keresztül kap SDK/stream unitokat.

Ezek nem tényleges PostgreSQL lockok, container OOM vagy processzkilövéses recovery. A tesztriport manuális listája NYITOTT mindaddig, amíg azonosított verzióval, kontrollált szintetikus inputtal, tényleges DB+object-count+kvóta ellenőrzéssel végre nem hajtják. A Compose config validálása nem indítási/erőforrás-limit bizonyíték.


### Processing API unitok – 2026-10-31

Strict DTO/UUID/body/query, session/Origin route-wiring, külön bounded per-user rate budget, egész batch ownership, ACTIVE/allowlist/verzió/build/forrás, explicit safe projekció és csak READY+SUCCEEDED eredmény. Thumbnail HEAD/size/MIME, fixed inline név, TTL-minimum, lejárt/hibás aláírás és signing utáni metaadatváltozás; retry valódi state-service CAS-szal párhuzamos és lost-response replay, SUCCEEDED no-op, jövőbeli revision, végleges hibák és keret. Storage/DB belső hibák nem szivároghatnak. Ezek izolált unitok, nem futó HTTP/valódi PostgreSQL/MinIO elfogadás. A fájllista/original-preview regresszióit a meglévő teljes unitkör fedi.


### Thumbnail galéria unit/template – 2026-10-31

Strict processing kliens (batch/order/version/public fields, safe error/timeout/abort/Retry-After), fake-clock láthatósági scheduler (20 ID,10s globális spacing, egy in-flight, fairness, terminal stop, hiba utáni kézi retry), régi/fiókváltás utáni válasz eldobása és revision-megtartó manuális processor-retry. Közös thumbnail/original URL-sor4 fizikai slot, abort mellett is; külön image-error/no-loop memóriaállapot. SSR-kártya/modal template és page-visibility adapter lifecycle-unit ellenőrzi az eltérő URL-forrást, állapotokat/gombokat, visibilitychange/unmount abortot és listener cleanupot. Ez nem valódi DOM/böngészős vagy DB/MinIO elfogadás; az ellenőrzőlista a meglévő tesztriportban marad nyitott.


### Thumbnail watcher-regresszió – 2026-10-31

Az SSR template nem futtatja az onMounted/láthatóság/watch ütemezést, ezért önmagában nem védi a thumbnail betöltését. A már telepített Vue compiler/TypeScript és Vue host renderer a tényleges kliens SFC-kódot fordítja/futtatja izolált unitban, új framework nélkül. Külön eset a visibility és SUCCEEDED ugyanabban a batchben: az invalidálásnak meg kell előznie az új URL-kérést; a cache READY marad, image-error után csak kézi retry, új result-azonosság egyszer invalidál. A komponens és a teljes parent lifecycle is fut; a tényleges Chrome/DB/MinIO bizonyíték külön a tesztriportban szerepel.

### Multipart integráció – tervezett ellenőrzések, 2026-11-01

Ez a dokumentáció nem hoz létre új tesztet/frameworköt és nem jelöl implementációt vagy próbát PASS-nak. A tényleges PoC eredménye a tesztriportban marad; az [API](../03_design/api.md#multipart-képimport--tervezett-szerződés-2026-11-01) / [modell](../03_design/data_model.md#multipart-import-és-transfer--tervezett-2026-11-01) elfogadási feladatai:

- Unit: owner/Origin/404 és hibás mező/hash/cursor/részszám; import/file dedupe-kulcsok és normalizált payload, ugyanazon clientFileId új kulccsal;50/5-ös cap; méret- és kvótahatár, párhuzamos init, részleges kötegsiker és elveszett commit-response.
- Adapter: pontos részméret/aláírt Content-Length, grantlejárat/maxExpiresAt kiadás előtt, lapozott teljes ListParts és ListMultipartUploads, complete rögzített rendezett manifestből, create-only feltétel, HTTP200-ba ágyazott hiba, timeout/NoSuchUpload, create nem-idempotens retry kizárása. A mock nem bizonyít MinIO-kompatibilitást.
- Service: commit előtti/utáni create crash, CREATE_UNKNOWN egyeztetés; SEALING/sign verseny, part-csere a listázás után; complete timeout+object már létezik; confirm hash/signature/immutable read és egyszeri reserved→used+audit+thumbnail-job; késői régi fence nem publikálhat.
- Lifecycle: complete/confirm és cancel/expiry kétféle sorrendje, régi part-PUT/complete abort utáni befejezése, üres ListParts/HEAD404/Abort204 önmagában nem release, unknown I/O/CLEANUP_BLOCKED megtartott foglalás, pozitív bizonyíték utáni egyszeri release. Legacy pending cleanup nem kezel multipartot; régi counters/adatok migráción át megmaradnak.
- Valódi MinIO/böngésző: Uppy támogatott backend-complete illesztés cookie-auth mellett; megszakadt rész és kész rész, oldalfrissítés+újraválasztott fájl méret/hash, új login/lejárt URL, backend/MinIO restart; DB/storage/kvóta és másik owner kizárása. Két aktív fájl/egy rész és bounded polling tényleges megfigyelése.
- Mérési kapu: kontrollált10/50 képes baseline/multipart összevetés; kész fájlok és részek újraküldésének hiánya, fölös payload, idő, hash és feldolgozóeredmények. Az5MiB alatti kép teljes retry-ja nyílt korlát; nem számítható teljes resumable elfogadásnak. Külső UAT továbbra külön feladat.
