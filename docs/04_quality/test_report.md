# Test report

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
