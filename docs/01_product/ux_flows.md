# Fő UX-folyamatok

**Tervezett állapot – nem implementált funkcionalitás.**

## Közös UX-szabályok

- Minden fontos képernyő külön kezeli az első betöltést, további adatok betöltését, üres állapotot, sikert és hibát.
- A hibaüzenet elmondja, mi történt és mit tehet a felhasználó, de nem tartalmaz stack trace-t, tokent, presigned URL-t, storage keyt vagy belső szolgáltatásrészletet.
- A frontend visszajelzése nem helyettesíti a backend authorizationt, kvótaellenőrzést vagy fájlvalidációt.
- Oldalfrissítés vagy másik backendpéldány nem szakíthatja meg a perzisztált többlépéses folyamatot; a tervezett backend stateless.
- A fontos auth-, upload-, lifecycle-, sharing- és security eseményekhez alap audit esemény készül, külön audit UI nélkül.
- A három core folyamat MI-szolgáltatás nélkül is teljes értékűen használható.

## UX-01 – Regisztráció, bejelentkezés és megbízható feltöltés

**Fázis:** `Core MVP`

**Kiindulás:** a látogató nincs bejelentkezve.

1. A látogató megnyitja a regisztrációs oldalt, és megadja email-címét, megjelenítési nevét és jelszavát.
2. Sikeres regisztráció után bejelentkezik; a backend alapértelmezetten egyórás JWT-t `HttpOnly`, `SameSite=Lax` cookie-ban kezel, a kliens nem ír tokent `localStorage`-ba.
3. A felhasználó a védett dashboardra jut, ahol üres fájlállapot és a véglegesített fájlok tárhelyhasználata jelenik meg.
4. Kiválaszt egy legfeljebb 100 MB-os, támogatott képet vagy videót.
5. A frontend előzetesen jelzi a nyilvánvaló méret- vagy típushibát, majd upload init kérést küld.
6. A backend ellenőrzi a hitelesítést, kvótát és metaadatokat, pending rekordot hoz létre, a deklarált méretet reservationként lefoglalja, majd alapértelmezetten 5 perces presigned upload URL-t ad.
7. A felület `Feltöltés folyamatban` állapotot és progress jelzést mutat, miközben a böngésző a bináris tartalmat közvetlenül a privát MinIO/S3 tárolóba tölti.
8. A frontend confirm kérést küld. A backend ellenőrzi az objektum tényleges méretét és magic numberét.
9. Sikeres ellenőrzéskor a fájl aktívvá válik, a reservation megszűnik, és a `usedStorageBytes` pontosan egyszer nő.
10. Az első fájllistaoldal frissül, és az új aktív fájl megjelenik.

**Hibautak és helyreállítás:**

- Már használt email vagy hibás űrlap esetén a mezőhöz kötött, javítható hiba jelenik meg.
- Hibás bejelentkezés egységes üzenetet ad, és nem erősíti meg a fiók létezését.
- 100 MB feletti, nem támogatott vagy kvótán túli fájlnál az init elutasítása előtt nem marad upload reservation.
- Presigned URL lejárata, megszakított hálózat vagy bezárt böngésző esetén a rekord pending maradhat, de nem jelenik meg aktív fájlként és nem növeli a végleges használatot.
- A grace időn belül nem confirmolt feltöltés abandoned állapotként cleanupra kerül. Sikeres cleanup feloldja a reservationt; storage-hiba esetén a foglalás megmarad, a folyamat retry-képes, a felhasználó pedig nem kap hamis szabadkapacitást.
- Méret- vagy magic-number eltérésnél a confirm nem aktiválja a fájlt. A UI érthető elutasítást és új fájl választására lehetőséget ad; az objektum cleanupja a pending szabályt követi.
- Ha a confirm sikerült, de a válasz elveszett, a kliens megismételheti ugyanazt a confirmot. Az ismételt kérés ugyanazt az aktív fájlt adja vissza újabb usage-növelés nélkül.
- Oldalfrissítés után a frontend a backend perzisztált állapotából állapítja meg az eredményt, nem lokális memóriára támaszkodik.

**Sikeres végállapot:** egyetlen aktív fájl látható, a reservation rendezett, és a `usedStorageBytes` pontosan egyszer nőtt.

## UX-02 – Cursor-lapozott fájllista, preview, letöltés és megosztás

**Fázis:** `Core MVP`

**Kiindulás:** a felhasználó bejelentkezett és legalább egy aktív fájlja van.

1. A felhasználó megnyitja a fájllistát; az első, korlátozott méretű oldal csak saját aktív fájlokat mutat, determinisztikus `createdAt + id` sorrendben.
2. Ha van további oldal, a felület a backend által visszaadott átlátszatlan cursorral kéri le. A már megjelenített elemek a képernyőn maradnak.
3. A felhasználó kiválaszt egy elemet, és megnyitja annak részleteit.
4. A frontend preview URL-t kér; a backend ellenőrzi a tulajdonjogot és rövid életű read URL-t ad.
5. Engedélyezett kép vagy videó inline megjelenik; más tartalomhoz csak letöltési lehetőség látható.
6. Letöltéskor a backend ismét ellenőrzi a jogosultságot, és biztonságos `Content-Disposition` beállítással ad rövid életű URL-t.
7. Megosztáskor a felhasználó lejárati időt választ, majd linket kér saját aktív fájljához.
8. A rendszer megjeleníti a megosztható URL-t; adatbázisban csak a token hash-e marad meg.
9. Egy kijelentkezett látogató megnyitja a linket. A backend ellenőrzi a tokent, lejáratot és fájlállapotot, majd rövid életű read URL-t ad.

