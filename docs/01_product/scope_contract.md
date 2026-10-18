# MVP scope contract

**Tervezett állapot – nem implementált funkcionalitás.**

## Cél és fázishatárok

Ez a dokumentum a termékvízió és a `Core MVP` elfogadási kritériumainak source of truth dokumentuma. A felsorolt működést később kódnak, unit tesztnek és dokumentált manuális verifikációnak kell igazolnia.

- **Core MVP:** az alábbi hat storage user story és a hozzájuk tartozó keresztmetszeti követelmények.
- **MVP+:** opcionális, kép-only MI-metaadat-javaslat emberi jóváhagyással.
- **Later:** az MVP-ből tudatosan kizárt üzemeltetési, skálázási és médiafeldolgozási bővítések.

## Core MVP user story-k és elfogadási kritériumok

### US-01: Regisztráció, bejelentkezés és védett felület

Felhasználóként szeretnék fiókot létrehozni és bejelentkezni, hogy csak én férjek hozzá saját fájljaim kezeléséhez.

Elfogadási kritériumok:

- Érvényes, még nem használt email-címmel és megfelelő jelszóval új fiók hozható létre.
- A jelszó kizárólag biztonságos hash formájában tárolható.
- Helyes hitelesítő adatokkal a felhasználó beléphet a védett felületre.
- A tervezett, alapértelmezetten egyórás JWT `HttpOnly`, `SameSite=Lax` cookie-ban kerül a klienshez; token nem tárolható `localStorage`-ban.
- Hibás vagy hiányzó hitelesítés esetén a védett oldal és API-művelet nem érhető el.
- A bejelentkezési hiba nem árulja el, hogy az email-cím vagy a jelszó volt-e hibás.
- Kijelentkezés után a védett munkamenet nem használható tovább.

### US-02: Kép vagy videó feltöltése

Felhasználóként szeretnék képet vagy rövid videót feltölteni, hogy azt privát cloud tárhelyen tárolhassam.

Elfogadási kritériumok:

- Csak bejelentkezett felhasználó kezdeményezhet feltöltést.
- Egy fájl maximális mérete 100 MB; a nagyobb fájl érthető hibával elutasításra kerül.
- Csak dokumentált allowlisten szereplő kép- és videótípus fogadható el.
- Az init művelet ellenőrzi a metaadatokat és a kvótát, majd pending fájlrekordot hoz létre, és a deklarált méretet ideiglenesen lefoglalja a felhasználó `reservedStorageBytes` számlálójában.
- A backend rövid életű, alapértelmezetten 5 percig használható presigned upload URL-t ad; a frontend nem kap storage credentialt.
- A confirm művelet object storage `HEAD` ellenőrzéssel validálja a tényleges méretet, és korlátozott range-read alapján magic number vizsgálatot végez.
- Csak sikeres ellenőrzés után válhat a rekord `PENDING_UPLOAD` állapotból `ACTIVE` állapotúvá.
- A sikeres confirm pontosan egyszer csökkenti a reservationt és növeli ugyanazzal a tényleges mérettel a `usedStorageBytes` értékét.
- Az aktív fájlra megismételt confirm ugyanazt a sikeres eredményt adja újabb állapot- vagy számlálómódosítás nélkül.
- Méret- vagy típuseltérés esetén a fájl nem válik aktívvá; az objektum és a reservation csak dokumentált, biztonságos cleanup eredményével rendezhető.
- A confirm nélkül maradt, lejárt pending feltöltést a rendszer abandoned uploadként felismeri, retry-képesen takarítja, és sikeres objektum-cleanup után feloldja a reservationt.
- Pending, hibás vagy félbehagyott feltöltés nem jelenhet meg normál aktív fájlként, és nem növelheti a `usedStorageBytes` értékét.

### US-03: Saját fájlok böngészése, megtekintése és letöltése

Felhasználóként szeretném látni, megnyitni és letölteni saját fájljaimat, hogy később is használhassam őket.

Elfogadási kritériumok:

- A normál fájllista kizárólag a bejelentkezett felhasználó aktív fájljait tartalmazza.
- A lista korlátozott `limit` és átlátszatlan `cursor` használatával lapozható.
- A rendezés determinisztikus a `createdAt + id` kulcspáron; a válasz jelzi a következő cursort és azt, hogy van-e további oldal.
- Változatlan adathalmaz bejárása nem hagy ki és nem ismétel meg fájlt; a lapváltás nem töltheti újra szükségtelenül a már megjelenített elemeket.
- Üres lista, első betöltés, további oldal betöltése és hiba esetén külön, érthető UI-állapot jelenik meg.
- Támogatott kép és videó rövid életű, jogosultság-ellenőrzés után kiadott preview URL-lel megtekinthető.
- A felhasználó saját fájlját biztonságos fájlnévvel és letöltési `Content-Disposition` beállítással letöltheti.
- Más felhasználó fájlazonosítójának ismerete nem ad hozzáférést metaadathoz vagy bináris tartalomhoz.
- Veszélyes vagy inline megjelenítésre nem engedélyezett tartalom csak `attachment` módban szolgálható ki.

