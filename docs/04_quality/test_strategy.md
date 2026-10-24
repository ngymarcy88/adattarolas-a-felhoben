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
