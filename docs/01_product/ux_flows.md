# Fő UX-folyamatok

**Részben implementált: login/logout, védett fiókoldal és backend auth; regisztrációs UI loading/hiba/siker állapotokkal is létezik; az első képköteg init/PUT/confirm felülete is implementált; a képgaléria/nagy előnézet implementált, valódi resume és többi termékfolyamat tervezett.**

## Közös UX-szabályok

- Minden fontos képernyő külön kezeli az első betöltést, további adatok betöltését, üres állapotot, sikert és hibát.
- A hibaüzenet elmondja, mi történt és mit tehet a felhasználó, de nem tartalmaz stack trace-t, tokent, presigned URL-t, storage keyt vagy belső szolgáltatásrészletet.
- A frontend visszajelzése nem helyettesíti a backend authorizationt, kvótaellenőrzést vagy fájlvalidációt.
- Oldalfrissítés vagy másik backendpéldány nem szakíthatja meg a perzisztált többlépéses folyamatot; a tervezett backend stateless.
- A fontos auth-, upload-, lifecycle-, sharing- és security eseményekhez alap audit esemény készül, külön audit UI nélkül.
- A három core folyamat MI-szolgáltatás nélkül is teljes értékűen használható.

## Megvalósított auth-szelet

A publikus kezdőlap „Saját fiók” linkje `/app`-ra vezet. Az alkalmazás munkamenet-ellenőrzési állapotot mutat, fiókadat nélkül, és `GET /auth/me`-t kér. 401 esetén `/login`; a belépés hibáját az űrlap jelzi, jelszóürítéssel és újrapróbálással. Siker után új `/me` ellenőrzés igazolja a szerveroldali állapotot, majd megjelenik a saját név/email és logout. A név szövegként renderelt, nem HTML. A publikus `/register` oldalon név, email, jelszó és megerősítés adható meg. Legalább 15 Unicode-karakter és legfeljebb 1024 UTF-8 bájt a regisztrációs jelszó. Mezőhiba helyben, 409/400/429/kiesés biztonságos üzenettel javítható; pending alatt az inputok és submit tiltottak, státuszüzenet jelenik meg. Siker esetén az űrlap helyén visszajelzés és login link van, auto-login nélkül. Login és regisztráció egymásról és a kezdőlapról is elérhető; nincs személyes adat a navigáció URL-jében.

Hálózati/szerverhiba esetén `/auth-unavailable` oldal jelenik meg „Újrapróbálás” linkkel; ez nem hitelesítési elutasítás. Logout sikertelen kérése hibát hagy a fiókoldalon; csak 204 után navigálunk loginra és ürül a publikus profil memóriája. Minden védett navigáció új szerveres ellenőrzés; nincs tartós kliensoldali login flag vagy token. A tétlen oldal nem pollol/cross-tab szinkronizál, a backend minden kérésnél önállóan véd. E szelet nem galéria, usage vagy teljes UX-01 upload.

## Megvalósított első képköteg-felület – 2026-10-24

A védett `/app` oldalon legfeljebb 20 JPEG/PNG/WebP/GIF választható (100 MiB/fájl, szigorítható szerverlimittel), majd explicit indítás után két párhuzamos worker dolgozik. A fájlsorok állapota: várakozik → előkészítés → feltöltés/progress → ellenőrzés és véglegesítés → siker vagy hiba. Csak a backend ACTIVE eredménye siker; 100% csak átviteli információ. Az összesítő külön mutatja a kész és hibás sorokat. Fájlnév szövegként renderelt; a hiba biztonságos magyar üzenet. Egy hibás fájl mellett a többi dolgozik tovább.

Az átmeneti hiba kézi, 1–30 másodpercig növekvő várakozású retry-t kap; 429 legalább 60 másodperc, elérhető Retry-After esetén annál hosszabb is lehet. Ismeretlen init-kimenetel ugyanazon kulccsal ismétlődik. Ismeretlen PUT-kimenetel és confirm-hiba után előbb az eredeti fileId confirmja történik; teljes újraküldés csak UPLOAD_NOT_READY és élő eredeti PUT-jog esetén. A kész fájl nem indul újra, terminális hiba nem retry-képes. AUTH_REQUIRED után új fájl nem indul és login link látszik. Aktív kérés alatt a kijelentkezés tiltott, folyamatjelzéssel; hibás logout nem tünteti el a helyi köteget.

Ez az első képszelet, nem tartós import. Az állapot csak az oldal memóriájában él, frissítés/navigáció elveszíti. Komponenselhagyás abortálja a klienshívásokat, nem ígér szerveroldali cancel-t vagy kvótafelszabadítást. A UI figyelmeztet a megmaradó reservationre. A storage upload kizárólag másik originre, cookie nélkül történik. Galéria, preview, processor és bájtszintű resume nincs ebben a szeletben. A lenti UX-01 teljes célfolyamata és a böngészős/DB/storage bizonyítás még nyitott.

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

## Első képgaléria és előnézet – tervezett UI-szelet, 2026-10-27

