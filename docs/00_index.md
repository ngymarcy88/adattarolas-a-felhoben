# Dokumentációs index

Ez az index a szakdolgozói leadandó csomag Docs-as-Code belépési pontja. A dokumentáció magyar nyelvű, a kódbeli azonosítók, API nevek és konfigurációs kulcsok angolul szerepelnek.

## Aktív dokumentumok

- [High-level szakdolgozati terv](plan.md)
- [Mérföldkövek](milestones.md)
- [Termékvízió](01_product/vision.md)
- [MVP scope contract](01_product/scope_contract.md)
- [Capability map](01_product/capability_map.md)
- [Termékmetrikák](01_product/metrics.md)
- [Fő UX-folyamatok](01_product/ux_flows.md)
- [C4 Context](02_architecture/c4_context.md)
- [C4 Container](02_architecture/c4_container.md)
- [C4 Component](02_architecture/c4_component.md)
- [Quality Attributes](02_architecture/quality_attributes.md)
- [Architecture Decision Records](02_architecture/adr/README.md)
- [AI Manifest](07_ai/ai_manifest.md)
- [Prompt Log](07_ai/prompt_log.md)
- [Verification Log](07_ai/verification_log.md)

## Előkészített dokumentációs területek

- [01_product](01_product/README.md): elkészült vision, scope contract, capability map, metrics és UX flow-k.
- [02_architecture](02_architecture/README.md): C4 diagramok, quality attributes és ADR-ek.
- [03_design](03_design/README.md): API, adatmodell és hibakezelési szerződés.
- [04_quality](04_quality/README.md): tesztstratégia, teszt riport és minőségi kapuk.
- [05_security_ops](05_security_ops/README.md): threat model, privacy/licensing, deploy runbook és observability.
- [06_release](06_release/README.md): demo script, release notes és később önértékelés.
- [07_ai](07_ai/ai_manifest.md): AI-használat, promptok és verifikációk nyomon követése.

## Első mérföldkő definition of done

- A repo struktúrája áttekinthető.
- A `frontend/`, `backend/` és `docs/` alapmappák megvannak.
- A secret fájlok `.gitignore` által tiltottak.
- A `.env.example` csak placeholder értékeket tartalmaz.
- A projekt célja a root `README.md` fájlban röviden le van írva.
- A Codex számára van projekt-specifikus `AGENTS.md`.
- Az AI dokumentációs alapfájlok létrejöttek.

## Második mérföldkő dokumentációs eredménye

- Két célpersona és a termék értékajánlata rögzített.
- Hat MVP user story rendelkezik elfogadási kritériumokkal.
- Az MVP és a későbbi funkciók határa dokumentált.
- A value és productization képességek, a sikermetrikák és három fő UX-folyamat követhető.
- A leírt termékképességek továbbra is tervezett státuszúak, amíg későbbi mérföldkövek nem igazolják az implementációjukat.

## Harmadik mérföldkő dokumentációs eredménye

- Elkészült a C4 Context, Container és lightweight Component nézet.
- Rögzítve vannak a fő quality attribute-ok és azok későbbi verifikációs irányai.
- Kilenc Accepted státuszú ADR dokumentálja a fő technológiai és architekturális döntéseket.
- A dokumentumok továbbra sem állítanak futtatható alkalmazást; a scaffold, Docker Compose, Prisma schema és runtime API későbbi mérföldkő része.
