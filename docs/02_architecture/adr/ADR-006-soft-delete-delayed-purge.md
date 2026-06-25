# ADR-006: Soft delete es delayed purge strategy

## Status

Accepted

## Date

2026-06-25

## Context

A felhasznaloi torlesnel termekminosegu rendszerben nem szerencses azonnal veglegesen torolni a fajlt. A media objektum es a metadata kulon rendszerekben el, ezert a torles eletciklusat explicit allapotokkal kell kezelni.

## Decision

Az MVP soft delete-et hasznal: torleskor a `FileObject` rekord `deletedAt` es 30 nappal kesobbi `purgeAfter` erteket kap, eltunik a normal listabol, de restore listaban megjelenhet. A restore egyedi fajlra engedelyezett a retention idon belul. A vegleges purge strategia dokumentalt, de automatizalt purge implementacio nem MVP kovetelmeny.

## Alternatives considered

- Azonnali hard delete: egyszerubb, de rosszabb felhasznaloi elmenyt es nagyobb adatvesztesi kockazatot hoz.
- Csak database soft delete objektumtorlesi terv nelkul: arva object storage tartalmakhoz es usage inkonzisztenciahoz vezethet.
- S3 Lifecycle Policy kizolag: segithet kesobb, de az alkalmazasi metadata szinkronjat nem oldja meg onmagaban.

## Consequences

- A teves torles 30 napon belul visszafordithato.
- Soft delete alatt a fajl fizikailag tovabbra is tarolva van, ezert tovabbra is beleszamit a kvotaba.
- A kesobbi purge-nek idempotensnek kell lennie, es storage hiba eseten nem csokkentheti a usage szamlalot.
- Share linkek torolt fajlra nem adhatnak hozzaferest.

## Verification

- A kesobbi files service unit tesztek fedik a delete, restore, lejart retention es ownership eseteket.
- A purge implementacio elott runbook es ADR/dokumentacio frissites keszul.
- A `docs/01_product/scope_contract.md` soft delete kriteriumai valtozatlanul ervenyesek maradnak.
