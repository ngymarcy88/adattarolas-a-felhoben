# Privacy és licensing

**Tervezett állapot – nem implementált funkcionalitás.**

## Jelenlegi állapot

A repository nem tartalmaz production adatot, feltöltött felhasználói fájlt, package manifestet vagy telepített alkalmazásdependency-listát. Ez a dokumentum tervezett adatkezelési és licencellenőrzési kapukat ír le; nem jogi tanács és nem kész adatkezelési tájékoztató.

## Tervezett adatleltár

| Adatkategória | Példa | Cél | Megőrzési irány |
|---|---|---|---|
| Fiókadat | email, displayName, password hash | Auth és tulajdonosi elkülönítés | Fiók-életciklus; végleges törlés külön Later döntés |
| Médiaobjektum | kép vagy rövid videó | Felhasználói storage szolgáltatás | Aktív állapot vagy soft delete után későbbi purge |
| Fájlmetadata | név, MIME, méret, state, időpontok | Lista, validation és lifecycle | FileObject életciklus |
| Kvótametadata | used, reserved, limit | Quota enforcement és dashboard | User rekord életciklus |
| Share metadata | token hash, expiry, resource reference | Időkorlátos publikus hozzáférés | Expiry vagy soft-delete invalidálás; későbbi cleanup policy |
| Audit | actor/resource reference, action, request ID | Security és hibakeresés | Konkrét időtartam implementáció előtt döntendő |
| MI-javaslat | normalizált tags/description, status, provenance | Opcionális human-in-the-loop metadata | MVP+ privacy döntés; raw input/output nem tárolható logban |

## Adatminimalizálás

- Storage key nem kerül publikus API-válaszba.
- Eredeti fájlnév csak display/download célra használható.
- Audit metadata allowlistelt; raw token, URL, content és credential tiltott.
- Share tokenből csak SHA-256 hash tárolható.
- MI-providerhez csak explicit kéréshez szükséges kép és minimális kontextus továbbítható.
- Provider response-ból csak normalizált javaslat, státusz és minimális provenance tárolható.
- Arcfelismerés, biometria és érzékeny profilalkotás tiltott, nem Later roadmap.

## Retention és törlés

- User soft delete után a file 30 napig visszaállítható; ez restore-határ, nem fizikai törlési SLA.
- Soft-deleted file továbbra is kvótát foglal.
- Automatizált retention purge Later scope; bevezetése előtt idempotencia, retry és runbook szükséges.
- Pending upload alapértelmezett teljes lejárata 15 perc; cleanup csak object absence vagy sikeres delete után old reservationt.
- Soft delete az aktuális share-linkeket végleg invalidálja; restore után új link kell.
- User account, audit, expired share és MI-suggestion konkrét retention időtartama nincs elfogadva; production indulás előtt kötelező döntés.

## Opcionális MI-provider go/no-go

Provider kiválasztása előtt dokumentálandó:

- szolgáltató, régió és alfeldolgozók;
- input/output retention és törlési lehetőség;
- felhasználja-e a szolgáltató tréningre az adatot, és kikapcsolható-e;
- adatátviteli és hozzáférési feltételek;
- modell- és API-verzió bizonyíthatósága;
- licenc, felhasználási feltételek és outputjogok;
- költség-, rate-limit- és service availability kockázat;
- arcfelismerés/szenzitív inference technikai és policy tiltása.

E kapu hiányában az MVP+ funkció nem implementálható és valós képet nem szabad külső providerhez küldeni.

## Dependency licensing baseline

Jelenleg nincs `package.json`, ezért nincs ellenőrizhető third-party dependency vagy lockfile. A stack és a dokumentumokban említett lehetséges könyvtárak nem jelentenek telepítést vagy elfogadott licencleltárt.

Dependency hozzáadásakor rögzítendő:

- név, pontos verzió és közvetlen/transitív státusz;
- licenc és forrás URL/repository;
- felhasználási szerep;
- ismert security advisory és karbantartottság;
- adatot továbbít-e külső félnek;
- elfogadó review dátuma.

## Dokumentációs és AI-tartalom

- Promptba nem kerülhet valós secret, token, személyes adat vagy privát fájl.
- AI által generált szöveget és kódot emberi review és verifikáció nélkül nem lehet késznek tekinteni.
- Külső forrásból átvett szöveg, diagram vagy kód eredetét és licencét dokumentálni kell.
- A Prompt Log nem helyettesíti a dependency/licenc leltárt.

## Production előtti kötelező döntések

- adatkezelési tájékoztató és jogalap;
- account deletion és export policy;
- audit/share/suggestion retention;
- backup és restore adatkezelése;
- konkrét dependency licencek;
- esetleges MI-provider teljes privacy/licensing go/no-go.
