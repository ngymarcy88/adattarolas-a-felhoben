# ADR-011: Idempotent upload confirmation and quota reservation

**Tervezett állapot – nem implementált funkcionalitás.**

## Status

Accepted

## Date

2026-07-12

## Implementation status

Nincs upload service vagy adatbázisséma.

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
