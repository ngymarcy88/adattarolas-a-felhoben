# ADR-009: Multipart upload deferred to later phase

## Status

Accepted

## Date

2026-06-25

## Context

A projekt kepeket es videokat kezel, igy a nagy fajlok feltoltese fontos cloud object storage tema. Ugyanakkor az MVP scope korlatozott: eloszor a teljes auth, metadata, presigned URL, validation, usage, sharing es soft delete flow-t kell mukodokepesse tenni.

## Decision

Az MVP egyetlen, legfeljebb 100 MB-os presigned PUT feltoltest hasznal. Multipart upload tudatosan kesobbi fazisra kerul, dokumentalt bovitmenykent.

## Alternatives considered

- Multipart upload azonnali implementalasa: termekminosegi szempontbol eros, de jelentosen noveli az elso MVP komplexitasat.
- Backend proxy upload: egyszerubb kontrollt ad, de nagy fajloknal rosszabbul skalazodik.
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
