# ADR-009: Multipart upload deferred to later phase

## Status

Partially superseded by [ADR-017](ADR-017-direct-multipart-poc.md) on 2026-11-01; historical baseline retained below.

## Date

2026-06-25

## October 2026 scope update

A júniusi döntés indoklása történeti baseline. A [friss terv](../../plan.md) alapján a folytatható kötegelt képimport kötelező SZD2 követelmény; az alábbi single-PUT-only állítás nem a teljes SZD2 végleges átviteli szerződése. A nagy videók multipart-bővítése továbbra is későbbi scope.

A 2026-10-20-i első [képfeltöltési API-szerződés](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) egyfájlos single-PUT baseline, nem végleges SZD2 átviteli döntés. Init/confirm idempotenciája vagy a teljes fájl újraküldése nem valódi resume.

A teljes resumable képimport mechanizmusa még nincs lezárva. A 2026-11-01-i [ADR-017](ADR-017-direct-multipart-poc.md) PoC-ja a közvetlen S3 multipart úthoz Uppy S3 klienst választott jelöltként, és igazolta a kész részek megtartását. A tus továbbra külön alternatíva a kis képek fájlon belüli folytatására. A PoC nem engedélyezi az éles út cseréjét vagy a teljes SZD2-resume késznek minősítését; a nagyvideós bővítés nem része ennek a feladatnak.

## Implementation status

2026-11-01: elkülönített közvetlen MinIO multipart PoC készült Uppy S3 klienssel, 5 MiB-os részekkel; a választás és bizonyítási határ az [ADR-017-ben](ADR-017-direct-multipart-poc.md). Az alkalmazás továbbra is single-PUT útvonalon működik. Az alábbi általános halasztás a kötelező képimportot már nem zárja ki; a nagyvideós bővítés későbbi feladat. A kis képek fájlon belüli folytathatósága nyitott marad.

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
