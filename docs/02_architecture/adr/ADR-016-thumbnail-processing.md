# ADR-016: Sharp thumbnail processor, durable jobs and derived accounting

## Status

Accepted – tervezési döntés; 2026-10-29.

## Implementation status

**Részben implementált alap:** a job/attempt/result Prisma-séma és külön additív migráció, majd a bounded eredetiolvasás és create-only derived írás adaptere elkészült (2026-10-29). Nincs Sharp-telepítés, lockfile-, worker-, API- vagy Compose-változás; jobindítás és könyvelő service sincs. A következő implementáció külön feladat. A második, image-metadata processor későbbi szelet; import-/resumable protokollt ez az ADR nem választ.

## Context

A jelenlegi galéria az eredeti JPEG/PNG/WebP/GIF képet használja. A confirm csak signature/méretellenőrzést végez, nem teljes dekódolást; a processor hibája nem érvénytelenítheti a sikeres feltöltést. Thumbnailhez közös processor-határ, tartós recovery és a valóban elfoglalt derived bájtok elszámolása kell. A storage adapter bounded teljes eredetiolvasása és backendoldali derived írása már implementált, de nem indít feldolgozást, és `writeClosureEvidence = unproven` értéke nem változik ettől a tervtől.

## Decision

**Sharp + libvips** legyen az első képfeldolgozó. A dokumentált input-/output-/resize-/orientációs API illeszkedik a négy meglévő képformátumhoz és a statikus WebP-kimenethez. Saját resize-kód vagy shellből összeállított konvertálóparancs helyett külön ThumbnailProcessor fogja körbe. Az aktuális támogatott kiadás pontos verzióját, bináris libvips/codec-verzióit és licencleltárát a későbbi telepítési PR rögzítse; `latest` nincs beégetve és nincs letöltés ebben a feladatban.

A projekt által választott v1-policy (nem upstream alapérték):

| Tulajdonság | Szerződés |
|---|---|
| Processor identity | `thumbnail`, `1.0.0`, output kind `thumbnail`; teljes szabálykészlet változása új verzió |
| Bemenet | Saját ACTIVE eredeti; egyező deklarált/detektált JPEG/PNG/WebP/GIF és aktuális konfiguráció metszete; a tényleges decoder-format is ellenőrzendő |
| Animáció | GIF/animált WebP/APNG esetén csak a 0. frame statikus képe, egy oldal (`page: 0`, `pages: 1`, nem animated); nincs animált thumbnail vagy teljes animáció-validálási ígéret |
| Geometria | EXIF auto-orient és tükrözés után maximum 512×512, `fit: inside`, aránytartó, crop/padding és felnagyítás nélkül; pozitív egész kimeneti méret, legfeljebb egy pixel kerekítési eltérés |
| Kimenet | Egy `image/webp`, quality 80, alphaQuality 100, effort 4; átlátszóság megmarad, sRGB; nincs adaptive quality retry |
| Privacy | EXIF/GPS/XMP/IPTC/eredeti ICC és egyéb bemeneti metadata eltávolítandó; nincs keepMetadata/withMetadata. Orientációt előbb a pixelekre kell alkalmazni |
| Input-korlát | 1–33554432 bájt (32 MiB), legfeljebb 40000000 pixel az egy kiválasztott frame-en, szélesség/magasság legfeljebb 20000, legfeljebb 4 bemeneti csatorna; hibás header/decoder-warning elutasított |
| Output-korlát | 1–524288 bájt (512 KiB), validált WebP/pozitív méret/maximum512 és SHA-256; túl nagy eredmény nem kerül storage-ba |

Az upload jelenlegi 100 MiB limitje változatlan: egy egyébként érvényes, de 32 MiB-nál nagyobb eredeti marad ACTIVE és előnézhető, thumbnailje `FAILED / PROCESSOR_INPUT_LIMIT`. Nem bővítjük az allowlistet a könyvtár által egyébként olvasható SVG/HTML/TIFF/AVIF/PDF stb. formátumokra. Bufferes input és explicit decoder-allowlist szükséges; nincs felhasználói URL/path, hálózati betöltés vagy tetszőleges libvips operation. A codec-azonosítók a telepített builddel tesztelendők.

### Végrehajtási és erőforráshatár

Egyszerű PostgreSQL-jobtábla és az alkalmazás közös backend-kódjából futó **worker szerep**, broker/Redis nélkül. A tervezett worker ugyanazt a backend image-et használja külön, limitált lokális Compose-szolgáltatásként; nem új microservice-kódbázis. Ezzel a decoder OOM nem a HTTP API processzét öli meg. A workerben egyszerre egy job és egy külön decoder child process futhat; a gyermek nem kap DB/storage credentialt, a bináris IPC korlátozott. `sharp.concurrency(1)` és letiltott feldolgozási cache; ezek nem hard memóriakorlátok.

Központilag validálandó v1-futási limitek: worker cgroup 512 MiB RAM, 1 CPU, legfeljebb64 processz; gyermek V8 heap128 MiB (a natív memória ezen felül a cgroupba számít). Sharp processing timeout10s; szülőből mért teljes decoder wall-time15s, határnál kill és kilépés megvárása. A Sharp timeout nem tartalmaz minden várakozást. Storage GET/PUT/HEAD egyenként10s, teljes job-attempt60s; nincs rejtett SDK-write-retry. Worker poll2s, claim lease90s, heartbeat15s, DB-idő az autoritatív. A pixel/headerlimitek, timeout, Promise.race vagy Node heapflag önmagukban nem memóriavédelem; a limitált worker indítás és OOM/restart próba implementációs kapu. Ezek tervezett értékek, nem mért teljesítményígéretek; változtatásuknál az outputot érintő policy verziózandó.

