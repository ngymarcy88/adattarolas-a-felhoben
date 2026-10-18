# Termékvízió

**Tervezett állapot – nem implementált funkcionalitás.**

## Probléma

A képek és videók felhőben tárolása egyszerű felhasználói műveletnek látszik, a háttérben azonban hitelesítést, tulajdonosi ellenőrzést, objektum- és metaadat-életciklust, kvótaelszámolást, biztonságos megosztást és érthető hibakezelést igényel. A projekt azt tervezi bemutatni, hogyan állhat össze ezekből egy átlátható, tesztelhető és dokumentált webalkalmazás S3-kompatibilis objektumtárolóra építve.

## Termékvízió

A CloudVault egy tervezett személyes cloud media storage webalkalmazás. A felhasználó saját képeit és videóit feltöltheti, cursor-lapozott listában böngészheti, megtekintheti, letöltheti, időkorlátos linken megoszthatja, soft delete-tel törölheti és a 30 napos megőrzési időn belül visszaállíthatja. A bináris tartalom objektumtárolóban, az alkalmazási metaadat PostgreSQL-ben kap helyet; minden védett műveletet a backend engedélyez.

A cél nem teljes Dropbox- vagy Google Drive-alternatíva, hanem szakdolgozati keretek között megvalósítható, termékminőségre törekvő MVP. A részletes, hat user storyból álló szerződés a [scope contractban](scope_contract.md) található.

## Célfelhasználók

### Persona 1: Anna, személyes médiafelhasználó

- **Helyzet:** telefonon és számítógépen készült képeket, rövid videókat szeretne egy helyen tárolni.
- **Cél:** egyszerűen feltölteni, később megtalálni, megnyitni vagy letölteni saját fájljait.
- **Igény:** világos állapotok, érthető hibák, látható tárhelykeret és biztonságos alapbeállítások.
- **Fájdalompont:** nem szeretne bucketekkel, cloud credentialekkel vagy storage-beállításokkal foglalkozni.

### Persona 2: Bence, technikailag tudatos megosztó

- **Helyzet:** alkalmanként képeket vagy rövid videókat oszt meg ismerősökkel.
- **Cél:** kontrollálni, melyik fájl érhető el kívülről, és meddig él a hozzáférés.
- **Igény:** időkorlátos megosztási link, egyértelmű tulajdonjog, visszaállítható törlés és kiszámítható tárhelyelszámolás.
- **Fájdalompont:** nem akar nyilvános bucketet vagy tartós, közvetlen object storage URL-t használni.

## A szakmai koncepció négy pillére

1. **Core cloud-storage MVP:** a regisztrációtól a feltöltésen, listázáson és megosztáson át a törlésig és visszaállításig tartó hat felhasználói történet.
2. **Megbízható fájl-életciklus:** pending és félbehagyott feltöltések kezelése, idempotens confirm, pontos tárhelyelszámolás, soft delete és dokumentált későbbi purge.
3. **Skálázható és karbantartható architektúra:** stateless backend, cursor pagination, központi jogosultság-ellenőrzés, storage adapter, alap audit események és tesztelhető modulhatárok.
4. **Opcionális MI-metaadat-javaslat:** kizárólag aktív képnél, a felhasználó kifejezett kérésére készülő címke- és leírásjavaslat, amelyet ember fogad el, szerkeszt vagy utasít el.

Az első három pillér alkotja a `Core MVP` alapját. A negyedik pillér `MVP+`: hiánya vagy szolgáltatói hibája nem akadályozhat regisztrációt, feltöltést, böngészést, letöltést, megosztást, törlést vagy visszaállítást.

## Értékajánlat

- A felhasználó védett felületen kezelheti saját képeit és videóit.
- A rövid életű, backend által kontrollált presigned URL-ek nem igényelnek frontendben tárolt storage credentialt.
- A kvótakijelzés, a 30 napig visszaállítható törlés és a félbehagyott feltöltések kezelése érthetővé teszi a teljes fájl-életciklust.
- Az időkorlátos megosztás nem teszi tartósan nyilvánossá sem a bucketet, sem a fájlt.
- A determinisztikus cursor pagination és a stateless backend későbbi növekedésnél is fenntartható alapot ad.
- Az opcionális MI csak javaslatot készít; a végleges metaadat felett a felhasználó dönt.

## Termékalapelvek

1. **Privát alapállapot:** fájlhoz csak a tulajdonos vagy érvényes megosztási link birtokosa férhet hozzá.
2. **Backend által kontrollált hozzáférés:** a frontend nem tárol S3/MinIO credentialt és nem dönt jogosultságról.
3. **Nem megbízható kliensadat:** fájlméretet, MIME-típust, fájlnevet és tulajdonosi állítást a backendnek ellenőriznie kell.
4. **Konzisztens életciklus:** pending, aktív és soft-deleted állapot között csak ellenőrzött, megismételhető műveletek válthatnak.
5. **Visszafordítható törlés:** a felhasználói törlés először soft delete, egységes 30 napos retentionnel.
6. **Pontosan egyszeri elszámolás:** ismételt upload confirm nem növelheti többször a használt tárhelyet.
7. **Megfigyelhető, de adatminimalizált működés:** a fontos állapot- és security eseményekhez alap audit készül, audit UI és érzékeny adatok naplózása nélkül.
8. **AI-független core:** a storage termék minden alapfunkciója MI-provider nélkül is működőképes marad.
9. **Őszinte dokumentáció:** tervezett képesség nem nevezhető implementáltnak bizonyító kód, teszt és demonstráció nélkül.

## AI-asszisztált fejlesztés és alkalmazásbeli MI

Az AI-asszisztált fejlesztési folyamat bizonyítékait a `docs/07_ai/` dokumentumok rögzítik. Ez külön fogalom az alkalmazás opcionális `MVP+` MI-metaadat-javaslatától. Az előbbi a szakdolgozat elkészítésének módszertana, az utóbbi egy tervezett, felhasználó által indított termékfunkció.

## Várt eredmény

A `Core MVP` akkor szolgálja a víziót, ha a célfelhasználó a hat user storyt végig tudja járni úgy, hogy más felhasználó fájljához nem kap jogosulatlan hozzáférést, a fájl- és kvótaállapot ismételt vagy félbehagyott műveleteknél is konzisztens marad, és a core működéshez nincs szükség MI-szolgáltatásra.
