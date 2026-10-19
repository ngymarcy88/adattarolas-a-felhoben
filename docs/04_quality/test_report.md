# Test report

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
