# ADR-012: Optional human-in-the-loop AI metadata suggestions

**Tervezett állapot – nem implementált funkcionalitás.**

## Status

Accepted

## Date

2026-07-12

## Implementation status

Opcionális MVP+ irány; nincs kiválasztott provider, dependency vagy implementáció.

## Context

A média rendszerezését segítheti MI-alapú címke- és leírásjavaslat, de a cloud-storage rendszer elsődleges értékét és megbízhatóságát nem teheti külső MI-szolgáltatástól függővé. A képek külső providerhez továbbítása privacy, költség, retention és vendor-lock-in kockázatot jelent.

## Decision

Az MI-metaadat-javaslat külön MVP+ modul:

- csak stabil Core MVP után kezdhető;
- első körben csak aktív képre és explicit felhasználói indítással;
- provider interface és cserélhető adapter mögött működik;
- külön `AiMetadataSuggestion` entitást használ provenance és státusz tárolására;
- a user elfogadhatja, szerkesztheti vagy elutasíthatja a javaslatot;
- a suggestion nem válik automatikusan kanonikus címkévé;
- providerhiba nem akadályoz core storage műveletet;
- arcfelismerés, biometria és érzékeny tulajdonság következtetése tiltott;
- raw média, presigned URL és nyers provider-válasz nem logolható.

A konkrét provider, modell, queue és feldolgozási topológia nincs elfogadva; implementáció előtt külön privacy és dependency go/no-go döntés szükséges.

## Alternatives considered

- MI-funkció a Core MVP-ben: növelné a szakdolgozati scope- és providerkockázatot.
- Automatikus feldolgozás minden uploadnál: adatvédelmi, költség- és fallback-kockázatot okozna.
- Provider-specifikus hívások a files modulban: erős vendor lock-in és rossz tesztelhetőség.
- Javaslat automatikus elfogadása: megszüntetné az emberi kontrollt és hibás metaadatot rögzíthetne.

## Consequences

- A Core MVP MI nélkül teljes értékű marad.
- A user kontrollálja, mikor kerül kép elemzésre és mely metadata válik elfogadottá.
- Külön adatkezelési tájékoztatás, retention döntés és provider licencreview szükséges.
- Az adapter könnyíti a mockolást és a provider későbbi cseréjét.
- A background queue továbbra is nyitott implementációs döntés.

## Verification

- Unit teszt: csak owner és aktív kép indíthat suggestiont.
- Unit teszt: `PENDING`, `READY`, `ACCEPTED`, `REJECTED`, `FAILED` átmenetek.
- Unit teszt: provider failure mellett minden core file use case változatlanul működik.
- Privacy review igazolja a tiltott biometrikus/szenzitív use case-ek kizárását és a minimális logolást.
