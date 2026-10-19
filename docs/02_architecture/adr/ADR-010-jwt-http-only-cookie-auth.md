# ADR-010: Short-lived JWT HttpOnly cookie authentication

**Backend login/logout/me és cookie implementált; a frontend, valós DB-/browser-elfogadás még nyitott.**

## Status

Accepted

## Date

2026-07-12

## Implementation status

JWT/cookie-auth endpointok implementáltak `jsonwebtoken@9.0.3` könyvtárral (MIT), új auth-stratégia vagy saját JWT-protokoll nélkül. A jelszóhash/check primitív az [ADR-014](ADR-014-password-hashing.md) szerint implementált és a regisztrációba kötött. A `POST /auth/register` usert hoz létre, nem ad tokent vagy cookie-t; Origin-check és kezdeti erőforrásvédelem van. A login ad cookie-t, a `/me` ellenőrzi a JWT-t és az aktuális DB-usert. Logout Origin-védelem mellett idempotensen töröl, hiányzó/lejárt cookie-val is. Nem igényel érvényes tokent a törléshez; ez az eredeti API cookie+Origin jelölésének pontosítása, nem session-visszavonás.

## Context

A böngészős SPA védett API-t használ. A token localStorage-ban történő tárolása növelné az XSS miatti tokenlopás kockázatát, a server-side session pedig további session store-t és állapotot vezetne be. A backend célja a stateless skálázhatóság.

## Decision

A Core MVP rövid életű, alapértelmezetten egyórás JWT access tokent használ `HttpOnly` cookie-ban.

- A `cloudvault_access` cookie `HttpOnly`, `SameSite=Lax`, host-only (Domain nélkül), `Path=/api/v1`, productionben `Secure`. Ugyanezekkel az attribútumokkal törlendő, új maxAge nélkül. Frontend/backend same-site topológia és production HTTPS szükséges.
- HS256 aláírás, fix `iss=cloudvault`, `aud=cloudvault-api`, UUID `sub`, egész `iat`/`exp`. Lejárat és jövőbeli iat elutasított, TTL 1s–24h (`JWT_EXPIRES_IN`, default 1h). Csak HS256 fogadható el; nincs request által választott kulcs/algoritmus. Dupla auth-cookie, hibás/túl hosszú token vagy hiányzó claim 401.
- JWT-adat nem titkosított; kizárólag userazonosító és technikai claim kerül bele, email/név/hash nem. A verifier a könyvtár aláírás-ellenőrzését használja, nem decode-only ágat.
- A token nem kerül response bodyba vagy localStorage-ba.
- Core MVP-ben nincs refresh-token flow; lejárat után új login szükséges.
- Logout a cookie-t a kiadáskor használt attribútumokkal törli.
- State-changing kéréseknél Origin/CSRF védelem szükséges.
- CORS explicit frontend origin allowlistet és credentials támogatást használ; wildcard origin tiltott.
- Login hiba nem árulja el, hogy email vagy jelszó volt-e hibás; hiányzó usernél is valós scrypt fut szintetikus fix költségű dummy hash-sel. A teljes requestidő állandósága nem állított. Az új regisztrációs erősségi minimumot nem alkalmazzuk meglévő jelszó loginjára.
- Regisztráció/login közös process-local 5 próbálkozás/60s/socket-peer (legfeljebb 1024 peer); egyetlen drága credential-művelet/folyamat, várósor nélkül. Ezek lokális védőkorlátok, nem mért kapacitás vagy többgépes abuse-védelem.
- `/me`: minden kérésnél public selecttel lekért DB-user; megszűnt user 401, DB-hiba 503. Authorization bearer header nem támogatott; csak cookie.

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

Könyvtár elsődleges forrása: [Auth0 node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken). Verzió a root lockfile-ban rögzített; licenc és auditkorlátok a privacy/licensing és tesztriport dokumentumban.
