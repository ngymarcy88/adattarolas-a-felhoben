# Adattárolás a felhőben

Személyes cloud media storage alkalmazás, amely képek és videók biztonságos feltöltését, kezelését, megtekintését, megosztását és tárhelyhasználat-követését mutatja be termékminőségű, AI-asszisztált fejlesztési folyamatban.

## Jelenlegi állapot

Az **1. mérföldkő: Projektindítás és repo-alapok**, a **2. mérföldkő: Termékvízió, scope és MVP meghatározása**, valamint a **3. mérföldkő: Architektúra és fő technológiai döntések** dokumentációs eredményei elkészültek. A termékvízió, a hat user story-ból álló MVP scope, a capability map, a tervezett metrikák, a fő UX-folyamatok, a C4 nézetek, a quality attribute-ok és az első ADR-készlet rögzítve vannak. Futtatható frontend vagy backend alkalmazás még nincs scaffoldolva, ezért minden termékképesség tervezett státuszú.

## Tervezett stack

- Frontend: Vue 3 + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + TypeScript + NestJS
- Adatbázis: PostgreSQL + Prisma
- Lokális object storage: MinIO
- Későbbi cloud storage: AWS S3 vagy OCI Object Storage S3-kompatibilis API-val
- Első tesztelési fókusz: unit tesztek

## Főbb tervezett képességek

- Felhasználói regisztráció és bejelentkezés.
- Kép- és videófeltöltés privát S3-kompatibilis tárolóba.
- Saját fájlok listázása, megtekintése és letöltése.
- Időkorlátos megosztási linkek.
- Tárhelyhasználat megjelenítése.
- Soft delete és késleltetett object purge stratégia.
- Törölt fájlok visszaállítása a megőrzési időn belül.

## Dokumentáció

- [Dokumentációs index](docs/00_index.md)
- [High-level szakdolgozati terv](docs/plan.md)
- [Mérföldkövek](docs/milestones.md)
- [Termékvízió](docs/01_product/vision.md)
- [MVP scope contract](docs/01_product/scope_contract.md)
- [Capability map](docs/01_product/capability_map.md)
- [Termékmetrikák](docs/01_product/metrics.md)
- [Fő UX-folyamatok](docs/01_product/ux_flows.md)
- [C4 Context](docs/02_architecture/c4_context.md)
- [C4 Container](docs/02_architecture/c4_container.md)
- [C4 Component](docs/02_architecture/c4_component.md)
- [Quality Attributes](docs/02_architecture/quality_attributes.md)
- [ADR-ek](docs/02_architecture/adr/README.md)
- [AI Manifest](docs/07_ai/ai_manifest.md)
- [Prompt Log](docs/07_ai/prompt_log.md)
- [Verification Log](docs/07_ai/verification_log.md)

## Quickstart

Jelenleg nincs futtatható alkalmazás, ezért nincs telepítési vagy indítási parancs. A későbbi mérföldkövekben a README ezen része konkrét, reprodukálható parancsokra bővül.

Tervezett későbbi irány:

```bash
# Kesobbi merfoldko utan varhato parancsok
npm install
npm test
npm run build
```

## Konfiguráció

A repo csak placeholder konfigurációt tartalmaz: [.env.example](.env.example).

Valódi `.env` fájlt, tokent, jelszót, access keyt vagy cloud credentialt nem szabad commitolni. A `.gitignore` minden `.env*` fájlt tilt, kivéve a dokumentációs célra használt `.env.example` sablont.

## Tesztelés

Automata tesztfuttató még nincs bevezetve. Az első unit teszt setup a későbbi backend/frontend scaffold mérföldkövekben készül el, és ekkor kerül ide a pontos futtatási parancs.

## Repo struktura

```text
/
├── README.md
├── AGENTS.md
├── .env.example
├── .gitignore
├── frontend/
├── backend/
└── docs/
    ├── 00_index.md
    ├── plan.md
    ├── milestones.md
    ├── 01_product/
    ├── 02_architecture/
    ├── 03_design/
    ├── 04_quality/
    ├── 05_security_ops/
    ├── 06_release/
    └── 07_ai/
```

## Licenc és harmadik fél komponensek

Licenc és dependency lista még nincs véglegesítve, mert alkalmazáskód és csomagkezelő még nincs a repóban. A későbbi dependency-k bevezetése után a `docs/05_security_ops/privacy_licensing.md` fogja tartalmazni a részleteket.
