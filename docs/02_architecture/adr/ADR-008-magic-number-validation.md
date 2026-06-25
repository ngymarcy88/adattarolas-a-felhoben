# ADR-008: Magic number based file validation

## Status

Accepted

## Date

2026-06-25

## Context

A feltoltott fajlok tipusa nem biztonsagosan dontheto el fajlkiterjesztes vagy browser altal kuldott `Content-Type` alapjan. A rendszer kepeket es videokat enged, de veszelyes vagy ismeretlen tartalmat nem szabad inline megjelenitesre engedni.

## Decision

Az MVP fajlvalidacioja meretlimitet, dokumentalt MIME allowlistet es magic number alapu ellenorzest hasznal. A `file-type` vagy hasonlo konyvtar hasznalhato a tenyleges tipus felismeresehez. HTML, SVG, JavaScript, XML es ismeretlen binaris tartalom nem lehet inline preview-ra engedelyezett.

## Alternatives considered

- Csak fajlkiterjesztes ellenorzese: konnyen manipulalhato.
- Csak frontend validacio: javitja a UX-et, de biztonsagi dontesre nem alkalmas.
- Minden fajl engedelyezese attachmentkent: egyszerubb, de nem teljesiti a kep/video preview MVP celjat.

## Consequences

- A backend validacio osszetettebb, de jobban ved manipulalt feltoltesek es XSS kockazatok ellen.
- A frontend elozetes validaciot adhat UX celbol, de a backend marad az igazsagforras.
- A `detectedMimeType` es a browser altal kuldott MIME elterhet; ezt dokumentalni es kezelni kell.
- Biztonsagos `Content-Disposition` szabalyokra lesz szukseg preview es download flow-ban.

## Verification

- Unit tesztek fedik a tul nagy, nem tamogatott, magic number alapjan eltero es ismeretlen fajlokat.
- Security review ellenorzi az inline preview allowlistet.
- API es data model dokumentacio a kesobbi implementacio utan rogziti a validacios mezoket es hibakodokat.
