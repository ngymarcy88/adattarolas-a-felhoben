# ADR-014: Password hashing with built-in asynchronous scrypt

## Status

Accepted

## Date

2026-10-19

## Implementation status

A `backend/src/auth/password.service.ts` külön, injektálható `PasswordService` szolgáltatást ad. A későbbi regisztrációs szelet az AuthModule-ba kötötte: `POST /auth/register` hash-t ment PostgreSQL-be. Maga a primitív továbbra sem tárol és nem logol. A regisztrációs policy és kezdeti rate/concurrency-védelem az [API-szerződésben](../../03_design/api.md#post-authregister) szerepel; a login a meglévő jelszót a regisztráció új összetételi feltételeitől függetlenül ellenőrzi. Az ADR-010 JWT/cookie stratégiája változatlan.

## Context

A regisztráció/login előtt külön ellenőrizhető jelszóhash/check primitív kell. A Node 22 környezetben rendelkezésre áll a scrypt; nem szükséges új npm-csomag vagy natív modul telepítése. A Prisma `User.passwordHash` mezője 255 karakteres.

## Decision

- Aszinkron `node:crypto.scrypt`, fix `N=131072`, `r=8`, `p=1`; ez az OWASP scrypt-profilja. Műveletenként 16 kriptográfiailag véletlen saltbájt, 64 bájtos származtatott kulcs; Node `maxmem=256 MiB`.
- Tárolási alak: `scrypt$v1$131072$8$1$<32 lowercase hex salt>$<128 lowercase hex key>`. A 182 karakteres rekord belefér a meglévő mezőbe; séma/migráció nem változik.
- `hash(password)` csak a rekordot adja vissza, nem tárol és nem logol. `verify(password, storedHash)` a származtatott kulcsokat `timingSafeEqual` segítségével hasonlítja össze.
- A verifier csak a fenti pontos verziót/profilt és kanonikus mezőhosszakat fogadja el. Ismeretlen algoritmus/verzió, hibás hex, túl hosszú rekord és eltérő költségparaméter KDF-futtatás nélkül `false`; tárolt bemenetből nem választható tetszőleges CPU/memóriaköltség.
- Jelszó: nem üres, jól formált Unicode string, legfeljebb 1024 UTF-8 bájt. Nincs trim, Unicode-normalizálás vagy csonkolás. A nem párosított UTF-16 surrogate elutasított, hogy a UTF-8 helyettesítés ne mosson össze eltérő bemeneteket. Ez technikai bemeneti korlát, nem a későbbi regisztráció teljes jelszóerősségi szabálya.
- Hibás jelszó/hash `false`; hibás új hash-bemenet biztonságos kivétel. Véletlenforrás/KDF infrastruktúrahiba külön, részleteket elrejtő kivétel, nem helytelen jelszóként kezelt `false`. A későbbi auth service és DTO felelőssége a HTTP-kód és a generic login hiba.

## Alternatives considered

- Argon2id: elsődleges OWASP ajánlás; a jelenlegi Node 22 stackben külön függőséget/telepítést igényelne. A már rendelkezésre álló scrypt támogatott alternatíva ehhez a kis szelethez.
- bcrypt: örökölt rendszerekhez való alternatíva és 72 bájtos bemeneti korlát; új külső függőség lenne.
- Gyors SHA-256 vagy titkosítás: nem megfelelő helyettesítője a jelszó-KDF-nek.

## Consequences

A profil hozzávetőleg 128 MiB munkamemóriát igényel műveletenként; az aszinkron hívás a Node worker poolját használja. A jövőbeli publikus auth-végpontokhoz rate limit, párhuzamossági/terhelési vizsgálat és jelszóerősségi policy kell. Ezek nem részei ennek a primitívnek. A `timingSafeEqual` nem teszi a teljes login folyamatot állandó idejűvé; nem létező user, általános hibák és enumeration-védelem külön auth-feladat.

A verziózás későbbi migrációt tesz lehetővé, de rehash/legacy algoritmusok támogatása még nincs. Új algoritmus/profil külön döntést és kompatibilitási tesztet igényel. A JWT secret nem jelszóhash-összetevő; pepper és külső secret provider nincs bevezetve.

## Verification

Jest unit tesztek valós, produkciós költségű scrypttel: helyes/hibás jelszó, véletlen salt, független Python `hashlib.scrypt` szintetikus fixture, whitespace/Unicode megőrzés, 72 bájton túli különbség, UTF-8 határok, hibás rekord és túlzott költség elutasítása KDF nélkül, valamint biztonságos infrastruktúrahibák. A tesztek sorosan futnak; a költség nincs csökkentve. Eredmények: [tesztriport](../../04_quality/test_report.md).

Források: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Node 22 crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

## Regisztrációs policy kiegészítése – 2026-10-20

Explicit szerzői kérés szerint az új jelszó a 15 kódpontos minimum és 1024 UTF-8 bájtos maximum mellett Unicode nagybetűt (`Lu`), számjegyet (`Nd`) és írásjelet/szimbólumot (`P`/`S`) igényel. Szóköz nem teljesíti a speciális karakter feltételét. Kisbetű nem kötelező. A backend DTO és a frontend élő listája azonos szabályokat alkalmaz; a hash formátuma, scrypt és login-kompatibilitás változatlan. A már létező fiókokat nem kényszerítjük jelszócserére.

A [NIST aktuális jelszókövetelménye](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) egyfaktoros használathoz 15 karaktert kér és ellenzi a kötelező karakterkeverést. Az összetételi szabály itt tudatos termékdöntés a felhasználó kérésére; nem nevezzük iparági vagy teljes NIST-megfelelőségnek. A hosszú, egyedi jelszó és a később még szükséges kompromittáltjelszó-blokklista továbbra is fontos. A Mutatás/Elrejtés csak átmeneti kliensállapot, beküldéskor/oldalelhagyáskor rejtés és a már meglévő titoktörlés történik.
