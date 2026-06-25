# ADR-004: S3-compatible object storage es lokalis MinIO

## Status

Accepted

## Date

2026-06-25

## Context

A projekt lenyege a felhoalapu objektumtarolas bemutatasa. A fejleszteshez olyan lokalis megoldas kell, amely nem igenyel valo cloud credentialt, de a kesobbi AWS S3 vagy OCI Object Storage iranyt nem zarja ki.

## Decision

A binaris kep- es videotartalom S3-kompatibilis object storage-ban lesz. Lokalis fejleszteshez MinIO hasznalando, kesobbi cloud celkent AWS S3 vagy OCI Object Storage S3-kompatibilis API-val tamogathato.

## Alternatives considered

- Fajlrendszeres lokalis tarolas: egyszerubb, de nem mutatja be az object storage architekturat.
- Kozvetlen AWS S3 fejlesztes kozben: valosabb cloud kornyezet, de credential-, koltseg- es reprodukalhatosagi kockazatot hoz.
- Binaris fajlok PostgreSQL-ben: egyszerubb deploymentnek tunhet, de rosszul illik nagy mediafajlokhoz es object storage szakdolgozati celhoz.

## Consequences

- A lokalis fejlesztes cloud credential nelkul reprodukalhato.
- A storage bucket privat legyen; hozzaferes backend altal kontrollalt presigned URL flow-val tortenik.
- Provider fugges csokkentesehez storage adapter reteg szukseges.
- A MinIO es cloud S3 kompatibilitas kozotti kisebb eltereseket kesobbi implementacios teszteknek kell kezelniuk.

## Verification

- A kesobbi Docker Compose tartalmaz MinIO service-t.
- A backend storage adapter S3-kompatibilis klienst hasznal.
- A README quickstart nem kovetel valo AWS vagy OCI credentialt normal lokalis futtatashoz.
