# Capability map

## Cél és státuszjelölések

A capability map elkülöníti a közvetlen felhasználói értéket adó **Value** képességeket a megbízható termékműködést biztosító **Productization** képességektől.

- **MVP:** a tervezett MVP kötelező része, de jelenleg még nem implementált.
- **Később:** tudatosan az MVP-n kívülre helyezett bővítés.

## Képességek

| Képesség | Kategória | Fázis | Felhasználói vagy mérnöki eredmény |
|---|---|---|---|
| Regisztráció és bejelentkezés | Value | MVP | Saját, elkülönített tárhely használata. |
| Kép- és videófeltöltés | Value | MVP | Legfeljebb 100 MB-os médiafájl privát tárolása. |
| Saját fájlok listázása | Value | MVP | A feltöltött aktív fájlok áttekintése. |
| Kép- és videópreview | Value | MVP | Támogatott média böngészőből történő megtekintése. |
| Fájlletöltés | Value | MVP | Saját tartalom biztonságos letöltése. |
| Tárhelyhasználat megjelenítése | Value | MVP | Használt tárhely és kvóta követése. |
| Időkorlátos alap megosztási link | Value | MVP | Egy fájl ideiglenes megosztása bejelentkezés nélkül. |
| Soft delete és egyedi restore | Value | MVP | Téves törlés visszafordítása 30 napon belül. |
| Backend oldali authorization és ownership | Productization | MVP | Más felhasználó erőforrásainak védelme. |
| Storage adapter és presigned URL flow | Productization | MVP | Providerfüggetlenebb, credential nélküli frontend-hozzáférés. |
| Méret-, MIME- és magic number validáció | Productization | MVP | Manipulált vagy nem támogatott feltöltések kiszűrése. |
| Denormalizált usage accounting | Productization | MVP | Gyors és kiszámítható kvótaellenőrzés. |
| Biztonságos preview/download headerek | Productization | MVP | Veszélyes tartalom inline futtatásának csökkentése. |
| Egységes hibamodell | Productization | MVP | Stabil API-szerződés és érthető UI-hibák. |
| Unit tesztek a core logikára | Productization | MVP | Auth, ownership, validáció és lifecycle ellenőrizhetősége. |
| Idempotens végleges purge | Productization | Később | Object storage és adatbázis konzisztens takarítása. |
| Multipart upload | Productization | Később | Nagy videók megszakítható és folytatható feltöltése. |
| Fejlett share-link kezelés | Value | Később | Visszavonás, hozzáférési limit és analitika. |
| Thumbnail és transzkódolás | Value | Később | Optimalizált médiaélmény. |
| Cloud deployment AWS-re vagy OCI-ra | Productization | Később | Publikusan elérhető felhőkörnyezet. |
| Integration, contract és e2e tesztek | Productization | Később | Komponensek közötti és teljes rendszerű bizonyíték. |
| CI/CD és monitoring dashboard | Productization | Később | Automatizált kiadás és üzemeltetési láthatóság. |

## MVP-egyensúly

Az MVP nyolc közvetlen értéket adó és hét termékesítési képességet tartalmaz. Ez biztosítja, hogy a projekt ne csak látványos fájlfeltöltő demó legyen, ugyanakkor a későbbi képességek ne növeljék kezelhetetlenre az első kiadás scope-ját.