### Tartósság és könyvelés

A kanonikus [adatmodell](../../03_design/data_model.md#első-thumbnail-processor--tervezett-szerződés-2026-10-29) határozza meg a job/attempt/result állapotokat. Confirm commitban egyszer kerül sorba az új job; nem processzmemóriabeli event az egyetlen indító. A tiszta processor csak bájtokat és kis, allowlistelt eredményadatot ad, DB/S3 nélkül.

Minden írási próbálkozás saját, soha újra nem használt create-only kulcsot kap. Előbb korlátozott memóriában elkészül az output, majd **pontos R bájtos** user-foglalás commitol az első PUT előtt. Publikáláskor egyetlen tranzakcióban result + job-siker + reserved−R/used+R. Ismétlés ugyanazt a logikai eredményt adja. Régi fence nem publikálhat, de már elküldött storage-írást nem állít meg. Bizonytalan attempt foglalása külön megmarad; új attempt külön kvótát igényel. Lehet ideiglenesen több, teljesen foglalt fizikai candidate, de csak egy publikált thumbnail és egy sikeres könyvelés van. A rendszer nem ígér exactly-once deliveryt vagy nulla átmeneti árvát.

**Nyitott proof-kapu:** sem lease-lejárat, workerhalál, timeout, HEAD404, sem DELETE200 nem igazolja az összes késői írás végét. A derived cleanup csak attempthez kötött igazolt write closure ÉS igazolt hiány/törlés után oldhat foglalást. A jelenlegi adapter ezt nem bizonyítja; `CLEANUP_BLOCKED` és foglalásmegtartás az elvárt biztonságos állapot. A sikeres output feldolgozása és az ambiguous-write teljes felszabadítása külön ellenőrzendő képesség. A proof konkrét provider/adapter megoldását implementáció előtt külön kell igazolni, nem helyettesíthető egy timestamp kézi kitöltésével.

## Alternatives considered

- Jimp: JavaScript-alapú alternatíva; az official alapformátumlistában nincs WebP. A szükséges bővítések és codec-viselkedés további ellenőrzést igényelne; most nem választjuk. Nincs saját összehasonlító benchmark.
- ImageMagick/GraphicsMagick CLI: használható külön folyamat, de külön telepítési, parancsparaméterezési és codec-policy felületet hozna; ebben a Node-stackben a Sharp wrapper kisebb integráció.
- Browseroldali resize: UX-optimalizálás lehet, de nem megbízható szerveres validáció, verziózott tartós eredmény vagy restart recovery.
- Külső image/queue platform: ehhez a szelethez szükségtelen új szolgáltatás és adatátadási határ.
- Eredeti képet tartjuk kártyaként: ma ez működik, de nem teljesít processor-követelményt.

## Consequences

Egységes kis kimenet, eredeti-preview fallback és később külön metadata-processor ugyanazon interfészen. Natív dependency/codec-karbantartás, extra worker-erőforrás és a user kvótájából számolt derived bájtok szükségesek. Full kvótánál az eredeti upload sikeres marad, thumbnail `BLOCKED_QUOTA`; ez látható állapot, nem ingyenes szolgáltatói tárhely. Worker/codec hibák elkülönülnek az eredeti fájltól. A korábbi thumbnail-Later scope-feltételt ez a tervezett szelet felülvizsgálja, a jelenlegi runtime-ra nem állít új képességet.

## Verification

**Még nem futtatott kapuk:** root lockfile-os, pontos Sharp-verzió telepítése Linux/WSL és Debian-image környezetben; négy formátum, animation-first-frame, EXIF/tükör, alpha, sRGB/metadata-stripping és határok unit fixture-ekkel; natív codec-allowlist; tényleges worker memory/time/OOM-korlát; atomikus confirm/job, duplicate/retry/fence és candidate accounting unitok; később engedélyezett DB/storage/browser/restart próbák. A test strategy tartalmazza az elvárt eseteket. Ez a dokumentáció nem futási PASS és nem dependency-telepítési engedély.

## Sources

Ellenőrizve: 2026-10-29. Az upstream képességek forrásai; a fenti limitek saját projektválasztások:

- [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/): formátumok, frame/page és input-korlátok.
- [Sharp resize](https://sharp.pixelplumbing.com/api-resize/), [autoOrient](https://sharp.pixelplumbing.com/api-operation/#autoorient), [output](https://sharp.pixelplumbing.com/api-output/): képműveletek és metadata alapviselkedés.
- [Sharp security](https://sharp.pixelplumbing.com/security/), [utility](https://sharp.pixelplumbing.com/api-utility/): decoder-policy és OS-erőforrásvédelem.
- [Sharp installation](https://sharp.pixelplumbing.com/install/): Node-API, Linux binárisok és platformfüggő lockfile-kockázat. A repo Node22/Debian célja dokumentáció alapján kompatibilis; telepítés még nincs igazolva.
- [Sharp LICENSE](https://github.com/lovell/sharp/blob/main/LICENSE): Apache-2.0; [libvips](https://www.libvips.org/): LGPL-2.1-or-later. A tranzitív codec licenceket a konkrét csomagnál leltározni kell.
- [Jimp](https://jimp-dev.github.io/jimp/): alternatíva formátumlistája.
