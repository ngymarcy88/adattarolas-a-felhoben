# Privacy és licensing

**Tervezett állapot – nem implementált funkcionalitás.**

## Jelenlegi állapot

A repository technikai scaffoldot, package manifesteket és verziózott kezdeti sémát tartalmaz. Production adatot és valódi felhasználói médiát nem tartalmaz; az indítási próba szintetikus adatot használ. A root lockfile a dependency-verziók forrása. Az alábbi termék-adatkezelési kapuk továbbra is tervezettek, nem kész adatkezelési tájékoztató.

## Tervezett adatleltár

| Adatkategória | Példa | Cél | Megőrzési irány |
|---|---|---|---|
| Fiókadat | email, displayName, password hash | Auth és tulajdonosi elkülönítés | Fiók-életciklus; végleges törlés külön Later döntés |
| Médiaobjektum | kép vagy rövid videó | Felhasználói storage szolgáltatás | Aktív állapot vagy soft delete után későbbi purge |
| Fájlmetadata | név, MIME, méret, state, időpontok | Lista, validation és lifecycle | FileObject életciklus |
| Kvótametadata | used, reserved, limit | Quota enforcement és dashboard | User rekord életciklus |
| Share metadata | token hash, expiry, resource reference | Időkorlátos publikus hozzáférés | Expiry vagy soft-delete invalidálás; későbbi cleanup policy |
| Audit | actor/resource reference, action, request ID | Security és hibakeresés | Konkrét időtartam implementáció előtt döntendő |
| MI-javaslat | normalizált tags/description, status, provenance | Opcionális human-in-the-loop metadata | MVP+ privacy döntés; raw input/output nem tárolható logban |

## Adatminimalizálás

- Storage key nem kerül publikus API-válaszba.
- Eredeti fájlnév csak display/download célra használható.
- Audit metadata allowlistelt; raw token, URL, content és credential tiltott.
- Share tokenből csak SHA-256 hash tárolható.
- MI-providerhez csak explicit kéréshez szükséges kép és minimális kontextus továbbítható.
- Provider response-ból csak normalizált javaslat, státusz és minimális provenance tárolható.
- Arcfelismerés, biometria és érzékeny profilalkotás tiltott, nem Later roadmap.

## Retention és törlés

- User soft delete után a file 30 napig visszaállítható; ez restore-határ, nem fizikai törlési SLA.
- Soft-deleted file továbbra is kvótát foglal.
- Automatizált retention purge Later scope; bevezetése előtt idempotencia, retry és runbook szükséges.
- Pending upload alapértelmezett teljes lejárata 15 perc; cleanup csak object absence vagy sikeres delete után old reservationt.
- Soft delete az aktuális share-linkeket végleg invalidálja; restore után új link kell.
- User account, audit, expired share és MI-suggestion konkrét retention időtartama nincs elfogadva; production indulás előtt kötelező döntés.

## Opcionális MI-provider go/no-go

Provider kiválasztása előtt dokumentálandó:

- szolgáltató, régió és alfeldolgozók;
- input/output retention és törlési lehetőség;
- felhasználja-e a szolgáltató tréningre az adatot, és kikapcsolható-e;
- adatátviteli és hozzáférési feltételek;
- modell- és API-verzió bizonyíthatósága;
- licenc, felhasználási feltételek és outputjogok;
- költség-, rate-limit- és service availability kockázat;
- arcfelismerés/szenzitív inference technikai és policy tiltása.

E kapu hiányában az MVP+ funkció nem implementálható és valós képet nem szabad külső providerhez küldeni.

## Dependency licensing baseline

A telepített közvetlen npm-függőségek verzióit a root lockfile és a két workspace package manifestje rögzíti. A 2026-10-19-i lockfile-metaadat ellenőrzés közvetlen függőségei az alábbiak; az audit eredménye a [tesztriportban](../04_quality/test_report.md) található; a teljes tranzitív licencek és egy későbbi kiadás feltételeinek review-ja nem zárul le pusztán a scaffold elkészültével.

| Közvetlen npm-csomagcsoport | Licenc a lockfile szerint | Szerep |
|---|---|---|
| NestJS 11.2.7, Config 4.0.4 | MIT | Backend runtime |
| Prisma Client/adapter/CLI 7.10.1 | Apache-2.0 | ORM és adatbázis tooling |
| reflect-metadata 0.2.2, RxJS 7.8.2 | Apache-2.0 | Backend runtime |
| dotenv 17.3.1 | BSD-2-Clause | Lokális konfiguráció |
| jsonwebtoken 9.0.3, @types/jsonwebtoken 9.0.10 | MIT | Helyi HS256 JWT-aláírás/verifikáció; típus dev-only, nincs külső auth-provider vagy adatküldés |
| Vue 3.5.44, Router 4.6.4 | MIT | Frontend runtime |
| Vite 8.3.4, plugin-vue 6.0.10, Tailwind/plugin 4.3.3 | MIT | Frontend build |
| Jest 30.5.2, ts-jest 29.4.6, Vitest 5.0.5 | MIT | Unit tooling |
| Nest CLI 11.0.24, vue-tsc 3.3.13, közvetlen @types csomagok | MIT | Fejlesztői tooling |
| TypeScript 5.9.3 | Apache-2.0 | Fordító |

A pontos csomagneveket, eltérő `@types/node` verziókat és forrás-URL-eket a két manifest és a lockfile tartalmazza. Ez metaadatleltár, nem teljes tranzitív licencaudit.

A MinIO szerver és inicializáló kliens AGPL-3.0 licencű upstream forrásból Dockerben épül; pontos commitjuk az `infra/minio/Dockerfile` fájlban rögzített. Upstream források: [MinIO](https://github.com/minio/minio), [mc](https://github.com/minio/mc). Ezek lokális szolgáltatások, nem böngészőbe csomagolt könyvtárak. Publikálás/terjesztés és cloud üzemeltetés előtt a licencek, forráselérhetőség és karbantartottság külön felülvizsgálandó. A saját repository licence még nincs kijelölve. A scaffold nem küld alkalmazásadatot külső MI-providerhez.

Dependency hozzáadásakor rögzítendő:

- név, pontos verzió és közvetlen/transitív státusz;
- licenc és forrás URL/repository;
- felhasználási szerep;
- ismert security advisory és karbantartottság;
- adatot továbbít-e külső félnek;
- elfogadó review dátuma.

## Dokumentációs és AI-tartalom

- Promptba nem kerülhet valós secret, token, személyes adat vagy privát fájl.
- AI által generált szöveget és kódot emberi review és verifikáció nélkül nem lehet késznek tekinteni.
- Külső forrásból átvett szöveg, diagram vagy kód eredetét és licencét dokumentálni kell.
- A Prompt Log nem helyettesíti a dependency/licenc leltárt.

## Production előtti kötelező döntések

- adatkezelési tájékoztató és jogalap;
- account deletion és export policy;
- audit/share/suggestion retention;
- backup és restore adatkezelése;
- konkrét dependency licencek;
- esetleges MI-provider teljes privacy/licensing go/no-go.
