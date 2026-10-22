# ADR-009: Multipart upload deferred to later phase

## Status

Accepted

## Date

2026-06-25

## October 2026 scope update

A júniusi döntés indoklása történeti baseline. A [friss terv](../../plan.md) alapján a folytatható kötegelt képimport kötelező SZD2 követelmény; az alábbi single-PUT-only állítás nem a teljes SZD2 végleges átviteli szerződése. A nagy videók multipart-bővítése továbbra is későbbi scope.

A 2026-10-20-i első [képfeltöltési API-szerződés](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) egyfájlos single-PUT baseline, nem végleges SZD2 átviteli döntés. Init/confirm idempotenciája vagy a teljes fájl újraküldése nem valódi resume.

A resumable mechanizmus még nincs kiválasztva: tus és S3 multipart külön alternatíva. A transfer PoC és a kiválasztott adatút ADR-je előtt nem állítható, hogy multipart szükséges vagy kizárt. Az érintett döntést a roadmap SZD2-3 kapujában felül kell vizsgálni, a major dependency/multipart implementáció felhatalmazását megtartva.

## Implementation status

Tervezett Later döntés – a Core MVP-ben nincs multipart upload implementáció.

## Context

A projekt kepeket es videokat kezel, igy a nagy fajlok feltoltese fontos cloud object storage tema. Ugyanakkor az MVP scope korlatozott: eloszor a teljes auth, metadata, presigned URL, validation, usage, sharing es soft delete flow-t kell mukodokepesse tenni.

## Decision

Az MVP egyetlen, legfeljebb 100 MB-os presigned PUT feltoltest hasznal. Multipart upload tudatosan kesobbi fazisra kerul, dokumentalt bovitmenykent.

## Alternatives considered

- Multipart upload azonnali implementalasa: termekminosegi szempontbol eros, de jelentosen noveli az elso MVP komplexitasat.
- Backend altal streamelt feltoltes: egyszerubb kontrollt ad, de nagy fajloknal rosszabbul skalazodik.
- Nagyon magas single-upload limit: demoban latvanyos, de instabilabb es nem oldja meg a retry/resume problemat.

## Consequences

- Az MVP egyszerubb es gyorsabban verifikalhato marad.
- A 100 MB-os limit egyertelmu termek- es technikai korlat.
- Nagy videokhoz kesobb initiate multipart, presign part URLs, complete multipart es abort multipart flow-t kell tervezni.
- A UI-nak ertheto hibaval kell elutasitania a limiten tuli fajlokat.

## Verification

- A scope dokumentacio es kesobbi API dokumentacio egyertelmuen jeloli a 100 MB-os MVP limitet.
- Unit tesztek fedik a meretlimit elutasitasat.
- Multipart upload csak uj, kulon jovahagyott merfoldkoben kerulhet implementalasra.
