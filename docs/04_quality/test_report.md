# Test report

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
