# AI Manifest

## Cél

Ez a dokumentum összefoglalja, hogyan használ AI-asszisztenst a projekt, és milyen emberi ellenőrzési szabályok védik a kódot, a dokumentációt és a szakdolgozati követelményeket.

## Használt eszközök

Az alábbi verzióadatok 2026-06-21-i állapotot rögzítenek. A modell nevét csak akkor tüntetjük fel konkrétan, ha az a használatkor bizonyítható volt; egy szolgáltatás jelenleg elérhető modellje nem bizonyítja, hogy egy korábbi review pontosan azzal futott.

| Eszköz | Szerep | Kliens- vagy termékverzió | Használt modell | Verification / megjegyzés |
|---|---|---|---|---|
| OpenAI Codex agent | Elsődleges implementációs és dokumentációs ágens | `codex-cli 0.142.0-alpha.1`; telepített OpenAI VS Code extension: `26.5616.51431` | GPT-5 modellcsalád; a pontos deployment snapshot nem látható | A kliensverziók lokálisan ellenőrizve `codex --version`, illetve a VS Code `extensions.json` alapján. Minden változást emberi review és verifikáció követ. |
| GitHub Copilot Chat | Független review | Telepített VS Code komponens: `0.53.1` | A review-kor használt konkrét modell nem lett rögzítve | A verzió a telepített `copilot/package.json` alapján ellenőrizve. A Copilot több választható modellt támogat, ezért utólag nem rendelünk hozzá feltételezett modellt. |
| Google Gemini | Terv független felülvizsgálata | Használt felület/verzió nem lett rögzítve | A review-kor használt konkrét Gemini modell nem lett rögzítve | A korábbi használat tényét a hallgató erősítette meg. A következő használattól a felületet és a modell címkéjét a Prompt Logban is rögzíteni kell. |

Az eszköz- és modellverziókat használati eseményenként kell rögzíteni. A korábbi bejegyzéseket nem szabad egy később megjelent „aktuális” modell nevével felülírni.

## Felhasználási területek

- Tervezés: mérföldkövek, scope és dokumentációs szerkezet finomítása.
- Dokumentáció: README, indexek, AI naplók és későbbi ADR-ek vázlata.
- Kód: későbbi scaffold, backend/frontend modulok és tesztek előkészítése.
- Debug és verifikáció: hibaokok keresése, tesztesetek és ellenőrzési lépések javaslata.
- Független review: GitHub Copilot a változások ellenőrzésére, Gemini a terv felülvizsgálatára.

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
