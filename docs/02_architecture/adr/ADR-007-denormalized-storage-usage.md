# ADR-007: Denormalized storage usage and reservation counters

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

Az init reserved-foglalása és az idempotens confirm reserved→used könyvelése implementált, user-szintű zárolással. A cleanup release kódja proof-függő: a jelenlegi adapter nem igazolja a writesClosedAt-ot, így valós pending-release továbbra sincs.

## Context

A dashboardnak gyorsan kell visszaadnia a tartósan foglalt tárhelyet, miközben párhuzamos pending uploadok nem léphetik túl a kvótát. Egyetlen `usedStorageBytes` számláló nem különíti el az aktív objektumot és a rövid ideig lefoglalt, még nem confirmált méretet.

## Decision

A `User` két denormalizált számlálót kap:

- `usedStorageBytes`: sikeresen aktívvá tett és még fizikailag létező objektumok mérete;
- `reservedStorageBytes`: pending uploadok ideiglenesen lefoglalt deklarált mérete.

Initkor tranzakció ellenőrzi, hogy `used + reserved + requested <= storageLimitBytes`, majd növeli a reservationt. Sikeres confirm pontosan egyszer csökkenti a reservationt és növeli a used értéket. Bizonyítottan objektum nélküli vagy sikeresen kitakarított abandoned/invalid upload után a reservation felszabadítható. Cleanup-hibánál a reservation megmarad retry-ig.

Soft delete és restore nem változtatja a used értéket. Csökkenés csak a későbbi sikeres végleges purge után történhet.

## Alternatives considered

- Dashboardon minden alkalommal `SUM(sizeBytes)`: egyszerű, de rosszabbul skálázódik és nem oldja meg a pending foglalást.
- Pending rekordok ad hoc összegzése minden initkor: kevesebb denormalizált adat, de bonyolultabb concurrency és konzisztencia.
- Csak kliensoldali számolás: manipulálható és nem lehet authorization/kvótadöntés alapja.
- PostgreSQL trigger: konzisztens lehet, de kevésbé átlátható és nehezebben izolálható unit tesztben.

## Consequences

- Gyors dashboard és determinisztikus kvótadöntés érhető el.
- Minden számlálóváltozás csak state transitionnel együtt, tranzakcióban történhet.
- Szükséges idempotens confirm, expiry cleanup és későbbi reconciliation.
- Cleanup-hiba ideiglenesen foglalhat kvótát; ezt user-friendly állapot és operációs jelzés kíséri.

## Verification

- Unit teszt párhuzamos init esetére.
- Unit teszt ismételt confirmra és pontosan egyszeri counter transferre.
- Unit teszt invalid/abandoned cleanup sikerére és hibájára.
- Unit teszt soft delete, restore és későbbi purge accountingra.

## Első upload-művelet és release – 2026-10-23

A [tervezett UploadOperation](../../03_design/data_model.md#első-képfeltöltés-adatmodell-szerződése--2026-10-23) rögzíti a siker/hiba/lejárat és a foglalásfeloldás külön állapotát. REJECTED/EXPIRED nem csökkenti automatikusan a reservedet. Csak bizonyított íráslezárás és absence/delete után, a reservationReleasedAt jelzővel egy tranzakcióban történhet egyszeri levonás. Kitakarított, de még dedupe-megőrzés alatt álló PENDING_UPLOAD metadata már nem számít foglalásnak. FINALIZED esetén a foglalás ugyanannyi used-dá alakul, nem hibás-upload release történik. A companion modell és az új jelzők egyelőre dokumentáltak, a Prisma-séma változatlan.