### US-04: Tárhelyhasználat követése

Felhasználóként szeretném látni a felhasznált és rendelkezésre álló tárhelyet, hogy a kvótámon belül tudjak maradni.

Elfogadási kritériumok:

- A dashboard megjeleníti a véglegesített fájlok által használt tárhelyet, a teljes kvótát és felhasználóbarát mértékegységüket.
- Új feltöltés nem kezdeményezhető, ha deklarált méretével a `usedStorageBytes + reservedStorageBytes` meghaladná a kvótát.
- A kvótaellenőrzés és reservation létrehozása párhuzamos init kéréseknél sem engedhet túlfoglalást.
- A kijelzett végleges használat a denormalizált `User.usedStorageBytes` értékre épül, nem minden kérésnél végzett teljes fájlösszegzésre.
- A soft delete alatt álló, fizikailag még tárolt fájl továbbra is beleszámít a használatba.
- Soft delete és restore nem módosítja a `usedStorageBytes` értékét.
- A számláló csak sikeres, idempotens confirmkor nő, és csak sikeres későbbi végleges purge után csökken.
- Cleanup-hiba esetén a rendszer nem oldhatja fel tévesen a reservationt és nem jelezhet fel nem szabadult tárhelyet szabadként.

### US-05: Időkorlátos megosztási link

Felhasználóként szeretnék saját fájlhoz időkorlátos linket készíteni, hogy azt bejelentkezés nélkül is megmutathassam másnak.

Elfogadási kritériumok:

- Csak a fájl tulajdonosa készíthet megosztási linket aktív saját fájlhoz.
- A link kötelező lejárati idővel rendelkezik, és nem tartalmaz közvetlen, hosszú életű S3/MinIO hozzáférést.
- Érvényes token esetén a backend ellenőrzi a linket és a fájlállapotot, majd rövid életű read URL-t ad.
- Lejárt, hibás vagy nem aktív fájlhoz tartozó link nem biztosít hozzáférést.
- A token adatbázisban visszafejthető nyers formában nem tárolható.
- Linkvisszavonás, hozzáférésszám-korlát és részletes analitika nem `Core MVP` követelmény.

### US-06: Soft delete és egyedi restore

Felhasználóként szeretném törölni, majd szükség esetén visszaállítani saját fájlomat, hogy egy téves törlés ne okozzon azonnali adatvesztést.

Elfogadási kritériumok:

- Csak a tulajdonos törölheti vagy állíthatja vissza a fájlt.
- Törléskor az aktív rekord soft delete állapotba kerül, `deletedAt` és 30 nappal későbbi `purgeAfter` értékkel.
- A törölt fájl eltűnik a normál listából, de a visszaállítható elemek között megjelenik.
- A megőrzési időn belül a fájl egyedileg visszaállítható, és ismét megjelenik a normál listában.
- A retention lejárata után a restore akkor sem engedélyezett, ha a későbbi fizikai purge még nem futott le.
- Soft delete és restore nem módosítja a `usedStorageBytes` értékét.
- Soft delete végleg invalidálja a fájl minden meglévő share-linkjét; restore után új linket kell létrehozni.
- Ugyanazon állapotmódosító kérés ismétlése nem okozhat kettős tárhelyelszámolást; az eredmény idempotens vagy stabil, dokumentált konfliktus.

## Keresztmetszeti Core MVP-követelmények

- **Stateless backend:** kéréskiszolgáló példány nem tárolhat olyan lokális session- vagy folyamatállapotot, amely nélkül egy másik példány ne tudná folytatni a kéréssorozatot.
- **Idempotens confirm:** hálózati retry és ismételt kérés nem hozhat létre új fájlt, és nem változtathatja többször a reservation vagy usage számlálót.
- **Pending és abandoned upload kezelés:** lejárat, validációs hiba és cleanup-részhiba külön kezelhető, retry-képes állapotot igényel.
- **Cursor pagination:** a normál fájllista determinisztikus `createdAt + id` keyset sorrendet és korlátozott oldalméretet használ.
- **Authorization:** minden védett fájlműveletnél backend oldali ownership-ellenőrzés kötelező.
- **Alap audit UI nélkül:** a fontos auth-, upload-, lifecycle-, sharing- és security események strukturált audit eseményt terveznek; token, presigned URL, jelszó, fájltartalom és szükségtelen személyes adat nem kerülhet bele.
- **Biztonságos fájlkezelés:** eredeti fájlnév csak display metaadat; HTML, SVG, JavaScript, XML és ismeretlen bináris tartalom nem engedélyezett inline preview-ra.
- **Egységes hibaszerződés:** stabil hibakód, felhasználóbarát üzenet és request ID szükséges belső részlet, stack trace vagy secret kiszivárogtatása nélkül.
- **AI-független core:** a hat user story semmilyen MI-provider vagy MI-javaslat elérhetőségétől nem függhet.
- **Vertikális minőség:** minden későbbi feature-szelethez együtt készül a releváns unit teszt, security ellenőrzés és szinkronizált dokumentáció.

