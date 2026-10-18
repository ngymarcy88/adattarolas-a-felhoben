# Quality dokumentumok

## Státusz

**Tervezett állapot – nem implementált funkcionalitás.**

A repository jelenleg nem tartalmaz package manifestet, test runnert, alkalmazáskódot vagy futtatott automata tesztet. Ez a mappa a későbbi unit-first minőségi szerződést és az őszinte tesztállapotot dokumentálja.

## Dokumentumok

- [Test strategy](test_strategy.md): scope, unit tesztmátrix, izolációs elvek és későbbi tesztfázisok.
- [Test report](test_report.md): aktuális, bizonyíték-alapú tesztállapot; jelenleg pre-implementation baseline.

## Szabályok

- Core MVP-ben az első automata tesztszint unit teszt.
- A releváns unit teszt minden jövőbeli vertikális feature-szelet része, nem külön utólagos mérföldkő.
- Integration, contract és e2e teszt, valamint CI/CD `Later` scope.
- Nem futtatott vagy nem létező teszt nem jelölhető PASS eredményűnek.
- A test report csak tényleges parancsot, környezetet, dátumot és megfigyelt eredményt rögzíthet.
- A tervezett tesztek és a termékkövetelmények kapcsolata a [traceability matrixban](../03_design/traceability.md) követhető.
