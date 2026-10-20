# Dokumentációs index

## Repository státusz

A repository kezdeti technikai alapot tartalmaz: Vue/NestJS scaffold, npm workspaces és lockfile, központi konfiguráció, publikus health endpoint, Prisma-séma/kezdeti migráció és PostgreSQL–MinIO Docker Compose. Backend auth és a regisztráció/login/védett frontend fiókoldal implementált, unit/template bizonyítékokkal. Feltöltés, import és feldolgozás még nincs implementálva; CI/CD sincs. A valódi DB-s és böngészős auth-elfogadás még nyitott. A futtatási eredmények és a kézi környezetpróba állapotát a [tesztriport](04_quality/test_report.md) rögzíti; a többi dokumentum célállapotát nem szabad kész funkciónak tekinteni.

## Szakdolgozati kézirat

[Első részleges kéziratdraft – 2026. október 20.](thesis_draft.md): probléma és követelmények, technológiák/architektúra/döntések, implementált auth és ellenőrzése, AI-használat és korlátok. Szerzői review-ra szánt, nem végleges dolgozat. Letölthető export a projekt gyökerében: [CloudVault_szakdolgozat_draft_v1.pdf](../CloudVault_szakdolgozat_draft_v1.pdf).

## Követelménybaseline és szerződések

A [terv](plan.md), [mérföldkövek](milestones.md) és a gyökérbeli [SKILL.md](../SKILL.md) a 2026. októberi követelménybaseline-t rögzítik: teljes alkalmazás, folytatható kötegelt import, két verziózott képfeldolgozó tartós állapottal és recoveryvel, valamint mérési/UX/dolgozati bizonyíték. A termék-MI opcionális, ezeken kívül áll.

A részletes scope, API, adatmodell, traceability, C4 és ADR-ek egy része még a júliusi storage-baseline-t írja le. A high-level frissítés nem jelenti e szerződések teljes egyeztetését. A single-PUT-only, thumbnail-Later és végleges unit-only feltételeket az októberi cél felülírja; az érintett implementáció előtt célzott szerződésfrissítés szükséges a roadmap SZD2-0 kapuja szerint. Az eredeti biztonsági és elszámolási invariánsokat meg kell őrizni.

## Kanonikus források

| Terület | Source of truth |
|---|---|
| High-level szakdolgozati irány | [plan.md](plan.md) |
| Roadmap, státusz és evidence | [milestones.md](milestones.md) |
| Korábbi Core MVP és MVP+ acceptance criteria; SZD2-egyeztetés szükséges | [scope_contract.md](01_product/scope_contract.md) |
| Technikai döntések | [ADR-index](02_architecture/adr/README.md) |
| API-szerződés | [api.md](03_design/api.md) |
| Adatmodell és lifecycle | [data_model.md](03_design/data_model.md) |
| Hibaszerződés | [error_handling.md](03_design/error_handling.md) |
| Pillér–story–interface–teszt kapcsolat | [traceability.md](03_design/traceability.md) |
| AI-asszisztált fejlesztés evidence | [AI Manifest](07_ai/ai_manifest.md), [Prompt Log](07_ai/prompt_log.md), [Verification Log](07_ai/verification_log.md) |

## Dokumentumtérkép és állapot

| Terület | Tartalom | Státusz |
|---|---|---|
| [01_product](01_product/README.md) | Vision, scope, capability, metrics és UX | Metrics frissítve; a többi részletes szerződés célzottan egyeztetendő |
| [02_architecture](02_architecture/README.md) | C4, quality attributes és ADR-001–ADR-012 | Korábbi baseline, import/processing/derived-kvóta egyeztetendő |
| [03_design](03_design/README.md) | API, adatmodell, lifecycle, error és traceability | Korábbi baseline, import/processing szerződésekkel bővítendő |
| [04_quality](04_quality/README.md) | Unit-first stratégia és őszinte teszt baseline | Jest/Vitest unit runnerek; tényleges eredmények a tesztriportban |
| [05_security_ops](05_security_ops/README.md) | Threat, privacy, planned runbook és observability | Health/request ID/error alap implementált; további kontrollok tervezettek |
| [06_release](06_release/README.md) | Demo, release notes és self-assessment | Placeholder a futtatható termékig |
| [07_ai](07_ai/ai_manifest.md) | AI-eszközök, promptok és verifikáció | Aktív történeti evidence |

## Product dokumentumok

- [Termékvízió](01_product/vision.md)
- [Core MVP scope contract](01_product/scope_contract.md)
- [Capability map](01_product/capability_map.md)
- [Termékmetrikák](01_product/metrics.md)
- [Fő UX-folyamatok](01_product/ux_flows.md)

A korábbi termékdokumentumok Core MVP/MVP+/Later felosztása célzottan frissítendő:

- **Kötelező SZD2 cél:** a hat storage user story mellett folytatható képköteg-import, két képfeldolgozó, restart recovery és reprodukálható bizonyítás.
- **MVP+:** opcionális, kép-only, human-in-the-loop MI-metaadat-javaslat.
- **Későbbi bővítések:** nagyvideós multipart a képimporton túl, cloud, transzkódolás és offline előkészítés.
- **Külön minőségi fázis:** integration/contract/e2e és CI tervezett, engedélyezési kapuval; a végső rubric alkalmazása egyeztetendő.

## Architektúra és döntések

- [C4 Context](02_architecture/c4_context.md)
- [C4 Container](02_architecture/c4_container.md)
- [C4 Component](02_architecture/c4_component.md)
- [Quality Attributes](02_architecture/quality_attributes.md)
- [ADR-index](02_architecture/adr/README.md)

Az alkalmazásba tervezett MI-funkció és az AI-asszisztált fejlesztés külön fogalom. A termék-MI az ADR-012 szerinti opcionális MVP+ képesség; a fejlesztési AI bizonyítékai a `07_ai` területen maradnak.

## Design, quality és security

- [API contract](03_design/api.md)
- [Data model és state machine](03_design/data_model.md)
- [Error handling](03_design/error_handling.md)
- [Traceability matrix](03_design/traceability.md)
- [Test strategy](04_quality/test_strategy.md)
- [Test report baseline](04_quality/test_report.md)
- [Threat model](05_security_ops/threat_model.md)
- [Privacy és licensing](05_security_ops/privacy_licensing.md)
- [Planned runbook](05_security_ops/runbook.md)
- [Observability: implementált alap és terv](05_security_ops/observability.md)

## Státuszszabály

- „Accepted” ADR tervezési döntést jelent, nem implementációt.
- „Planned” API vagy entitás nem állítható futó contractnak.
- Test report csak ténylegesen futtatott parancsot és eredményt nevezhet PASS-nak.
- Quickstart csak kipróbált parancsot tartalmazhat.
- Minden fontos AI-asszisztált változás append-only Prompt Log és Verification Log bejegyzést kap.