A GET /files backend-lista már implementált; a preview API is implementált; a fájlnév/méret/dátum metaadatgaléria is implementált; a képek betöltése és az előnézeti felület is implementált; a részletes [lista/preview szerződés](../03_design/api.md#fájllista-és-lifecycle) az irányadó. A lenti UX-02 teljes célfolyamatából most csak a saját ACTIVE képek megjelenítése és jogosított eredeti előnézete implementált. Videó, letöltés/megosztás és thumbnail-generálás nem része ennek a szeletnek.

| Állapot | Elvárt felületi viselkedés |
|---|---|
| Első betöltés | Loading jelzés, érzékeny/előző fiókból maradt kártyák nélkül. A lista JSON metaadatokat kér, storage-URL-eket nem. |
| Üres első oldal | „Még nincs feltöltött képed” és elérhető feltöltési művelet; nem hiba és nincs További képek gomb. |
| Sikeres lista | Escape-elt fájlnév, méret és createdAt; stabil rendezés és ID-alapú dedupe. Kártyánként külön képbetöltési állapot. |
| Következő oldal | Csak hasNextPage=true esetén További képek, az előző nextCursorral. Futás alatt tiltott ismételt kattintás, a meglévő képek láthatók maradnak. |
| Lista/folytatás hiba | Érthető magyar hiba és kézi retry; folytatás ugyanazzal a cursorral, meglévő kártyák megtartásával. Üres folytatási oldal lezárja a lapozást. |
| CURSOR_INVALID | Az addigi kártyák maradnak, de nem ismételjük végtelenül a rossz tokent; „Lista frissítése” új első oldalt és lapozási láncot kér. |
| Preview betöltés | Csak látható kártyához/megnyitott képhez kér rövid URL-t, legfeljebb négy párhuzamos URL-lekéréssel. Eredeti képfájl megjelenítése szükség szerint/lazy módon; ez nem thumbnail. |
| Preview-/képhiba | A többi kártya működik; a fájlnév/metadata megmarad, kézi Újrapróbálás elérhető. Nincs raw XML/URL vagy automatikus végtelen presign-hurok. |
| Lejárt URL | Memóriában expiresAt szerint már lejárt jogot nem használ újra; szükséges újramegjelenítésnél egy új jogosított URL-kérés indul. Ugyanazon megnyitás ismételt hibája után csak kézi retry; a már kirajzolt képet pusztán az óra miatt nem kell eltüntetni. |
| 404 / 415 preview | Nincs hozzáférés/nem támogatott előnézet; nincs automatikus retry. 404-nél lista frissíthető, 415-nél a metadata és magyarázat marad. |
| 429 / 503 | Egyértelmű várakozás/átmeneti hiba; 429-nél olvasható Retry-After szerint tiltott retry (hiányában 60 másodperc). Már látható kártyák megmaradnak. |
| Session/fiókváltás | 401 után profil, lista és memóriabeli signed URL-ek ürülnek, login szükséges. Késői válasz nem töltheti vissza a korábbi user képeit. |
| Frissítés/feltöltés (automatikus változat még tervezett) | Sikeres ACTIVE confirm után összevont listafrissítés az első oldalról, új cursorlánccal. A régi lánc nem folytatható az új első oldal mögött. |

Nagy előnézet kattintásra/Enter/Space-re nyílik natív modális dialógusban; külön loading/error/close, Escape, kezdő és visszatérő fókusz implementált. Kizárólag képként renderelünk, nem HTML/iframe-ként. Signed URL csak memóriában él, storage GET külön originre crossorigin=anonymous és referrerpolicy=no-referrer mellett megy. Komponenselhagyáskor az API-kérések abortálódnak és a késői válaszok figyelmen kívül maradnak. Az oldalhagyás/logout nem vonja vissza a már kiadott tárolójogot; azt a legfeljebb ötperces TTL korlátozza.

A későbbi thumbnail-processor aszinkron, verziózott derived képet készít majd saját quota/ownership/lifecycle szabályokkal. A mostani eredeti-preview sikere nem processor-siker; nincs job-polling, thumbnail státusz vagy új derived állomány.

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

## Hibás kiterjesztés javítása az első képszeletben – 2026-10-27

A kiválasztott kép típusa a tartalom fejlécéből dől el. Az eredeti név a sorban marad; szükség esetén külön szöveg jelzi például: „A felismert formátum JPEG. Feltöltési név: kep.jpg. A képtartalom nem változik.” A feltöltés a javított névvel/típussal megy tovább, átnevezést vagy konvertálást nem kér a felhasználótól. Ismeretlen tartalom vagy nem olvasható fájl helyi hibát kap, a többi fájlt nem állítja le. Ez nem teljes képintegritás-ellenőrzés; a backend az aktiválás előtt önállóan validál.

## Megvalósított metaadatgaléria – 2026-10-28

Belépés után a `/app` a saját képek fájlnevét/méretét/létrehozási idejét kártyákon jeleníti meg, első loading, üres és magyar error/retry állapotokkal. További képek cursorral, ismételt kattintás ellen védve érkeznek, ID-dedupe mellett. Lapozási hiba alatt a kártyák maradnak; retry ugyanazt az oldalt kéri. Invalid/looping cursornál magyarázat és elsőoldalas újrakezdés, 429-nél várakozás; nincs automatikus hurok. A Lista frissítése új láncot indít, az addigi kártyák csak sikeres válaszkor cserélődnek.

401-re a lista és profil ürül, login szükséges. Fiókváltás új komponenspéldányt ad a galériának és a feltöltőnek; korábbi account késői válasza nem tölti vissza az adatokat. Kijelentkezési kérés alatt a galéria vezérlői tiltottak, hiba esetén a köteg/kártyák nem tűnnek el. Feltöltés után kézi listafrissítés használható; a sikerhez kötött automatikus frissítés külön későbbi lépés. A kártyák láthatóság alapján eredeti képet töltenek, nagy előnézetet nyitnak. Négy URL-kérés futhat párhuzamosan; hiba után kézi retry szükséges. A confirmhoz kapcsolt automatikus frissítés továbbra is tervezett.

A sikeres kézi listafrissítés a preview-hibákat is feloldja; a már használható képek megmaradnak. IntersectionObserver hiányában megnyitáskor kérünk képet. Képbetöltési hiba külön üzenet, nincs automatikus megújítás. A valódi viewport/keyboard/CORS elfogadás még nem igazolt.
