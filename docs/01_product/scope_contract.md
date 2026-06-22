# MVP scope contract

## Státusz és cél

Ez a dokumentum a tervezett MVP kötelező termékképességeit és határait rögzíti. A felsorolt funkciók még nem tekinthetők implementáltnak; elkészültüket későbbi mérföldkövekben kód, teszt és demonstráció igazolja.

## MVP user story-k és elfogadási kritériumok

### US-01: Regisztráció, bejelentkezés és védett felület

Felhasználóként szeretnék fiókot létrehozni és bejelentkezni, hogy csak én férjek hozzá a saját fájljaim kezeléséhez.

Elfogadási kritériumok:

- Érvényes, még nem használt email-címmel és megfelelő jelszóval új fiók hozható létre.
- A jelszó kizárólag biztonságos hash formájában tárolható.
- Helyes hitelesítő adatokkal a felhasználó beléphet a védett felületre.
- Hibás vagy hiányzó hitelesítés esetén a védett oldal és API-művelet nem érhető el.
- A bejelentkezési hiba nem árulja el, hogy az email-cím vagy a jelszó volt-e hibás.

### US-02: Kép vagy videó feltöltése

Felhasználóként szeretnék képet vagy rövid videót feltölteni, hogy azt privát cloud tárhelyen tárolhassam.

Elfogadási kritériumok:

- Csak bejelentkezett felhasználó kezdeményezhet feltöltést.
- Egy fájl maximális mérete 100 MB; a nagyobb fájl érthető hibával elutasításra kerül.
- Csak dokumentált allowlisten szereplő kép- és videótípus fogadható el.
- A backend ellenőrzi a megadott metaadatokat, a kvótát, majd rövid életű presigned upload URL-t ad.
- A feltöltés véglegesítésekor a rendszer ahol technikailag lehetséges ellenőrzi a tényleges méretet és magic number alapján a fájltípust.
- Csak sikeresen véglegesített feltöltés jelenik meg aktív fájlként és növeli a `usedStorageBytes` értékét.
- Sikertelen vagy félbehagyott feltöltés nem számíthat bele tartósan a tárhelyhasználatba.

### US-03: Saját fájlok böngészése, megtekintése és letöltése

Felhasználóként szeretném látni, megnyitni és letölteni a saját fájljaimat, hogy később is használhassam őket.

Elfogadási kritériumok:

- A normál fájllista kizárólag a bejelentkezett felhasználó aktív fájljait tartalmazza.
- Üres lista, betöltés és hiba esetén külön, érthető UI-állapot jelenik meg.
- Támogatott kép és videó rövid életű, jogosultság-ellenőrzés után kiadott URL-lel megtekinthető.
- A felhasználó saját fájlját biztonságos fájlnévvel letöltheti.
- Más felhasználó fájlazonosítójának ismerete nem ad hozzáférést a metaadathoz vagy a bináris tartalomhoz.
- Veszélyes vagy nem inline megjelenítésre engedélyezett tartalom csak `attachment` módban szolgálható ki.

### US-04: Tárhelyhasználat követése

Felhasználóként szeretném látni a felhasznált és rendelkezésre álló tárhelyet, hogy a kvótámon belül tudjak maradni.

Elfogadási kritériumok:

- A dashboard megjeleníti a felhasznált bájtokat, a teljes kvótát és ezek felhasználóbarát mértékegységét.
- Új feltöltés nem kezdeményezhető, ha annak deklarált mérete túllépné a kvótát.
- A kijelzett használat a denormalizált `User.usedStorageBytes` értékre épül.
- A soft delete alatt álló, fizikailag még tárolt fájl továbbra is beleszámít a használatba.
- A számláló csak sikeres végleges feltöltéskor nő és sikeres végleges purge után csökken.

### US-05: Időkorlátos megosztási link

Felhasználóként szeretnék saját fájlhoz időkorlátos linket készíteni, hogy azt bejelentkezés nélkül is megmutathassam másnak.

Elfogadási kritériumok:

