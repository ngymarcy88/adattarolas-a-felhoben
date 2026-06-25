# ADR-001: Vue 3 + Vite + TypeScript frontend

## Status

Accepted

## Date

2026-06-25

## Context

Az MVP-hez olyan frontend kell, amely gyorsan fejlesztheto, jol dokumentalhato, es eleg eros egy vedett dashboard, fajllista, upload flow, preview/download es share-link UI megvalositasahoz. A projekt szakdolgozati scope-ja miatt a keretrendszernek nem szabad tul sok boilerplate-et adnia, de tipusbiztonsagot es tesztelhetoseget igen.

## Decision

A frontend stack Vue 3, Vite, TypeScript es Tailwind CSS lesz. Route kezeleshez Vue Router hasznalhato. Pinia csak akkor kerul be, ha valos shared/global frontend state igeny jelenik meg.

## Alternatives considered

- React + Vite: eros okoszisztema, de a projekt szerzoje szamara a Vue gyorsabb es atlathatobb implementacios utat adhat.
- Angular: strukturalt, de az MVP-hez tul nagy keretrendszeri sulyt es boilerplate-et hozna.
- Plain HTML/JavaScript: egyszerubb indulashoz, de gyengebb tipusbiztonsagot es komponensszervezest adna.

## Consequences

- Gyors fejlesztoi feedback varhato Vite-tal.
- A Composition API jol illeszkedik komponensalapu dashboard es upload UI epiteshez.
- A TypeScript segit az AI altal generalt kod ellenorzeseben.
- A Tailwind gyorsitja a UI epiteset, de kovetkezetes komponensmintakra lesz szukseg, hogy ne legyen szetszort styling.

## Verification

- A kesobbi frontend scaffold `package.json` fajlja a valasztott stackhez igazodik.
- A protected route, API client es upload UI komponensek Vue 3 Composition API-val keszulnek.
- Frontend logika eseten Vitest unit teszt keszul, ha a logika nem trivialis.
