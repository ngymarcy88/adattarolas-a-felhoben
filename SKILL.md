---
name: cloudvault-thesis
description: Plan, implement or review CloudVault thesis work against the supervisor's SZD2 requirements, including resumable batch import, restart-safe image processing, measurements and submission evidence. Use within the Adattárolás a felhőben project; documentation requests remain documentation-only.
---

# CloudVault szakdolgozati munkafolyamat

## Belépés és hatókör

A skill az **Adattárolás a felhőben / CloudVault** projekt 2026. októberi témavezetői elvárásait alkalmazza. Magyarul kommunikálj; azonosítók, fájlnevek és commitok maradjanak angolul.

A fájl a felhasználó kérésére a projekt gyökerében található. Az `AGENTS.md` hivatkozása alapján olvasandó projektútmutató; ez az elhelyezés önmagában nem biztosít automatikus skill-felderítést. Olvasd el az itteni [AGENTS.md](AGENTS.md), [README.md](README.md), [terv](docs/plan.md) és [mérföldkövek](docs/milestones.md) releváns részeit, majd a feladathoz szükséges szerződéseket. A parancsokat a tényleges repógyökérhez viszonyítsd.

- Tervezés, dokumentáció vagy review esetén maradj ebben a hatókörben.
- Implementációs kérésnél egy bemutatható, ellenőrizhető szeletet készíts; kövesd az AGENTS.md stack-, biztonsági és engedélyezési szabályait.
- A skill nem engedélyez levelezést, publikálást, cloud deploymentet, új nagy függőséget vagy teljes projektátírást.
- A tanári elvárás célállapot; nem bizonyíték arra, hogy a funkció már elkészült vagy a hallgató elfogadta az ütemezést.

## Források és eltérések kezelése

Az alábbi utak a repó gyökeréhez képest értendők. A nyers források a repó melletti szakdolgozat mappában találhatók, ezért külön klónozáskor hiányozhatnak:

| Forrás | Szerep |
|---|---|
| `../emails/01-email.txt` | Korábbi storage MVP, életciklus, skálázhatóság és opcionális MI |
| `../emails/02-email.txt` | Október 13-i irány: folytatható köteg, két feldolgozó, recovery és mérés |
| `../emails/03-email.txt` | Kiegészítés: teljes alkalmazás, egységes UX és párhuzamos dolgozatírás |
| `../coospace/coospace-szakdoga-2.txt` | Általános SZD2 munkarend, dokumentáció, UAT, telepítés és leadási csomag |
| `../docs/Szakdolgozoi_leadando_AI_termekminoseg_dokumentacios_kovetelmenyek_v1_2.txt` | Korábbi részletes minőségi/pontozási keret |
| `../docs/Szakdolgozoi_MI_Eszkoztar_v1.txt` | MI-munkafolyamat és fejlesztési útmutató |
| `../01_Bancsics Eszter - Lovarda menedzsment webalkalmazás.pdf` | Tartalmi és szemléltetési példa |

Hiányzó nyers forrás esetén az alábbi összefoglalóval lehet dolgozni, de jelezd, ha az eredeti tartalom ellenőrzése szükséges. A TXT-kből ne találj ki levélfejlécet, elküldött választ vagy újabb jóváhagyást. Ne másold személyes levelek teljes tartalmát vagy kapcsolattartási adatait a repóba.

A felhasználó legfrissebb explicit utasítását kövesd. Az októberi célkövetelményeket az AGENTS.md, a friss terv és a roadmap rögzíti; a részletes szerződésekben megmaradt júliusi single-PUT-only és thumbnail-Later állítások eltérését nevezd meg, majd csak az engedélyezett feladatban frissítsd az érintett dokumentumokat. A terv dokumentációs átvezetési táblája jelzi a nyitott részeket. Az új cél nem választ automatikusan átviteli protokollt, queue-t vagy függőséget.

## Elvárt termékeredmény

### Teljes alapalkalmazás

Regisztráció, be-/kijelentkezés, védett saját fájlkezelés, kép-/videófeltöltés, galéria és előnézet, letöltés, időkorlátos megosztás, soft delete, 30 napos restore és következetes tárhelyelszámolás együtt alkosson használható felületet. A hozzáférést a backend ellenőrizze. A frontend nem kaphat tartós storage credentialt.

A rögzített stack Vue 3/Vite/TypeScript/Tailwind és NestJS/Prisma/PostgreSQL, helyben MinIO. A bináris adat és a relációs metaadat külön tárolandó, storage adapterrel. Őrizd meg a kvótafoglalás, validált és idempotens confirm, rövid jogosultságok és biztonságos megosztás invariánsait.

### Központi mérnöki hozzájárulás

