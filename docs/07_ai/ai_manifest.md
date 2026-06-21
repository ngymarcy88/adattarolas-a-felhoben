# AI Manifest

## Cél

Ez a dokumentum összefoglalja, hogyan használ AI-asszisztenst a projekt, és milyen emberi ellenőrzési szabályok védik a kódot, a dokumentációt és a szakdolgozati követelményeket.

## Használt eszközök

| Eszköz | Felhasználás | Megjegyzés |
|---|---|---|
| Codex / OpenAI asszisztens | repo-tervezés, dokumentációs váz, kódmódosítások előkészítése | A konkrét válaszokat emberi review és verifikáció követi. |

## Felhasználási területek

- Tervezés: mérföldkövek, scope és dokumentációs szerkezet finomítása.
- Dokumentáció: README, indexek, AI naplók és későbbi ADR-ek vázlata.
- Kód: későbbi scaffold, backend/frontend modulok és tesztek előkészítése.
- Debug és verifikáció: hibaokok keresése, tesztesetek és ellenőrzési lépések javaslata.

## Emberi ellenőrzés

- AI által javasolt döntés nem kerül át automatikusan a projektbe.
- Security, privacy, teljesítmény és jogi/licenc állításokat külön ellenőrizni kell.
- Generált kód csak review, futtatás és releváns teszt után tekinthető késznek.
- Dokumentáció nem állíthat olyat, ami a repo-ban vagy futtatásban nem bizonyítható.
- Promptokban nem szerepelhet valódi secret, token, jelszó vagy személyes adat.

## Kritikus döntési területek

| Terület | AI szerepe | Emberi döntés és verification |
|---|---|---|
| Technológiai stack | Alternatívák és tradeoffok gyűjtése | ADR-ben rögzítendő, teszttel vagy PoC-val ellenőrizve. |
| Storage biztonság | Kockázatok és mitigációk listázása | Threat model, security tesztek és verification log alapján. |
| Auth és jogosultság | Implementációs minták javaslata | Unit/integration tesztekkel és kód review-val ellenőrizve. |
| AI dokumentáció | Sablonok és naplózási forma javaslata | A hallgató ellenőrzi, hogy valós promptokra és eredményekre hivatkozik. |

## Fő kockázatok

- Hallucináció: az AI olyan technikai részletet állít, amely nincs implementálva.
- Hibás security tanács: egy látszólag kényelmes megoldás gyengíti az adatvédelmet.
- Licenc vagy forrás kockázat: nem tisztázott eredetű kód vagy szöveg kerülne be.
- Scope creep: az AI túl nagy feature-listát javasol a szakdolgozati MVP-hez.

## Kezelés

- Minden fontos AI-javaslat a [Prompt Log](prompt_log.md) dokumentumba kerül.
- A kockázatos vagy termékminőségi állítások a [Verification Log](verification_log.md) dokumentumban kapnak bizonyítékot.
- A végső döntéseket ADR-ek, tesztek és dokumentált futtatási eredmények támasztják alá.
