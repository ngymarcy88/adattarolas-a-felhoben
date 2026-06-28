# ADR-007: Denormalized User.usedStorageBytes

## Status

Accepted

## Date

2026-06-25

## Context

A dashboardnak es a feltoltes elotti kvotaellenorzesnek gyorsan kell tudnia, mennyi tarhelyet hasznal a felhasznalo. Minden keresnel `SUM(sizeBytes)` alapu ujraszamolas egyszeru, de rosszabbul skalazodik es tobb helyen vezethet eltero logikahoz.

## Decision

A `User` entitas tartalmazni fogja a denormalizalt `usedStorageBytes` mezot. Ez sikeres upload confirm utan no, soft delete es restore soran nem valtozik, es csak sikeres vegleges purge utan csokkenhet.

## Alternatives considered

- Mindig `SUM(sizeBytes)` alapjan szamolni: egyszeru kezdetben, de nem idealis dashboard es kvotaellenorzes alatt.
- Kliens oldali usage szamolas: nem megbizhato es konnyen manipulalhato.
- Adatbazis trigger: konzisztens lehet, de MVP-ben kevesbe atlathato es nehezebben unit tesztelheto, mint service-layer tranzakcio.

## Consequences

- A usage gyorsan megjelenitheto es kvotahoz hasznalhato.
- Minden upload confirm es purge logikanal fokozottan ugyelni kell a pontos egyszeri modositasra.
- Felbehagyott vagy sikertelen upload nem novelheti tartosan a usage erteket.
- Idonkenti reconciliation kesobbi productization feladat lehet.

## Verification

- Unit tesztek ellenorzik, hogy usage csak sikeres confirm utan no.
- Unit tesztek ellenorzik, hogy soft delete es restore nem modositja a usage erteket.
- Kesobbi purge tesztek ellenorzik, hogy usage csak sikeres storage torles utan csokken.
