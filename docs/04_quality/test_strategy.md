# Test strategy

**Tervezett állapot – nem implementált funkcionalitás.**

## Cél és hatókör

Az első implementációs fázis unit tesztekkel védi a Core MVP üzleti szabályait. A jelen dokumentációs kör nem hoz létre test runnert vagy tesztkódot. Backendhez később Jest, frontendhez csak nem triviális izolált logika esetén Vitest használható.

`Later` scope:

- PostgreSQL/Prisma integration tesztek;
- MinIO/S3 adapter integration tesztek;
- API contract tesztek;
- Playwright vagy más e2e/UI tesztek;
- CI quality gate és coverage enforcement.

## Tesztelhetőségi elvek

- Business logic service-ben vagy pure functionben legyen, ne controllerben.
- Prisma, storage, clock, random/token generator, audit és opcionális MI-provider porton keresztül mockolható.
- Időfüggő szabály injektált clockot használ.
- A state transition és counter update egy use case-ként tesztelendő.
- Minden negatív teszt külső hibakódot és belső információszivárgás hiányát is ellenőrzi.
- A teszt fixture nem tartalmaz valós személyes adatot, credentialt vagy elérhető presigned URL-t.
- Unit teszt nem nevezhető storage/database integrációs bizonyítéknak.

## Core MVP unit tesztmátrix

| Csoport | Kötelező tervezett esetek | Kapcsolódó story |
|---|---|---|
| Auth | password hash/check; duplikált email; generic invalid credentials; egyórás JWT; `HttpOnly`, `SameSite=Lax`, production `Secure`; logout cookie-törlés; Origin allowlist | US-01 |
| Authorization | owner hozzáfér; más user és nem létező file egységes `FILE_NOT_FOUND`; auth nélkül `AUTH_REQUIRED` | US-01–US-06 |
| Storage key | nem eredeti fájlnévből készül; collision-safe; owner referencia nem szivárog API-ba | US-02 |
| Upload init | 100 MB boundary; pontos MIME allowlist; invalid név; quota boundary; tranzakció rollback | US-02, US-04 |
| Concurrent reservation | párhuzamos init nem lépi túl a limitet; `used + reserved <= limit`; sikertelen init nem foglal | US-02, US-04 |
| Confirm | object missing; `HEAD` méreteltérés; range-read hiba; magic-number mismatch; támogatott signature; `PENDING_UPLOAD → ACTIVE` | US-02 |
| Exactly-once accounting | első confirm transfer; ismételt és párhuzamos confirm no-op/azonos eredmény; counter nem megy negatívba | US-02, US-04 |
| Abandoned cleanup | 15 perces pending boundary; object absent; delete success; delete failure reservationt megtart; retry metadata | US-02, US-04 |
| Cursor pagination | default 20/max 100; invalid cursor/limit; `createdAt DESC, id DESC`; azonos timestamp; nincs kihagyás/duplikáció | US-03 |
| Preview/download | inline allowlist; HTML/SVG/JS/XML/unknown tiltás; attachment névnormalizálás; 5 perces TTL | US-03 |
| Usage | available érték; soft delete/restore nem változtat used-on; reservation látható | US-04, US-06 |
| Soft delete/restore | ownership; 30 nap előtt/határon/után; idempotens/stabil ismétlés; share-linkek invalidálása; restore nem éleszti újra őket | US-06 |
| Sharing | 32 random byte token; base64url; SHA-256 hash; 1 óra–7 nap expiry; invalid/expired/non-active egységes publikus hiba | US-05 |
| Audit | kötelező események; request ID; allowlistelt metadata; nincs jelszó, token, URL, file content vagy raw MI adat | US-01–US-06 |
| Error mapping | nested wrapper; stabil kód; üres/biztonságos details; request ID; nincs stack/providerüzenet | US-01–US-06 |

## Opcionális MVP+ unit tesztek

Az alábbiak csak az MI-metaadat-javaslat külön jóváhagyása után készülnek:

- csak owner és `ACTIVE` kép indíthat suggestiont;
- videó, pending, deleted és cross-user file elutasítása;
- automatikus upload utáni providerhívás hiánya;
- `PENDING → READY | FAILED`, majd `READY → ACCEPTED | REJECTED`;
- szerkesztett accept alkalmazza a user által megadott értéket;
- accept/reject ismétlés stabil eredménye;
- provider timeout/hiba mellett core file service változatlanul működik;
- raw provider response, kép és URL nem kerül auditba vagy logba;
- tiltott biometrikus/szenzitív eredmény nem fogadható el automatikusan.

## Frontend unit teszt irány

Vitest csak indokolt, izolált logikára:

- file size és usage formázás;
- cursor page merge és duplikációvédelem;
- error-code → user message mapping;
- upload state/progress reducer;
- MI suggestion accept/edit/reject state, ha MVP+ elkészül.

Egyszerű statikus renderelésre nem szükséges tesztet írni kizárólag darabszám növelése érdekében.

## Névkonvenció és szerkezet

- Tesztnév: `should <expected behavior> when <condition>`.
- Egy teszt egy üzleti állítást bizonyítson.
- Arrange–Act–Assert szerkezet ajánlott.
- Idő, random és adapter mock explicit legyen; globális rejtett state kerülendő.
- Fixture neve jelezze, hogy szintetikus, például `user@example.test`.

## Minőségi kapu vertikális szeletenként

Egy jövőbeli slice csak akkor zárható le, ha:

1. a hozzá tartozó unit tesztek futnak és PASS eredményűek;
2. legalább a dokumentált negatív és boundary esetek fedettek;
3. a tesztparancs és eredmény bekerül a test reportba;
4. API-, adatmodell-, threat- és UX-dokumentáció megfelel a kódnak;
5. ismert hiányosság nem marad jelöletlen.

## Coverage

A jelenlegi baseline nélkül nincs hiteles százalékos coverage-küszöb. A későbbi első futtatás rögzíti a baseline-t. A kritikus auth-, ownership-, accounting-, validation- és lifecycle-ágak teljes viselkedési lefedése fontosabb a puszta globális százaléknál.

## Későbbi tesztfázis kapuja

Integration/e2e/contract teszt csak explicit későbbi mérföldkőben indulhat. Bevezetésekor külön dokumentálni kell a környezetet, fixture cleanupot, MinIO/PostgreSQL izolációt, CI-erőforrást és flake-kezelést.