**Hibautak és helyreállítás:**

- Üres listánál nem hibaüzenet, hanem magyarázó empty state és feltöltési művelet jelenik meg.
- További oldal lekérési hibája nem tünteti el a már betöltött elemeket; a felhasználó ugyanazzal a cursorpozícióval újrapróbálhatja.
- Változatlan adathalmaz lapozásakor egy fájl sem maradhat ki és nem jelenhet meg kétszer. A felület az azonosítók alapján sem duplikálhat elemet.
- Más felhasználó fájlazonosítója nem ad metaadatot, preview-t, letöltést vagy share-linket.
- Lejárt preview/download URL esetén a kliens új rövid életű jogosultságot kérhet.
- Preview-hiba nem akadályozza a biztonságos letöltést, ha az egyébként engedélyezett.
- Lejárt, hibás vagy nem aktív fájlhoz tartozó share token egységes, hozzáférést nem adó hibaoldalt eredményez.
- MI-szolgáltatás hibája vagy hiánya ezen a folyamaton semmit nem változtat.

**Sikeres végállapot:** a tulajdonos stabilan böngészte, megtekintette vagy letöltötte saját fájlját, illetve a külső látogató csak az érvényes időablakban érte el a megosztott tartalmat.

## UX-03 – Soft delete és 30 napon belüli restore

**Fázis:** `Core MVP`

**Kiindulás:** a felhasználó bejelentkezett és rendelkezik aktív fájllal.

1. A felhasználó törlést választ, majd megerősíti a műveletet.
2. A backend ellenőrzi a tulajdonjogot, és soft delete állapotot állít be `deletedAt`, illetve 30 nappal későbbi `purgeAfter` értékkel.
3. Ugyanabban a műveletben a fájl korábbi share-linkjei végleg érvénytelenné válnak; raw token nem őrizhető meg visszaállításhoz.
4. A fájl eltűnik a normál listából, és megjelenik a visszaállítható elemek között.
5. A UI jelzi a restore határidejét és azt, hogy a fizikailag tárolt fájl addig továbbra is beleszámít a tárhelyhasználatba.
6. A megőrzési időn belül a felhasználó egyedi restore műveletet indít.
7. A backend ismét ellenőrzi a tulajdonjogot és a retention időt, majd aktív állapotba helyezi a rekordot.
8. A fájl visszakerül a normál, cursor-lapozott listába; a `usedStorageBytes` nem változik, korábbi share-link nem éled újra.

**Hibautak és helyreállítás:**

- Más felhasználó fájlja nem törölhető és nem állítható vissza.
- Már aktív fájl restore-ja és már törölt fájl ismételt törlése stabil, dokumentált eredményt ad, tárhelyszámláló-változás nélkül.
- A 30 nap lejárta után restore akkor sem engedélyezett, ha az automatizált retention purge – amely `Later` képesség – még nem futott le.
- A későbbi purge storage-hibája nem csökkentheti a `usedStorageBytes` értékét, és retry-képes állapotot igényel.
- A törölt fájlhoz tartozó korábbi preview, download vagy share hozzáférés nem újítható meg.
- Restore után a felhasználó csak új share-link létrehozásával teheti ismét publikusan elérhetővé a fájlt.

**Sikeres végállapot:** a fájl a megőrzési időn belül adatvesztés és hibás usage-módosítás nélkül visszaállt.

## UX-04 – Opcionális kép-metaadat-javaslat jóváhagyása

**Fázis:** `MVP+`, nem része a Core MVP-nek

**Kiindulás:** a felhasználó bejelentkezett, és megnyitotta saját, `ACTIVE` állapotú támogatott képét.

1. A felhasználó külön művelettel kéri a metaadat-javaslatot; puszta feltöltés, lista- vagy részletmegnyitás nem indít providerhívást.
2. A UI jelzi, hogy opcionális külső MI-feldolgozás történhet, és csak a szükséges adat továbbítható.
3. A javaslat `PENDING` állapotban készül, majd siker esetén címkékkel, rövid leírással és provenance-információval `READY` állapotban jelenik meg.
4. A felhasználó a javaslatot változtatás nélkül elfogadja, szerkesztve fogadja el vagy elutasítja.
5. Csak kifejezett elfogadás alkalmazhat végleges metaadat-változást; az elutasítás nem módosítja a fájlt.
6. A döntés eredménye követhető, miközben nyers képtartalom, presigned URL vagy szükségtelen személyes adat nem kerül auditnaplóba.

**Hibautak és helyreállítás:**

- Videónál, pending, soft-deleted vagy más felhasználóhoz tartozó képnél a javaslatkérés nem engedélyezett.
- Provider timeout, hiba vagy nem értelmezhető válasz `FAILED` állapotot és érthető újrapróbálási lehetőséget ad.
- Providerhiba nem módosítja a fájl metaadatait, és nem akadályozza a preview-t, letöltést, megosztást, törlést vagy restore-t.
- Arcfelismerés, biometrikus azonosítás vagy érzékeny tulajdonságra vonatkozó javaslat nem jelenhet meg elfogadható eredményként.
- Elutasított javaslat később sem alkalmazható automatikusan.

**Sikeres végállapot:** a felhasználó tudatos döntéssel elfogadta vagy elutasította az opcionális javaslatot; jóváhagyás nélkül nem történt végleges metaadat-változás.
