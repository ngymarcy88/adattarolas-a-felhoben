# ADR-010: Short-lived JWT HttpOnly cookie authentication

**Tervezett állapot – nem implementált funkcionalitás.**

## Status

Accepted

## Date

2026-07-12

## Implementation status

JWT/cookie-auth endpoint és tokenfüggőség még nincs. A jelszóhash/check primitív az [ADR-014](ADR-014-password-hashing.md) szerint implementált és a regisztrációba kötött. A `POST /auth/register` usert hoz létre, nem ad tokent vagy cookie-t; Origin-check és kezdeti erőforrásvédelem van. Ez nem a teljes auth-flow; login/logout/me még nincs.

## Context

A böngészős SPA védett API-t használ. A token localStorage-ban történő tárolása növelné az XSS miatti tokenlopás kockázatát, a server-side session pedig további session store-t és állapotot vezetne be. A backend célja a stateless skálázhatóság.

## Decision

A Core MVP rövid életű, alapértelmezetten egyórás JWT access tokent használ `HttpOnly` cookie-ban.

- A cookie `HttpOnly`, `SameSite=Lax` és productionben `Secure`.
- A token nem kerül response bodyba vagy localStorage-ba.
- Core MVP-ben nincs refresh-token flow; lejárat után új login szükséges.
- Logout a cookie-t a kiadáskor használt attribútumokkal törli.
- State-changing kéréseknél Origin/CSRF védelem szükséges.
- CORS explicit frontend origin allowlistet és credentials támogatást használ; wildcard origin tiltott.
- Login hiba nem árulja el, hogy email vagy jelszó volt-e hibás.

## Alternatives considered

- Bearer token localStorage-ban: egyszerű SPA-minta, de nagyobb XSS/token-exfiltration kockázat.
- In-memory access token + refresh cookie: jobb UX, de jelentősen bonyolultabb token lifecycle.
- Server-side session: jó revokálhatóság, de külön tartós session store és statefulabb operáció szükséges.

## Consequences

- A JavaScript nem fér hozzá közvetlenül a tokenhez.
- Cookie-auth miatt CSRF/Origin és CORS konfiguráció kötelező.
- Nincs azonnali egyedi token revocation; rövid TTL és logout cookie-törlés mérsékli ezt a Core MVP-ben.
- A későbbi refresh/revocation új ADR-t igényel.

## Verification

- Unit teszt cookie-attribútumokra, lejáratra, logout törlésre és generic login hibára.
- Security review ellenőrzi az Origin/CSRF és CORS beállítást.
- Manuális browser check igazolja, hogy token nincs localStorage-ban és JavaScriptből nem olvasható.
