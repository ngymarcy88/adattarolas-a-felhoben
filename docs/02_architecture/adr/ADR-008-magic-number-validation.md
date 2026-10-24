# ADR-008: Magic-number based post-upload validation

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

A confirm méret-/signature-validációja implementált, legfeljebb 16 bájtos feltételes range-olvasással; teljes képdekóder nincs.

## Context

A fájlkiterjesztés és a browser által megadott `Content-Type` manipulálható. Presigned PUT esetén a bináris adat nem halad át a backenden, ezért a tényleges típusellenőrzést a feltöltés után, de az aktiválás előtt kell elvégezni.

## Decision

A validáció kétlépcsős:

1. Initkor deklarált méret, fájlnév, MIME allowlist és kvóta ellenőrzése.
2. Confirmkor storage `HEAD` a tényleges mérethez, majd korlátozott byte-range olvasás a magic-number detektáláshoz.

A későbbi implementáció `file-type` vagy azzal egyenértékű, karbantartott könyvtárat használhat. A range mérete a választott detektor dokumentált minimumához igazodik, de nem tölti le a teljes fájlt.

Csak dokumentált kép- és videótípus aktiválható. A deklarált és detektált típus eltérése, ismeretlen/hiányos signature vagy méreteltérés validation failure. A magic-number detektálás nem teljes képdekódolás, nem bizonyít minden sérülésmentességet és nem malware-vizsgálat; a későbbi processor dekódolási hibáját külön kell kezelni. HTML, SVG, JavaScript és XML nem engedélyezett inline tartalom.

Invalid objektum cleanupot igényel. A reservation csak akkor oldható fel, ha az objektum bizonyítottan nem létezik vagy sikeresen törölve lett, és az API újabb storage-kapuja szerint korábban kiadott/in-flight PUT-ból sem keletkezhet később újra.

## Alternatives considered

- Csak kiterjesztés vagy frontend validáció: könnyen manipulálható.
- Csak object metadata `Content-Type`: ugyanúgy kliens által befolyásolható.
- Teljes objektum letöltése confirmkor: erősebb ellenőrzési lehetőség, de indokolatlan memória-, hálózat- és latency-költség.
- Minden fájl attachmentként: csökkenti az inline kockázatot, de nem teljesíti a média-preview célt.

## Consequences

- A confirm több storage műveletet végez, de a fájl csak ellenőrzés után lesz aktív.
- A bounded read korlátozza a backend terhelését.
- A `mimeType` és `detectedMimeType` külön metadata marad.
- A checksum nem tekinthető igazoltnak pusztán az S3 ETag alapján; külön end-to-end checksum későbbi döntés.

## Verification

- Unit tesztek valódi támogatott signature-ökre, MIME-eltérésre, unknown/HTML/SVG mintára és rövid/corrupt bufferre.
- Unit teszt HEAD méreteltérésre és range-read/storage hibára.
- Security review ellenőrzi az inline allowlistet és a safe `Content-Disposition` logikát.

A 2026-10-20-i első [képfeltöltési API](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) csak JPEG/PNG/WebP/GIF típusokra szűkíti ezt a lépést; video későbbi Core-szelet. A HEAD és bounded read ugyanazt a változatlan objektumot vizsgálja, a korábban kiadott PUT-jog aktívvá tétel után sem írhatja át. A storage-védelem és a detektor konkrét byte-korlátja külön implementáció előtti döntés/ellenőrzés.

## Implementált első detektor – 2026-10-24

Az első négy képtípushoz tiszta, függőség nélküli, 16 bájtos prefixosztályozó készült: JPEG FF D8 FF, PNG teljes 8 bájtos signature, GIF87a/GIF89a, WebP RIFF + WEBP + VP8/VP8L/VP8X FourCC. Az adapter az ETag-hez kötött range-ből legfeljebb 16 bájtot ad át. Tetszőleges fájltípus-parser vagy dekóder helyett ez a szűk döntés a meglévő CommonJS/Jest környezetet és négyformátumos scope-ot szolgálja, új csomag nélkül.

A minősítés csak a signature-t igazolja, nem a teljes formátumot, CRC-t, dekódolhatóságot, malware-mentességet vagy minden polyglot hiányát. A későbbi képfeldolgozó dekódolása külön hibaág; initkor a MIME továbbra is csak deklaráció. Elsődleges formátumforrások: [PNG signature](https://www.w3.org/TR/png-3/#5PNG-file-signature), [GIF specifikáció](https://www.w3.org/Graphics/GIF/spec-gif89a.txt), [WebP konténer](https://developers.google.com/speed/webp/docs/riff_container).
