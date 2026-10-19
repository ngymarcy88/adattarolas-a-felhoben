# ADR-013: Reproducible local foundation and initial schema

## Status

Accepted

## Date

2026-10-18

## Context

A projektnek a bejelentkezési szelet előtt futtatható Vue/NestJS alapra, PostgreSQL-re, privát S3-kompatibilis tárhelyre és verziózott adatbázissémára van szüksége. Az októberi import/processing irány külön szerződés- és technológiadöntést igényel; ezt nem kell a scaffoldba előre beégetni.

## Decision

- Egy npm workspace (`backend`, `frontend`), egy gyökérbeli `package-lock.json`, rögzített közvetlen csomagverziók és Node 22.23.2 baseline. A Node 24 kompatibilis ága engedélyezett, de a jelenlegi próba Node 22-n történik.
- NestJS 11.2.7 és Config 4.0.4 a CommonJS/Jest futtatással ellenőrzött kombináció; a NestJS 12 ESM-váltása a kezdeti tesztpróbán kompatibilitási hibát okozott.
- Vue/Vite/Tailwind/Router kezdőoldal, külön API-kliens; NestJS typed config, liveness endpoint, request ID és biztonságos globális hibakezelés. Auth és upload nincs ebben a szeletben.
- Prisma ORM 7.10.1, PostgreSQL driver adapter és CJS-formátumú, ignore-olt generált kliens. A Prisma 8 RC helyett stabil 7-es verziót használunk; a kliens és CLI verzió egyező.
- Kezdeti `User`, `FileObject`, `ShareLink`, `AuditEvent` séma és SQL migráció. Az import-, job-, derived-result és opcionális MI-entitások külön későbbi migrációba kerülnek, a szerződések lezárása után.
- Adatbázis CHECK constraint védi a nemnegatív számlálókat és teljes kvótát, fájlméretet, alap state/timestamp konzisztenciát és share hash/expiry alakot. Az ownershipet a ShareLink összetett fájl/owner FK-ja is védi; ez nem helyettesít backend authorizationt.
- Lokális Docker Compose, loopback portokkal és tartós named volume-okkal. PostgreSQL 17.9; MinIO a RELEASE.2025-10-15T17-29-55Z kiadás `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` commitjából épül, nem a korábbi, ismert javítás előtti image-ből.
- Az inicializáló `mc` kliens is forrásból épül: RELEASE.2025-08-13T08-35-41Z, `d6541ea280b73a834b64d4097e21f2be77676104` commit. A registryben nem hozzáférhető kliens-image helyett ez az ellenőrzött build.
- A MinIO upstream e kiadáshoz forrásból építést ír elő; a repository archivált. Ez a stack lokális fejlesztői céljára megtartott, dokumentált függőség, nem production vagy cloud deployment-jóváhagyás. A Docker build Go és Alpine base image-et használ, host Go-telepítés nélkül.
- A bucket privát, az alkalmazás külön bucketre korlátozott usert kap; az adminazonosság csak inicializálásra/konzolra való. A MinIO CORS a konfigurált frontend originre korlátozott.
- Az `env:init` kizárólagos fájllétrehozással véletlen helyi credentialöket ír az ignore-olt `.env`-be; sosem ír felül vagy nyomtat credentialt. A SPA csak `VITE_*` publikus változót kap.

## Alternatives considered

- Külön npm install/lockfile almappánként: működő alternatíva, de duplikált dependency-verziókezelést és Quickstartot okoz.
- Prisma előzetes kiadás: nincs szükség rá; a stabil 7-es ág támogatja a választott adatbázist és generálási módot.
- Régi MinIO binary image: gyorsabb első indítás, de a biztonsági javítást tartalmazó upstream release előtti állapotot rögzítené.
- Helyi PostgreSQL/MinIO telepítés Docker nélkül: gépfüggőbb és nehezebben reprodukálható.
- Teljes import/worker séma most: előre kiválasztaná a még nem vizsgált átviteli és feldolgozási működést.

## Consequences

Az első dependency- és MinIO-source build lassabb lehet, utána cache-elhető. A MinIO source commit rögzített; a base image-ek minor tagjei és Alpine csomagjai később frissülhetnek, ezért a build nem bitazonossági garancia. Későbbi release-nél image digestet és dependency-vizsgálatot is rögzíteni kell. A named volume-ok megmaradnak leállításkor; jelszócsere vagy adatreset külön operációs művelet.

A schema/migráció önmagában nem implementál authot, kvótafoglalást, sharinget vagy lifecycle-folyamatot. A health liveness, nem folyamatos DB/MinIO readiness. A retry/recovery és derived kvóta későbbi feature-szelet része; e döntés nem hoz létre CI-t vagy integration/e2e tesztkészletet.

## Verification

A build/typecheck/unit, Prisma validate/generate/migrate, ismételt migrate, Compose health/bucket inicializálás és manuális HTTP-próba tényleges eredménye a [tesztriportba](../../04_quality/test_report.md) kerül. A generált kliens/`.env` ignore-szabályait és a kliensbundle titokmentességét is ellenőrizni kell.

Források: [NestJS Prisma-recept](https://docs.nestjs.com/recipes/prisma), [Tailwind Vite-illesztés](https://tailwindcss.com/docs/installation/using-vite), [MinIO biztonsági release és source-build](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).