| Képesség | Elfogadási bizonyíték |
|---|---|
| Kötegelt import | Egy import több fájlt kezel, fájlonként látszik az állapot és előrehaladás; hibás fájl nem állítja le a többit |
| Valódi folytatás | A kész fájlok megmaradnak; a félbemaradt átvitel a már átvett adatoktól folytatódik, mérhető újraküldéssel |
| Idempotencia | Import-, confirm- és job-ismétlés nem hoz létre másolatot vagy dupla tárhelyterhelést |
| Két képfeldolgozó | Előnézeti kép és elérhető képadatok, például képméret és készítési idő; a hiányzó adat szabályos eredmény |
| Bővíthetőség | Közös processor interfész, azonosítható verzió és eredmény; egy további processor nem igényli az upload átírását |
| Hibák elkülönítése | A sikertelen feldolgozó külön újrapróbálható; az eredeti és a sikeres másik eredmény használható |
| Tartós állapot és recovery | Worker-újraindítás után a befejezett munka megmarad, az elakadt munka helyreállítható |
| Konzekvens storage-kezelés | Eredeti és származtatott objektumok kvótája, jogosultsága, törlése és visszaállítása dokumentált és ellenőrzött |

A többfájlos picker, az egész fájl újraküldése és az idempotens confirm külön-külön nem teljesítik a folytatható import követelményét.

A supervisor Uppy/tus vizsgálatát javasolja, nem kötelező implementációt. A tus és az S3 multipart külön megoldás. Rövid PoC és ADR alapján válassz illesztést; ne találj fel saját átviteli protokollt. Rendezd a session/jogosultság lejáratát, megújítását, párhuzamosságot, kvótafoglalást és részleges adatok takarítását is.

Egyszerű alkalmazás + meglévő adatbázis/object storage + háttérfeldolgozó elegendő. Felhasználó által telepíthető plugin, pluginpiactér és videotranszkódolás nem része a vállalásnak. Offline előkészítés, nagy videók tartós böngészőtárolása, nagyvállalati elosztott platform és fizetős cloud nem automatikus követelmény.

Az MI-metaadat-javaslat opcionális, későbbi processor lehet. Külön felhasználói döntés, provider-adatkezelési/licencellenőrzés és emberi accept/edit/reject szükséges; nem késleltetheti a magot. Arcfelismerés, biometria és érzékeny tulajdonságok következtetése tiltott. A fejlesztési MI használata ettől külön dokumentációs kérdés.

## Feladathoz igazított végrehajtás

1. Ellenőrizd a tényleges fájlokat, Git-állapotot és elérhető futtatási parancsokat. Különítsd el a tervezett, implementált és futtatással igazolt állapotot.
2. Fogalmazd meg a kért szelet felhasználói eredményét és elfogadási feltételeit. Ha hiányzik az új import-/processing-szerződés, a feladat hatókörében azt egészítsd ki; kerüld az általános dokumentáció újraírását.
3. Implementációkor a szükséges UI → backend → adatbázis/storage → feldolgozás láncot kezeld. Az üzleti logikát unit teszteld; a nagyobb teszt/CI-fázist az AGENTS.md szerinti felhatalmazással indítsd.
4. A módosított viselkedéshez frissítsd az API-t, adatmodellt, ADR-t, traceabilityt és biztonsági/tesztdokumentációt, amennyiben érintettek. Ne deklarálj nem futtatott tesztet sikeresnek.
5. A feladat végén add meg az eredményt, az ellenőrzést, korlátokat és a kézzel review-zandó döntéseket. A fontos MI-hozzájárulásról append-only bejegyzés kerüljön a [Prompt Logba](docs/07_ai/prompt_log.md) és a [Verification Logba](docs/07_ai/verification_log.md).

## Mérés, tesztelés és UAT

A szakdolgozat központi összehasonlítása: újrakezdő és folytatható upload azonos képcsomagokon, azonos hálózati feltételekkel. A javasolt méretek 10 és 50 saját, nem érzékeny kép; ez kiindulás, nem merev darabszámkövetelmény.

- Próbáld megszakítás nélkül, előre rögzített hálózati megszakítással, worker-újraindítással és sérült képpel.
- Mérd a helyesen elkészült eredeti fájlok és processor-eredmények számát, az újraküldött adatot és a teljes időt. Határozd meg a mérés pontos határait; ne találj ki eredményt vagy elvárt gyorsulást.
- Ellenőrizd a tényleges DB/storage állapotot, egyediséget és tárhelyelszámolást; a UI sikerjelzése nem elegendő.
- Rögzíts verziót, dátumot, környezetet, bemenetet, lépéseket, elvárt/tényleges eredményt és bizonyítékot. Ismételd a kontrollált próbákat annyiszor, hogy a következtetés védhető legyen.
- A célfelhasználói próbákban dokumentáld a résztvevők szerepét személyes azonosítók nélkül, feladatokat, visszajelzéseket, javításokat és újratesztelést. Saját fejlesztői ellenőrzés nem külső UAT.