- Csak a fájl tulajdonosa készíthet megosztási linket aktív saját fájlhoz.
- A link kötelező lejárati idővel rendelkezik, és nem tartalmaz közvetlen, hosszú életű S3/MinIO hozzáférést.
- Érvényes token esetén a backend ellenőrzi a link állapotát, majd rövid életű read URL-t ad.
- Lejárt, hibás vagy törölt fájlhoz tartozó link nem biztosít hozzáférést.
- A token adatbázisban visszafejthető nyers formában nem tárolható.
- Linkvisszavonás, hozzáférésszám-korlát és fejlett linkkezelés nem MVP-követelmény.

### US-06: Soft delete és egyedi restore

Felhasználóként szeretném törölni, majd szükség esetén visszaállítani saját fájlomat, hogy egy téves törlés ne okozzon azonnali adatvesztést.

Elfogadási kritériumok:

- Csak a tulajdonos törölheti vagy állíthatja vissza a fájlt.
- Törléskor a rekord soft delete állapotba kerül, `deletedAt` és 30 nappal későbbi `purgeAfter` értékkel.
- A törölt fájl eltűnik a normál listából, de a visszaállítható elemek között megjelenik.
- A megőrzési időn belül a fájl egyedileg visszaállítható, és ismét megjelenik a normál listában.
- Lejárt megőrzési idő vagy végleges purge után a restore nem engedélyezett.
- Soft delete és restore nem módosítja a `usedStorageBytes` értékét.

## Keresztmetszeti MVP-követelmények

- Egységes backend hibaválasz használata stabil hibakóddal, felhasználóbarát üzenettel és belső részletek kiszivárogtatása nélkül.
- Backend oldali ownership- és authorization-ellenőrzés minden védett fájlműveletnél.
- Eredeti fájlnév csak megjelenítési metaadat; storage key nem képezhető közvetlenül belőle.
- HTML, SVG, JavaScript, XML és ismeretlen bináris tartalom nem lehet inline preview-ra engedélyezett.
- A lényegi üzleti logikához backend unit tesztek, frontend logikához indokolt esetben Vitest unit tesztek készülnek.
- Az API-, adatmodell-, security- és tesztdokumentáció együtt változik a későbbi implementációval.

## Technikai és termék-korlátok

- Frontend: Vue 3, Vite, TypeScript és Tailwind CSS.
- Backend: Node.js, TypeScript, NestJS, Prisma és PostgreSQL.
- Lokális objektumtároló: privát MinIO bucket S3-kompatibilis adapteren keresztül.
- A frontend nem tárol object storage credentialt.
- Az MVP egyetlen, legfeljebb 100 MB-os presigned PUT feltöltést használ; multipart upload nincs.
- A visszaállítási idő minden fájlnál egységesen 30 nap.
- Az első tesztelési szint unit teszt; integration és e2e teszt későbbi fázis.

## Dokumentált későbbi lifecycle-szabály

Az automatizált végleges purge nem MVP-funkció. Későbbi implementációja idempotens módon törli majd a bináris objektumot, és csak sikeres storage-törlés után csökkentheti a `usedStorageBytes` értékét. Ez a szabály már most rögzített, hogy a soft delete és a kvótaelszámolás később is konzisztens maradjon.

## Non-goals

- Dropbox- vagy Google Drive-szintű általános fájlkezelés, mappák és komplex jogosultsági hierarchia.
- Multipart upload és 100 MB-nál nagyobb videók támogatása.
- AWS- vagy OCI-cloud deployment és több régiós működés.
- Admin felület, előfizetés és fizetéskezelés.
- Thumbnail-generálás, képfeldolgozás és videótranszkódolás.
- Mobilalkalmazás és valós idejű kollaboráció.
- Tömeges trash-műveletek vagy felhasználónként állítható retention.
- Automatizált végleges purge folyamat az első MVP-ben.
- Megosztási link visszavonása, hozzáférésszám-korlátja vagy részletes analitikája.
- Teljes monitoring dashboard, CI/CD pipeline, integration-, contract- és e2e tesztek ebben a fázisban.

## MVP termék Definition of Done

Az MVP később akkor tekinthető elkészültnek, ha mind a hat user story minden elfogadási kritériuma implementált és igazolt, a fő hibautak felhasználóbarát állapotot adnak, az ownership-szabályokat unit tesztek fedik, a dokumentáció megfelel a tényleges működésnek, és a három dokumentált UX-folyamat manuálisan végigjátszható.
