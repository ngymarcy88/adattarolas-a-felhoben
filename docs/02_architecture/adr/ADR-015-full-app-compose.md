# ADR-015: Teljes lokális alkalmazás Docker Compose-zal

## Status

Accepted – implementált konfiguráció; konténeres build/indítás futtatási igazolása még nyitott.

## Context

A korábbi Compose csak PostgreSQL-t és MinIO-t indított. A felhasználó a `docker-compose.yaml` nevet és a teljes alkalmazás közös indítását kérte. A host fejlesztési módnak és a meglévő adatoknak meg kell maradniuk.

## Decision

Egy gyökérbeli Dockerfile külön backend és frontend célokkal épít. A backend Node 22.23.2 alatt, a buildelt Vue alkalmazás Nginx 1.30.5 Alpine alatt fut, nem root userként. Az Nginx SPA fallbacket biztosít a közvetlen auth-útvonalakhoz. A backend image a lokális migrációhoz szükséges Prisma CLI-t és fejlesztési függőségeket is tartalmazza; nem produkciós minimalizálás a cél.

A PostgreSQL health után egyszeri `db-migrate`, a MinIO health után egyszeri `minio-init` fut. A backend mindkettő sikerét megvárja; a frontend a backend liveness jelzését. Ez indulási sorrend, nem folyamatos DB/storage readiness vagy automatikus hibajavítás. A [Compose függőségi feltételei](https://docs.docker.com/compose/how-tos/startup-order/) adják a kapukat.

A konténer-entrypoint a meglévő DATABASE_URL kódolt user/password, adatbázis és query mezőit megőrzi, kizárólag a host/port lesz postgres:5432. A backend a belső minio:9000 címet kapja. A browser API-címe hostoldali marad. Későbbi presigned upload előtt a publikus és belső storage-cím illesztése külön tervezendő; jelenleg nincs storage adapter/upload.

Csak explicit backend változók kerülnek runtime-ba, MinIO admincredential nem. A frontend build csak publikus API-címet kap. A `.dockerignore` allowlist kizárja a titkokat, helyi dependencyket, generált Prisma-kódot és dokumentumokat. A cloudvault projekt neve és a postgres-data/minio-data kötetek megmaradnak. Leállítás `docker compose down`, köteteltávolítás nélkül.

## Alternatives considered

- Host npm dev szerverek: hot reloadhoz megmaradnak, de több telepítési lépést igényelnek.
- Vite dev/preview szerver konténerben: helyette buildelt statikus alkalmazást szolgálunk ki, SPA fallbackkel. Az [Nginx hivatalos image](https://hub.docker.com/_/nginx) új runtime-komponens, nem frontend framework csere.

## Consequences

Egy `docker compose up -d --build --wait` indít mindent az env inicializálása után. Első build internetet és több időt igényel. Frontend publikus konfiguráció változtatásakor új build kell. A hoston Node csak az env-generálóhoz és opcionális fejlesztéshez/tesztekhez kell. A Docker daemon elérhetetlensége blokkolja a valós konténeres igazolást.

## Verification

Compose-config validálás, backend bind-address unit tesztek, container URL-helper unit tesztek és workspace build. Még szükséges: képek felépítése, teljes tiszta indulás, migrációk és bucket ellenőrzése, közvetlen /login és /app megnyitása, DB-s auth-folyamat, leállítás/újraindítás utáni adatmegőrzés. A tényleges eredmények a [tesztriportban](../../04_quality/test_report.md) szerepelnek; ez az ADR nem állít még elvégzett Docker-próbát.