## MVP+ – opcionális MI-metaadat-javaslat

Az `MVP+` csak a `Core MVP` stabil működése után kezdhető el, és nem része a hat kötelező user storynak.

- Csak `ACTIVE` állapotú, támogatott képnél kérhető; videó nem tartozik az első MI-scope-ba.
- A felhasználónak minden javaslatot kifejezetten el kell indítania.
- A szolgáltatás címke- és rövid leírásjavaslatot adhat, de az eredeti vagy javasolt metaadatot nem írhatja át automatikusan.
- A felhasználó a javaslatot elfogadja, szerkesztve fogadja el vagy elutasítja.
- Arcfelismerés, biometrikus azonosítás és érzékeny tulajdonság következtetése tiltott.
- Providerhiba, timeout vagy elutasítás érthető, izolált hibát ad; a fájl változatlanul megtekinthető, letölthető és kezelhető marad.
- A provider felé csak a dokumentált célhoz szükséges minimum adat továbbítható, és a provenance adatokat a javaslat mellett meg kell őrizni.

## Technikai és termékkorlátok

- Frontend: Vue 3, Vite, TypeScript és Tailwind CSS.
- Backend: Node.js, TypeScript, NestJS, Prisma és PostgreSQL.
- Lokális objektumtároló: privát MinIO bucket S3-kompatibilis adapteren keresztül.
- A frontend nem tárol object storage credentialt.
- A `Core MVP` egyetlen, legfeljebb 100 MB-os presigned PUT feltöltést használ; multipart upload nincs.
- A visszaállítási idő minden fájlnál egységesen 30 nap.
- Az első tesztelési szint unit teszt; integration, contract és e2e teszt `Later`.

## Later

- Multipart upload és 100 MB-nál nagyobb videók.
- Automatizált retention purge és a választott háttérqueue vagy scheduler technológia.
- AWS- vagy OCI-cloud deployment, több régió és production üzemeltetés.
- Integration, contract és e2e tesztek, valamint CI/CD pipeline.
- Admin felület, előfizetés, fizetéskezelés és komplex jogosultsági hierarchia.
- Mappák, mobilalkalmazás és valós idejű kollaboráció.
- Thumbnail-generálás, képfeldolgozás és videótranszkódolás.
- Share-link visszavonás, hozzáférésszám-korlát és részletes analitika.
- Teljes monitoring dashboard.
- Videók MI-alapú metaadat-javaslata ugyanazon human-in-the-loop és privacy korlátok mellett.

## Kifejezetten kizárt képességek

- MI-javaslat automatikus, emberi jóváhagyás nélküli alkalmazása.
- Arcfelismerés vagy biometrikus azonosítás.
- Érzékeny személyes tulajdonságok következtetése vagy profilalkotás.

## Dokumentált későbbi purge-szabály

Az automatizált retention purge `Later` képesség. Későbbi implementációjának idempotens módon kell törölnie a bináris objektumot; a `usedStorageBytes` csak igazolt storage-törlés után csökkenhet. A core soft delete alatt a fájl továbbra is kvótát foglal. Ez nem azonos a `Core MVP` pending/abandoned upload cleanupjával, amely a soha nem aktivált feltöltéseket rendezi.

## Core MVP Definition of Done

A `Core MVP` később akkor tekinthető elkészültnek, ha:

- mind a hat user story minden elfogadási kritériuma implementált és bizonyított;
- a pending, invalid és abandoned upload hibautak, az idempotens confirm és a cursor pagination igazolt;
- ownership, kvótaelszámolás, fájlvalidáció, soft delete/restore, megosztási lejárat és hibamapping unit tesztekkel fedett;
- a fő UX-folyamatok manuálisan végigjátszhatók;
- az alap audit események érzékeny adat nélkül létrejönnek;
- a dokumentáció megfelel a tényleges működésnek;
- a hat core story MI-provider nélkül is teljesíthető.
