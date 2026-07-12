# Adattárolás a felhőben

S3-kompatibilis objektumtárolóra tervezett személyes médiafájl-kezelő webalkalmazás szakdolgozati repository-ja.

## Jelenlegi állapot

A repository **dokumentáció-only tervezési állapotban** van. Nincs futtatható frontend vagy backend, Prisma schema, Docker Compose, package manifest, automata tesztkörnyezet vagy CI/CD pipeline. A dokumentumok célarchitektúrát és jövőbeli viselkedést írnak le; a termékfunkciók még nem implementáltak.

Elkészült dokumentációs alapok:

- projekt- és repo-alapok;
- termékvízió és hat core MVP user story;
- C4 architektúranézetek és ADR-k;
- SZD2 dokumentációs rebaseline a részletes design-, quality- és security-szerződésekkel.

## Szakmai irány

A terv négy pillérre épül:

1. **Core cloud-storage MVP:** auth, privát médiafeltöltés, lista, preview, download, usage, sharing, soft delete és restore.
2. **Megbízható fájl-életciklus:** pending upload, idempotens confirm, kvótafoglalás, magic-number validáció, cleanup és későbbi purge-stratégia.
3. **Skálázható és karbantartható architektúra:** stateless backend, cursor pagination, storage adapter, modulhatárok és reprodukálható lokális környezet.
4. **Opcionális termék-MI:** core MVP utáni, explicit felhasználói indítású kép-címke- és leírásjavaslat emberi jóváhagyással.

Az alkalmazásba tervezett MI-funkció külön fogalom az AI-asszisztált fejlesztési folyamattól. A fejlesztés AI-használatát és emberi verifikációját a `docs/07_ai/` naplói követik.

## Scope

### Core MVP

- regisztráció, login és védett felület;
- legfeljebb 100 MB-os kép vagy rövid videó feltöltése privát MinIO/S3 bucketbe;
- PostgreSQL metaadat-kezelés;
- saját aktív fájlok cursor-lapozott listája;
- biztonságos preview és download;
- denormalizált tárhelyhasználat;
- időkorlátos alap share-link;
- soft delete és egyedi restore 30 napon belül;
- backend validation, authorization, alap audit és unit tesztek.

### MVP+

- opcionális, első körben csak képekhez használható MI-metaadat-javaslat;
- explicit trigger, accept/edit/reject és provider-failure fallback;
- nem része a Core MVP Definition of Done feltételeinek.

### Later

- automatizált purge worker;
- multipart upload;
- cloud deployment;
- integration, contract és e2e tesztek;
- CI/CD és fejlett monitoring;
- thumbnail, transzkódolás, admin és fejlett keresés.

## Tervezett stack

- Frontend: Vue 3, Vite, TypeScript, Tailwind CSS és Vue Router.
- Backend: Node.js, TypeScript és NestJS.
- Adatbázis: PostgreSQL + Prisma.
- Lokális object storage: MinIO.
- Későbbi cloud target: AWS S3 vagy OCI Object Storage S3-kompatibilis API-val.
- Első tesztelési szint: unit tesztek.

## Dokumentáció

Kanonikus belépési pontok:

- [Dokumentációs index](docs/00_index.md)
- [High-level szakdolgozati terv](docs/plan.md)
- [Mérföldkövek és státusz](docs/milestones.md)
- [Core MVP scope contract](docs/01_product/scope_contract.md)
- [Architektúra és ADR-ek](docs/02_architecture/README.md)
- [API-, adatmodell- és hibaszerződések](docs/03_design/README.md)
- [Tesztstratégia és teszt baseline](docs/04_quality/README.md)
- [Security, privacy és operations](docs/05_security_ops/README.md)
- [AI-használat és verifikáció](docs/07_ai/ai_manifest.md)

## Quickstart

Jelenleg nincs futtatható alkalmazás, ezért nincs hiteles telepítési, indítási, build- vagy tesztparancs. Ezek csak a későbbi scaffold és lokális környezet tényleges elkészülte, majd tiszta környezetben végzett kézi ellenőrzése után kerülhetnek ide.

## Konfiguráció és titkok

A repository kizárólag placeholder konfigurációt tartalmaz a [.env.example](.env.example) fájlban. Valódi `.env`, jelszó, JWT secret, access key, cloud credential vagy személyes adat nem commitolható.

Normál lokális fejlesztéshez a későbbiekben sem lesz szükség valós AWS- vagy OCI-credentialre; a cél a PostgreSQL és MinIO alapú környezet.

## Repository szerkezet

```text
/
├── README.md
├── AGENTS.md
├── frontend/             # jelenleg placeholder
├── backend/              # jelenleg placeholder
└── docs/
    ├── 01_product/       # termékvízió és kanonikus scope
    ├── 02_architecture/  # C4 és ADR-ek
    ├── 03_design/        # tervezett API/adatmodell/error szerződés
    ├── 04_quality/       # tesztstratégia és baseline
    ├── 05_security_ops/  # threat, privacy, runbook, observability
    ├── 06_release/       # placeholder a tényleges release-ig
    └── 07_ai/            # AI-asszisztált fejlesztés evidence
```

## Dokumentációs alapelv

A repository nem állíthat implementáltként olyan API-t, entitást, funkciót, tesztet vagy üzemeltetési képességet, amelyhez nincs tényleges kód és verifikálható evidence. A tervezett és megvalósított állapot minden mérföldkőben külön kezelendő.
