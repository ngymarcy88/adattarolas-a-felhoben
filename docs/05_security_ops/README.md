# Security és operations dokumentumok

## Státusz

**Tervezett állapot – nem implementált funkcionalitás.**

Ez a terület a tervezett security, privacy és üzemeltetési kontrollokat rögzíti. Nincs futó rendszer, production adat, deployment vagy monitoring stack.

## Dokumentumok

- [Threat model](threat_model.md): eszközök, trust boundary-k, fenyegetések és tervezett mitigációk.
- [Privacy és licensing](privacy_licensing.md): adatminimalizálás, retention, harmadik felek és dependency go/no-go.
- [Runbook](runbook.md): tervezett incidensforgatókönyvek és biztonságos reagálás.
- [Observability](observability.md): tervezett log, metrika, health és redaction szerződés.

## Placeholder

A `deploy_runbook.md` csak a Docker Compose és futtatható alkalmazás tényleges elkészülte után hozható létre hiteles parancsokkal. A jelenlegi dokumentáció nem állít deployolható környezetet.

## Közös tiltások

Nem kerülhet logba, auditba vagy promptba jelszó, password hash, JWT, raw share token, presigned URL, storage credential, fájltartalom, nyers MI-input/output vagy szükségtelen személyes adat.
