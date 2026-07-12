# ADR-006: Soft delete és delayed purge strategy

## Status

Accepted

## Date

2026-06-25; frissítve: 2026-07-12

## Implementation status

Tervezett állapot – nincs implementált delete, restore vagy purge folyamat.

## Context

A bináris objektum és a relációs metadata külön rendszerben él. Az azonnali hard delete rossz felhasználói élményt ad, a kizárólag DB-s soft delete pedig árván maradt objektumokhoz és hibás elszámoláshoz vezetne.

## Decision

A Core MVP soft delete-et és egyedi restore-t használ:

- `ACTIVE → SOFT_DELETED` átmenetkor `deletedAt` és 30 nappal későbbi `purgeAfter` készül.
- A fájl eltűnik az aktív listából, de megjelenik a tulajdonos visszaállítható listájában.
- Restore csak a retention időn belül, ownership check után engedélyezett.
- Soft delete és restore nem módosítja a `usedStorageBytes` értékét.
- Soft delete ugyanabban a tranzakcióban törli a fájl meglévő `ShareLink` rekordjait; ezzel a tokenek végleg invalidak, és restore nem aktiválja őket újra.

Az automatizált végleges purge **Later scope**, nem Core MVP deliverable. Későbbi működése idempotens: object delete után, tranzakcióban történik az accounting és a metadata terminális lezárása. Storage-hiba `PURGE_FAILED` retry-állapotot eredményez; usage nem csökkenhet.

## Alternatives considered

- Azonnali hard delete: egyszerűbb, de nem visszafordítható és nagyobb adatvesztési kockázat.
- Csak DB soft delete: tartósan árva object storage tartalmat hagyhat.
- Kizárólag S3 Lifecycle Policy: nem kezeli önmagában a relációs metadata, share link és usage szinkronját.
- Automatizált purge a Core MVP-ben: fontos, de a core scope-ot és operációs kockázatot túlzottan növelné.

## Consequences

- A téves törlés 30 napon belül visszaállítható.
- A recoverable objektum továbbra is foglal felhasználói tárhelyet.
- Restore után új share-link szükséges, ami elkerüli a korábbi publikus capability váratlan újraéledését.
- A későbbi purge worker és reconciliation külön jóváhagyást és runbookot igényel.
- A purge logikai szabályai unit tesztelhetők worker technológia nélkül is.

## Verification

- Unit tesztek: ownership, delete/restore transition, retention boundary, listaszűrés és usage invariáns.
- A scope contract és capability map az automatizált purge-ot Later státuszúnak jelöli.
- Purge implementáció előtt új worker/queue döntés, részletes runbook és tesztterv szükséges.
