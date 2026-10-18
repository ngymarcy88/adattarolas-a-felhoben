# Dokumentációs index

## Repository státusz

A repository jelenleg **dokumentáció-only tervezési állapotban** van. Nincs futtatható alkalmazás, Prisma schema, Docker Compose, package manifest, teszt runner vagy CI/CD. A dokumentumok tervezett célállapotot írnak le, nem implementált funkcionalitást igazolnak.

## Kanonikus források

| Terület | Source of truth |
|---|---|
| High-level szakdolgozati irány | [plan.md](plan.md) |
| Roadmap, státusz és evidence | [milestones.md](milestones.md) |
| Core MVP és MVP+ acceptance criteria | [scope_contract.md](01_product/scope_contract.md) |
| Technikai döntések | [ADR-index](02_architecture/adr/README.md) |
| API-szerződés | [api.md](03_design/api.md) |
| Adatmodell és lifecycle | [data_model.md](03_design/data_model.md) |
| Hibaszerződés | [error_handling.md](03_design/error_handling.md) |
| Pillér–story–interface–teszt kapcsolat | [traceability.md](03_design/traceability.md) |
| AI-asszisztált fejlesztés evidence | [AI Manifest](07_ai/ai_manifest.md), [Prompt Log](07_ai/prompt_log.md), [Verification Log](07_ai/verification_log.md) |

## Dokumentumtérkép és állapot

| Terület | Tartalom | Státusz |
|---|---|---|
| [01_product](01_product/README.md) | Vision, scope, capability, metrics és UX | Aktív, tervezett szerződés |
| [02_architecture](02_architecture/README.md) | C4, quality attributes és ADR-001–ADR-012 | Aktív, tervezett architektúra |
| [03_design](03_design/README.md) | API, adatmodell, lifecycle, error és traceability | Aktív, tervezett interface contract |
| [04_quality](04_quality/README.md) | Unit-first stratégia és őszinte teszt baseline | Aktív terv; nincs test runner |
| [05_security_ops](05_security_ops/README.md) | Threat, privacy, planned runbook és observability | Aktív, tervezett kontrollok |
| [06_release](06_release/README.md) | Demo, release notes és self-assessment | Placeholder a futtatható termékig |
| [07_ai](07_ai/ai_manifest.md) | AI-eszközök, promptok és verifikáció | Aktív történeti evidence |

## Product dokumentumok

- [Termékvízió](01_product/vision.md)
- [Core MVP scope contract](01_product/scope_contract.md)
- [Capability map](01_product/capability_map.md)
- [Termékmetrikák](01_product/metrics.md)
- [Fő UX-folyamatok](01_product/ux_flows.md)

A termékdokumentumok három fázist használnak:

- **Core MVP:** a hat kötelező storage user story és keresztmetszeti productization képességeik.
- **MVP+:** opcionális, kép-only, human-in-the-loop MI-metaadat-javaslat.
- **Later:** purge worker, multipart, cloud, integration/e2e, CI/CD és további bővítések.

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
- [Planned observability](05_security_ops/observability.md)

## Státuszszabály

- „Accepted” ADR tervezési döntést jelent, nem implementációt.
- „Planned” API vagy entitás nem állítható futó contractnak.
- Test report csak ténylegesen futtatott parancsot és eredményt nevezhet PASS-nak.
- Quickstart csak kipróbált parancsot tartalmazhat.
- Minden fontos AI-asszisztált változás append-only Prompt Log és Verification Log bejegyzést kap.