A végső bizonyítás terjedjen ki az üzleti szabályokra, komponensek együttműködésére és fő felhasználói folyamatokra, negatív esetekkel is. A régi v1.2 anyag 30+ tesztet, tesztmixet és CI-t is tárgyal; a frissebb Coospace az érdemi bizonyítékot helyezi előtérbe. Ne nyilvánítsd automatikusan eltöröltnek a korábbi feltételeket vagy véglegesnek a unit-only fázist; a konkrét végső kapu egyeztetendő.

## Dolgozat és átadás

A fejlesztéssel párhuzamosan írd a problémát, követelményeket, alternatívákat, saját döntéseket, működést, ellenőrzést és korlátokat. A repó szakmai dokumentációja és az önállóan érthető dolgozat együtt szükséges. Kövesd a KISS/LEAN elvet: témák lefedése kell, nem témánként új fájl vagy üres sablon.

A mintadolgozat saját oldalszámai szerint: 13–18 GUI/UX; 34–38 adatmodell és folyamatok; 44–45 fejlesztési MI; 52–57 további képernyők. A PDF fizikai lapjai kettővel nagyobbak. Ez tartalmi példa, nem kötelező forma vagy a jelenlegi teszt/UAT/telepítési elvárások helyettesítője.

Valós képernyőképeket adj számmal, címmel, szöveges hivatkozással és rövid működésmagyarázattal. Mutasd az import, részleges siker, hiba és folytatás állapotait is; érzékeny adat nélkül.

A végső csomagban legyen működő, egyeztetett környezetben telepített alkalmazás, azonosított végleges commit/kiadás, kipróbált telepítési és használati útmutató, szakmai dokumentáció, tényleges teszt/mérési/UAT-eredmények és témavezető által véleményezett, javított dolgozat-PDF. Tiszta környezetes, lehetőleg másik gépes telepítési próba szükséges; helyi környezet is elfogadható. Minden artefakt ugyanazt a szoftverállapotot mutassa.

Az MI-fejezetben konkrét eszközöket, feladatokat, elfogadott/módosított/elvetett javaslatokat, hibákat, ellenőrzéseket és a hallgató saját hozzájárulását mutasd be. Naplózz röviden, titkok és teljes beszélgetésarchívum nélkül.

## Ütemezési pillanatkép és nyitott egyeztetések

Az alábbiak **2026-os belső ütemezések**, nem automatikusan elfogadott vállalások vagy hivatalos kari határidők:

| Eredmény | Személyes levelek | Közös Coospace |
|---|---|---|
| Állapot, hozzáférés, scope, dolgozatvázlat, teszt/UAT-terv | Folyamatos visszajelzés | Október 2. és 9. |
| Első működő változat és dolgozatrész | Október 23.: belépés, kis képköteg, megjelenítés, első processor | Október 22.: fő folyamatok és első dokumentált telepítés |
| Folytathatóság és recovery | November 6.: resume, két processor, restart recovery a UI-ról | Nincs külön azonos mérföldkő |
| Teljes app, eredmények és teljes kézirat | November 20. | November 13. |
| Javítások, UAT és ellenőrzött telepítés | December 4. | December 4. |
| Belső lezárás | December 11. | December 11. |

Jelezd az október 22/23. és november 13/20. eltéréseket; ne vond össze vagy írd felül őket hallgatólagosan. Az egyéni ütem irányadó voltát és a heti reális ráfordítást a hallgatónak kell egyeztetnie. A tanár kéri a legnehezebb rész és a januári záróvizsga-szándék jelzését is. Ne állítsd a forrásokból, hogy ezeket már elküldte vagy elmulasztotta.

A feltöltött tájékoztatók október 31-i záróvizsga-jelentkezést és december 19-i hivatalos beadást említenek. Aktuális tanulmányi tanácsnál ellenőrizd a [kari naptárt](https://sci.u-szeged.hu/oktatas/naptarak/kari-naptar) és az egyéni/intézeti feltételeket; ne kezeld a snapshotot örökérvényűnek. A repó vagy konzulensi e-mail nem helyettesíti a hivatalos feltöltést.

Érdemi haladásról előkészíthető rövid jelentés: mi változott, repó/commit, bemutatható eredmény, ellenőrzés, aktuális dolgozatverzió, akadály és kért visszajelzés. Küldés csak külön felhasználói utasításra történhet.
