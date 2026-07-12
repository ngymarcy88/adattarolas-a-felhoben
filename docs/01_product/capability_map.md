# Capability map

**Tervezett állapot – nem implementált funkcionalitás.**

## Cél és jelölések

A capability map elkülöníti a közvetlen felhasználói értéket adó **Value** képességeket a biztonságos, konzisztens és karbantartható működést biztosító **Productization** képességektől.

- **Core MVP:** a hat kötelező storage user story vagy azok megbízható működésének feltétele.
- **MVP+:** opcionális MI-metaadat-javaslat, amely nem lehet core függőség.
- **Later:** tudatosan későbbre helyezett termék- vagy üzemeltetési bővítés.

## Képességek

| Képesség | Kategória | Fázis | Kapcsolódó story | Tervezett eredmény |
|---|---|---|---|---|
| Regisztráció, login, logout és védett felület | Value | Core MVP | US-01 | Saját, elkülönített tárhely biztonságos használata. |
| Kép- és videófeltöltés | Value | Core MVP | US-02 | Legfeljebb 100 MB-os médiafájl privát tárolása. |
| Cursor-lapozott saját fájllista | Value | Core MVP | US-03 | Aktív saját fájlok determinisztikus, skálázható böngészése. |
| Kép- és videópreview | Value | Core MVP | US-03 | Támogatott média megtekintése rövid életű read URL-lel. |
| Fájlletöltés | Value | Core MVP | US-03 | Saját tartalom biztonságos letöltése. |
| Tárhelyhasználat megjelenítése | Value | Core MVP | US-04 | Használt tárhely és kvóta követése. |
| Időkorlátos alap megosztási link | Value | Core MVP | US-05 | Egy aktív fájl ideiglenes megosztása bejelentkezés nélkül. |
| Soft delete és egyedi restore | Value | Core MVP | US-06 | Téves törlés visszafordítása 30 napon belül. |
| Backend authorization és ownership | Productization | Core MVP | US-01–US-06 | Más felhasználó erőforrásainak védelme. |
| Stateless backend | Productization | Core MVP | US-01–US-06 | Kéréskiszolgálás lokális példányállapot-függés nélkül. |
| Storage adapter és presigned URL flow | Productization | Core MVP | US-02, US-03, US-05 | Storage credential nélküli frontend és providerhatár. |
| Pending kvótafoglalás | Productization | Core MVP | US-02, US-04 | Párhuzamos upload init mellett is betartott tárhelylimit. |
| Idempotens upload confirm | Productization | Core MVP | US-02, US-04 | Retry esetén is pontosan egyszeri aktiválás és usage accounting. |
| Abandoned upload felismerés és cleanup | Productization | Core MVP | US-02, US-04 | Lejárt pending objektum és reservation biztonságos, retry-képes rendezése. |
| Méret-, MIME- és magic number validáció | Productization | Core MVP | US-02 | Manipulált vagy nem támogatott feltöltések kiszűrése. |
| Determinisztikus cursor pagination | Productization | Core MVP | US-03 | Stabil `createdAt + id` sorrend kihagyás és duplikáció nélkül. |
| Denormalizált usage accounting | Productization | Core MVP | US-02, US-04, US-06 | Gyors kvótaellenőrzés `usedStorageBytes` és `reservedStorageBytes` számlálókkal. |
| Biztonságos preview/download viselkedés | Productization | Core MVP | US-03, US-05 | Veszélyes tartalom inline futtatásának és adatszivárgásának csökkentése. |
| Egységes hibaszerződés | Productization | Core MVP | US-01–US-06 | Stabil hibakódok, érthető UI-hibák és request trace. |
| Alap audit események audit UI nélkül | Productization | Core MVP | US-01–US-06 | Fontos lifecycle- és security események érzékeny adat nélküli nyoma. |
| Unit tesztek a core logikára | Productization | Core MVP | US-01–US-06 | Auth, ownership, validáció, lapozás és lifecycle ellenőrizhetősége. |
| Kép-metaadat-javaslat | Value | MVP+ | Opcionális | Explicit kérésre címke- és leírásjavaslat aktív képhez. |
| Human-in-the-loop MI-jóváhagyás | Productization | MVP+ | Opcionális | Elfogadás, szerkesztés vagy elutasítás nélkül nincs végleges metaadat-változás. |
| MI-provider adapter és graceful degradation | Productization | MVP+ | Opcionális | Providerhiba nem akadályoz storage-műveletet, a provider cserélhető marad. |
| MI-adatminimalizálás és provenance | Productization | MVP+ | Opcionális | Csak szükséges adat továbbítása és a javaslat eredetének követhetősége. |
| Automatizált retention purge | Productization | Later | US-06 kiterjesztése | Lejárt soft-deleted objektumok és metaadatok idempotens végleges takarítása. |
| Multipart upload | Productization | Later | US-02 kiterjesztése | Nagy videók megszakítható és folytatható feltöltése. |
| Fejlett share-link kezelés | Value | Later | US-05 kiterjesztése | Visszavonás, hozzáférési limit és analitika. |
| Thumbnail és transzkódolás | Value | Later | US-03 kiterjesztése | Optimalizált médiaélmény. |
| Cloud deployment AWS-re vagy OCI-ra | Productization | Later | Keresztmetszeti | Publikusan elérhető felhőkörnyezet. |
| Integration, contract és e2e tesztek | Productization | Later | Keresztmetszeti | Komponensek közötti és teljes rendszerű bizonyíték. |
| CI/CD és monitoring dashboard | Productization | Later | Keresztmetszeti | Automatizált kiadás és részletes üzemeltetési láthatóság. |

## Fáziskapuk

- A `Core MVP` csak akkor tekinthető teljesnek, ha a Value képességekkel együtt a hozzájuk tartozó Productization képességek is igazoltak.
- Az `MVP+` MI-funkció fejlesztése nem módosíthatja a hat core user story Definition of Done-ját, és nem vezethet MI-függőséget a storage folyamatokba.
- A `Later` elemek dokumentálhatók tervezett irányként, de nem állíthatók elkészült MVP-képességnek.
