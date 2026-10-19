# Quality dokumentumok

## Státusz

**Implementált scaffold-unit tesztek és tervezett terméktesztelés.**

A NestJS/Vue scaffoldhoz Jest és Vitest unit tesztek készültek konfigurációra, health API-kliensre, hibaredakcióra, request ID-ra és mockolt Prisma-életciklusra. A további termékfunkciók tesztmátrixa tervezett; a tényleges futtatási eredmény a tesztriportban szerepel.

## Dokumentumok

- [Test strategy](test_strategy.md): scope, unit tesztmátrix, izolációs elvek és későbbi tesztfázisok.
- [Test report](test_report.md): aktuális, bizonyíték-alapú tesztállapot; aktuális scaffold-ellenőrzés és történeti baseline.

## Szabályok

- Core MVP-ben az első automata tesztszint unit teszt.
- A releváns unit teszt minden jövőbeli vertikális feature-szelet része, nem külön utólagos mérföldkő.
- Integration/contract/e2e és CI a leadás előtti, külön engedélyezendő minőségi fázis része; most ilyen suite vagy pipeline nincs.
- Nem futtatott vagy nem létező teszt nem jelölhető PASS eredményűnek.
- A test report csak tényleges parancsot, környezetet, dátumot és megfigyelt eredményt rögzíthet.
- A tervezett tesztek és a termékkövetelmények kapcsolata a [traceability matrixban](../03_design/traceability.md) követhető.
