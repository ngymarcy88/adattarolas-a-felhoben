# ADR-005: Backend-controlled presigned upload/download flow

## Status

Accepted

## Date

2026-06-25

## Context

A frontendnek mediafajlokat kell feltoltenie es megtekintenie, de nem tarolhat object storage credentialt. A backendnek kell ervenyesitenie a felhasznaloi jogosultsagot, a fajlmetaadatokat, a kvotat, a share linkeket es a biztonsagos response viselkedest.

## Decision

Az MVP backend-kontrollalt presigned URL flow-t hasznal. Uploadnal a frontend metadata kerest kuld, a backend pending rekordot hoz letre es rovid eletu upload URL-t ad. Feltoltes utan a frontend confirm endpointot hiv, a backend ellenoriz es aktivva teszi a rekordot. Preview/download esetben a backend ownership vagy share token alapjan ad rovid eletu read URL-t.

## Alternatives considered

- Frontend kozvetlen storage credentialdel: egyszerubbnek tunik, de elfogadhatatlan credential es authorization kockazat.
- Backend proxyzza az osszes fajltartalmat: erosebb kontrollt ad, de feleslegesen terheli a backend szervert es nehezebb nagyobb fajloknal.
- Nyilvanos bucket URL-ek: egyszeru demohoz jo, de nem termekminosegu es nem vedett.

## Consequences

- A backend marad az authorization es metadata igazsagforrasa.
- A frontend credential nelkul tud nagyobb binaris tartalmat object storage-ba kuldeni.
- A confirm folyamatnak kezelnie kell a felbehagyott vagy lejart feltolteseket.
- Presigned URL-eket tilos logolni, mert ideiglenes hozzaferest adhatnak.

## Verification

- A kesobbi API dokumentacio tartalmazza az upload request, confirm, preview/download es share read flow-kat.
- Unit tesztek fedik az ownership, quota es statusz atmeneteket.
- Log review ellenorzi, hogy presigned URL ne keruljon naploba.
