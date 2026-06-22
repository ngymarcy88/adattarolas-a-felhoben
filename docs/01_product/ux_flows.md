# Fő UX-folyamatok

## Státusz és közös szabályok

Az alábbi folyamatok a tervezett MVP képernyő- és rendszerállapotait írják le; még nem implementált működést dokumentálnak.

Minden fontos képernyőn legyen külön betöltési, üres, sikeres és hibaállapot. A hibaüzenet mondja el, mi történt és mit tehet a felhasználó, de ne tartalmazzon stack trace-t, tokent, presigned URL-t vagy belső storage-részletet.

## UX-01: Regisztráció, bejelentkezés és feltöltés

**Kiindulás:** a látogató nincs bejelentkezve.

1. A látogató megnyitja a regisztrációs oldalt, megadja az email-címét, megjelenítési nevét és jelszavát.
2. Sikeres regisztráció után bejelentkezik, majd a védett dashboardra jut.
3. A dashboard megjeleníti az üres fájlállapotot és a tárhelyhasználatot.
4. A felhasználó kiválaszt egy legfeljebb 100 MB-os támogatott képet vagy videót.
5. A frontend előzetesen jelzi a nyilvánvaló méret- vagy típushibát, majd feltöltési kérelmet küld a backendnek.
6. A backend ellenőrzi a hitelesítést, kvótát és metaadatokat, létrehozza a pending fájlrekordot, majd rövid életű presigned URL-t ad.
7. A frontend közvetlenül a privát MinIO/S3 object storage-ba tölti a bináris tartalmat, és folyamatjelzőt mutat.
8. A frontend megerősíti a feltöltést; a backend ellenőrzi és aktívvá teszi a rekordot, majd frissíti a tárhelyhasználatot.
9. A sikeresen feltöltött fájl megjelenik a listában.

**Hibautak:**

- Már használt email vagy hibás űrlap esetén a mezőhöz kötött, javítható hiba jelenik meg.
- Hibás bejelentkezés egységes üzenetet ad, nem erősíti meg a fiók létezését.
- 100 MB feletti, nem támogatott, magic number alapján eltérő vagy kvótán túli fájl elutasításra kerül.
- Presigned URL lejárata vagy hálózati hiba esetén a feltöltés nem véglegesül és újrapróbálható.

**Sikeres végállapot:** az aktív fájl látható, a `usedStorageBytes` pontosan egyszer nőtt.

## UX-02: Fájllista, preview, letöltés és megosztás

**Kiindulás:** a felhasználó bejelentkezett és legalább egy aktív fájlja van.

1. A felhasználó megnyitja a fájllistát, amely csak a saját aktív fájljait mutatja.
2. Kiválaszt egy elemet, és megnyitja annak részleteit.
3. A frontend preview URL-t kér; a backend ellenőrzi a tulajdonjogot és rövid életű read URL-t ad.
4. Engedélyezett kép vagy videó inline megjelenik; más tartalomhoz csak letöltési lehetőség látható.
5. Letöltéskor a backend ismét ellenőrzi a jogosultságot, és biztonságos `Content-Disposition` beállítással ad rövid életű URL-t.
6. Megosztáskor a felhasználó lejárati időt választ, majd linket kér a saját aktív fájljához.
7. A rendszer egyszer megjeleníti a megosztható URL-t; a tárolt token csak hash formájában marad meg.
8. Egy kijelentkezett látogató megnyitja a linket. A backend ellenőrzi a tokent és a lejáratot, majd rövid életű read URL-t ad.

**Hibautak:**

- Más felhasználó fájlazonosítója nem ad metaadatot, preview-t, letöltést vagy share-linket.
- Lejárt preview/download URL esetén a kliens új jogosultságot kérhet.
- Lejárt, hibás vagy törölt fájlhoz tartozó share token egységes, hozzáférést nem adó hibaoldalt eredményez.
- Preview-hiba nem akadályozza meg a fájl biztonságos letöltését, ha az egyébként engedélyezett.

**Sikeres végállapot:** a tulajdonos megtekintette vagy letöltötte a fájlt, illetve a külső látogató csak az érvényes időablakban érte el azt.

## UX-03: Soft delete és 30 napon belüli restore

**Kiindulás:** a felhasználó bejelentkezett és rendelkezik aktív fájllal.

1. A felhasználó törlést választ, majd megerősíti a műveletet.
2. A backend ellenőrzi a tulajdonjogot, és soft delete állapotot állít be `deletedAt`, illetve 30 nappal későbbi `purgeAfter` értékkel.
3. A fájl eltűnik a normál listából és megjelenik a visszaállítható elemek között.
4. A UI jelzi a végleges törlés várható időpontját és azt, hogy a fájl addig beleszámít a tárhelyhasználatba.
5. A megőrzési időn belül a felhasználó egyedi restore műveletet indít.
6. A backend ismét ellenőrzi a tulajdonjogot és a retention időt, majd aktív állapotba helyezi a rekordot.
7. A fájl visszakerül a normál listába; a `usedStorageBytes` nem változik.

**Hibautak:**

- Más felhasználó fájlja nem törölhető és nem állítható vissza.
- Már aktív fájl restore-ja és már törölt fájl ismételt törlése kontrollált, idempotens vagy dokumentált konfliktusválaszt ad.
- A 30 nap lejárta vagy sikeres purge után restore nem engedélyezett.
- Purge storage-hiba esetén a rendszer nem csökkenti a tárhelyhasználatot, és retry-ra alkalmas állapotot tart fenn.

**Sikeres végállapot:** a fájl a megőrzési időn belül adatvesztés és hibás usage-módosítás nélkül visszaállt.
