# Dokumentációs index

Ez az index a szakdolgozói leadandó csomag Docs-as-Code belépési pontja. A dokumentáció magyar nyelvű, a kódbeli azonosítók, API nevek és konfigurációs kulcsok angolul szerepelnek.

## Aktív dokumentumok

- [High-level szakdolgozati terv](plan.md)
- [Mérföldkövek](milestones.md)
- [AI Manifest](07_ai/ai_manifest.md)
- [Prompt Log](07_ai/prompt_log.md)
- [Verification Log](07_ai/verification_log.md)

## Előkészített dokumentációs területek

- [01_product](01_product/README.md): vision, scope contract, capability map, metrics és UX flow-k.
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
