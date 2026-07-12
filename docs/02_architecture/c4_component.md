# C4 Component

## Státusz

**Tervezett állapot – nem implementált funkcionalitás.**

## Cél

A komponensnézet a későbbi NestJS API felelősségi határait rögzíti. A controllerek vékonyak, az üzleti szabályok service-ekben, a külső rendszerek pedig adapterek mögött maradnak.

## Core komponensek

```mermaid
flowchart LR
    controllers["REST controllers\nDTO validation és auth boundary"]
    auth["Auth module"]
    users["Users module"]
    files["Files module\nlifecycle és pagination"]
    sharing["Sharing module"]
    audit["Audit module"]
    storage["Storage service\nproviderfüggetlen interface"]
    s3["S3 adapter"]
    prisma["Prisma service"]
    db["PostgreSQL"]
    objects["MinIO / S3"]

    controllers --> auth
    controllers --> files
    controllers --> sharing
    auth --> users
    files --> users
    files --> storage
    files --> audit
    sharing --> files
    sharing --> storage
    sharing --> audit
    auth --> prisma
    users --> prisma
    files --> prisma
    sharing --> prisma
    audit --> prisma
    storage --> s3
    s3 --> objects
    prisma --> db
```

## Opcionális MVP+ komponensek

```mermaid
flowchart LR
    controller["AI metadata controller"]
    service["AI metadata service\nhuman-in-the-loop"]
    jobs["Job boundary\nkésőbbi workerre cserélhető"]
    provider["AI provider interface"]
    adapter["Külső provider adapter"]
    files["Files service"]
    audit["Audit service"]
    prisma["Prisma service"]

    controller --> service
    service --> files
    service --> jobs
    jobs --> provider
    provider --> adapter
    service --> audit
    service --> prisma
```

Az MVP+ komponensek hiánya vagy hibája nem akadályozhat auth-, upload-, list-, preview-, download-, delete-, restore- vagy sharing-műveletet.

## Komponensfelelősségek

| Komponens | Felelősség | Fontos szerződés |
|---|---|---|
| `auth` | Regisztráció, login, logout, JWT-cookie és guard | Generic login hiba; token nem kerül localStorage-ba vagy logba |
| `users` | Profile, `usedStorageBytes`, `reservedStorageBytes` | Számlálók csak tranzakciós use case-ben változhatnak |
| `files` | Pending/active/deleted lifecycle, ownership, cursor pagination | Confirm pontosan egyszer könyvel; lista stabil rendezésű |
| `storage` | Presign, metadata, bounded range-read és delete interface | Direkt SDK-hívás nem szóródhat szét a codebase-ben |
| `sharing` | Token generálás, hash, expiry és publikus validáció | Core-ban nincs revoke/access analytics |
| `audit` | Fontos állapot- és security események | Nincs raw token, URL, fájltartalom vagy nyers MI-adat |
| `health` | Minimális API-elérhetőség | Nem szivárogtat secretet vagy részletes belső hibát |
| `config` | Környezeti változók validált leképezése | `process.env` használat nem szóródhat szét |
| `common` | Error shape, request ID, guard/decorator és pure validation utilok | Stabil, dokumentált API-hibák |
| `ai-metadata` | Opcionális suggestion lifecycle és emberi döntés | Csak aktív kép, explicit trigger, Core MVP-től független |

## Függőségi szabályok

- Controller nem hívhat közvetlenül Prisma vagy S3 klienst.
- A domain/service réteg portokat használ külső szolgáltatásokhoz.
- A cursor kódolja a rendezési kulcsot, de nem tartalmaz érzékeny adatot.
- A job boundary nem jelent elfogadott queue dependency-t; a konkrét technológia későbbi ADR tárgya.
- Audit események írása nem teheti közzé a művelethez használt credentialt vagy URL-t.
