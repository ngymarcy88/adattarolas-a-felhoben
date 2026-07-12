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

### 2026-07-12 dokumentációs rebaseline

Az SZD2 rebaseline a Codex desktop környezetben, elsődleges ágenssel és felelősség szerint szétválasztott product/design/security review alágensekkel készült. A futás pontos desktop kliensverziója és deployment modell-snapshotja nem volt külön bizonyítható a task felületén, ezért ezeket nem következtetjük ki és nem írjuk felül utólag egy aktuális verzióval.

## Felhasználási területek

- Tervezés: mérföldkövek, scope és dokumentációs szerkezet finomítása.
- Dokumentáció: README, indexek, AI naplók és későbbi ADR-ek vázlata.
- Kód: későbbi scaffold, backend/frontend modulok és tesztek előkészítése.
- Debug és verifikáció: hibaokok keresése, tesztesetek és ellenőrzési lépések javaslata.
- Független review: GitHub Copilot a változások ellenőrzésére, Gemini a terv felülvizsgálatára.

## Két külön AI-fogalom a projektben

### AI-asszisztált fejlesztés

Ez a manifest, a Prompt Log és a Verification Log a szakdolgozat elkészítéséhez használt AI-eszközöket, azok outputját és az emberi ellenőrzést dokumentálja. Ezek az eszközök nem részei a CloudVault futásidejű architektúrájának.

### Opcionális alkalmazásbeli MI-képesség

A tervezett `MVP+` kép-metaadat-javaslat külön termékfunkció. Első körben csak aktív képnél, explicit felhasználói indítással adhat címke- és leírásjavaslatot. A felhasználó elfogadja, szerkeszti vagy elutasítja az eredményt; providerhiba nem akadályozhat core storage műveletet.

Ehhez a funkcióhoz jelenleg nincs kiválasztott provider, modell, dependency vagy feldolgozási queue. Implementáció előtt külön privacy-, licensing- és dependency-jóváhagyás szükséges. Arcfelismerés, biometria és érzékeny tulajdonság következtetése tiltott.

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
| Opcionális termék-MI | Providerhatár, hibafolyamat és tesztesetek javaslata | Külön ADR, threat/privacy review, human-in-the-loop tesztek és explicit implementációs jóváhagyás. |

## Fő kockázatok

- Hallucináció: az AI olyan technikai részletet állít, amely nincs implementálva.
- Hibás security tanács: egy látszólag kényelmes megoldás gyengíti az adatvédelmet.
- Licenc vagy forrás kockázat: nem tisztázott eredetű kód vagy szöveg kerülne be.
- Scope creep: az AI túl nagy feature-listát javasol a szakdolgozati MVP-hez.
- Fogalmi összemosás: az AI-asszisztált fejlesztés és a futásidejű MI-funkció evidence-e összekeveredhet.

## Kezelés

- Minden fontos AI-javaslat a [Prompt Log](prompt_log.md) dokumentumba kerül.
- A kockázatos vagy termékminőségi állítások a [Verification Log](verification_log.md) dokumentumban kapnak bizonyítékot.
- A végső döntéseket ADR-ek, tesztek és dokumentált futtatási eredmények támasztják alá.
- A product-AI státuszát minden dokumentum `MVP+` jelöléssel, a Core MVP-től elkülönítve kezeli.
