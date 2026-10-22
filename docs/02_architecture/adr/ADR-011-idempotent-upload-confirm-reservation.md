# ADR-011: Idempotent upload confirmation and quota reservation

**Tervezett állapot – nem implementált funkcionalitás.**

## Status

Accepted

## Date

2026-07-12

## Implementation status

A kezdeti User/FileObject séma és migráció létezik, de nincs upload service/végpont. Init-dedupe receipt, terminális műveletlezárás és import/processor tárolás nincs a kezdeti sémában.

## Context

Presigned feltöltésnél az init és a bináris upload között idő telik el. Párhuzamos init kérések túlléphetik a kvótát, a kliens megismételheti a confirmot, az invalid vagy abandoned object pedig metadata- és storage-inkonzisztenciát okozhat.

## Decision

- Init tranzakcióban `PENDING_UPLOAD` rekord és `reservedStorageBytes` foglalás készül.
- A pending rekord a presigned URL lejárata után rövid confirm-grace idővel rendelkezik.
- Confirm csak a tulajdonos pending fájljára fut, és `HEAD` + bounded range validationt végez.
- Az első sikeres confirm tranzakcióban `ACTIVE` állapotot állít, csökkenti a reservationt és növeli a used számlálót.
- Aktív fájl ismételt confirmja sikeres, ugyanazt a reprezentációt adó no-op; számláló nem változik.
- Lejárt pending rekord objektum nélkül eltávolítható és felszabadítható.
- Invalid vagy abandoned objektum esetén delete szükséges; delete-hibánál a rekord és reservation retry-ig megmarad.
- A cleanup végrehajtási technológiája nincs most kiválasztva; az üzleti szabály technológiafüggetlen.

## Alternatives considered

- Reservation nélkül csak confirmkor kvótaellenőrzés: párhuzamos feltöltések rossz UX-et és felesleges storage-adatot okozhatnak.
- Minden initkor pending rekordok `SUM` lekérdezése: csökkenti a számlálók számát, de concurrency kezelése kevésbé egyértelmű.
- Nem idempotens confirm: egyszerűbb, de retry esetén dupla accounting kockázat.
- Azonnali reservation release cleanup-hibánál: kvóta-megkerülésre és árva objektumokra adna lehetőséget.

## Consequences

- A kvóta pending uploadokra is konzisztensen érvényesíthető.
- Cleanup-hiba ideiglenesen foglalhat tárhelyet; ezt megfigyelhetővé és retry-képessé kell tenni.
- Az állapot- és számlálómódosításokat egy tranzakcióban kell végrehajtani.
- Későbbi reconciliation szükséges lehet drift és operációs hiba esetére.

## Verification

- Unit teszt konkurens init, limit boundary és rollback esetére.
- Unit teszt ismételt, párhuzamos és lejárt confirmra.
- Unit teszt object-not-found, invalid type, cleanup success/failure és counter invariánsokra.

## Első képszelet kiegészítése – 2026-10-20

Az [API-szerződés](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) az initet is idempotenssé teszi: kötelező ownerhez és init művelethez kötött UUIDv4 kulcs, normalizált payload-azonosság, konfliktusnál 409. A dedupe, a kvótafeltétel, pending létrehozás és foglalás ugyanazon DB-tranzakció invariánsai. A presign előkészítése után csak sikeres commitra adható ki URL; ismeretlen commit-kimenetel ugyanazzal a kulccsal tisztázható. A sikeres művelet tartós azonossága legalább 24 óráig, és minden nyitott upload-jog/írás/cleanup lezárásáig megmarad. Pontos entitások/migrációk külön adatmodell-feladatban készülnek.

Replay nem hosszabbítja meg az 5 perces PUT-jogot vagy 15 perces confirm-ablakot; aktív fájl nem kap új PUT-jogot. Confirm végső tranzakciójában is pending és `now < confirmBy` feltétel szükséges. Saját ACTIVE no-op, SOFT_DELETED nem reaktiválható. Konkurens confirmokból csak egy mozgathatja a reserved bájtokat a used számlálóba; a cleanup előbb kizárja az aktiválást.

A korábbi object-not-found/delete utáni release szabály **szükséges, de nem elégséges**: ki kell zárni, hogy korábban kiadott PUT később objektumot hozzon létre. Élő jog, in-flight írás vagy ennek bizonytalansága esetén a foglalás megmarad. A storage-oldali íráslezárás és az aktív objektum felülírásának kizárása az adapter implementáció előtti kapuja. A kliensnek adott 410/413/422 nem állít automatikusan sikeres cleanupot vagy már felszabadult kvótát.
