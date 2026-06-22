# Termékvízió

## Státusz

Tervezett termékirány a 2. mérföldkő lezárásához. A dokumentum nem állítja, hogy az alkalmazás funkciói már implementálva vannak.

## Probléma

A képek és videók felhőben tárolása a felhasználó számára egyszerű műveletnek látszik, a háttérben azonban biztonságos hozzáférés-kezelést, metaadat-tárolást, fájléletciklust, kvótakezelést és érthető hibakezelést igényel. A projekt azt mutatja be, hogyan építhető ezekből egy átlátható, tesztelhető és dokumentált webalkalmazás S3-kompatibilis objektumtárolóra.

## Termékvízió

A CloudVault egy személyes cloud media storage webalkalmazás, amelyben a felhasználó saját képeit és videóit biztonságosan feltöltheti, megtekintheti, letöltheti, kezelheti és időkorlátos linken megoszthatja. A rendszer a bináris tartalmat objektumtárolóban, a hozzá tartozó metaadatokat PostgreSQL-ben kezeli, és minden védett műveletnél backend oldali jogosultság-ellenőrzést alkalmaz.

A cél nem egy teljes Dropbox- vagy Google Drive-alternatíva létrehozása, hanem egy szakdolgozati keretek között elkészíthető, termékminőségű MVP, amely végigvezeti a médiafájlok legfontosabb felhasználói és tárolási életciklusát.

## Célfelhasználók

### Persona 1: Anna, személyes médiafelhasználó

- **Helyzet:** telefonon és számítógépen készült képeket, rövid videókat szeretne egy helyen tárolni.
- **Cél:** gyorsan feltölteni, később megtalálni, megnyitni vagy letölteni a saját fájljait.
- **Igény:** egyszerű felület, érthető visszajelzések, látható tárhelykeret és biztonságos alapbeállítások.
- **Fájdalompont:** nem szeretne cloud credentialökkel, bucketekkel vagy technikai storage-beállításokkal foglalkozni.

### Persona 2: Bence, technikailag tudatos megosztó

- **Helyzet:** alkalmanként képeket vagy rövid videókat oszt meg ismerősökkel.
- **Cél:** kontrollálni, melyik fájl érhető el kívülről, és meddig él a hozzáférés.
- **Igény:** időkorlátos megosztási link, egyértelmű tulajdonjog, visszaállítható törlés és kiszámítható tárhelyelszámolás.
- **Fájdalompont:** nem akar nyilvános bucketet vagy tartós, közvetlen object storage URL-t használni.

## Értékajánlat

- A felhasználó egy védett felületen kezelheti saját képeit és videóit.
- A feltöltés és letöltés rövid életű, backend által kontrollált presigned URL-ekkel történhet, hosszú életű storage credential nélkül.
- A tárhelyhasználat és a 30 napig visszaállítható törlés átláthatóvá teszi a fájlok életciklusát.
- Az időkorlátos megosztás nem teszi tartósan nyilvánossá sem a bucketet, sem a fájlt.
- A dokumentált architektúra, validáció és unit tesztelés szakdolgozati szempontból ellenőrizhetővé teszi a megoldást.

## Termékalapelvek

1. **Privát alapállapot:** fájlhoz csak a tulajdonos vagy érvényes megosztási link birtokosa férhet hozzá.
2. **Backend által kontrollált storage-hozzáférés:** a frontend nem tárol S3/MinIO credentialt, és nem dönthet jogosultságról.
3. **Biztonságos fájlkezelés:** a fájltípus, méret és kvóta ellenőrzése nem bízható kizárólag a frontend adataira.
4. **Visszafordítható felhasználói műveletek:** a törlés először soft delete, 30 napos visszaállítási lehetőséggel.
5. **Őszinte dokumentáció:** a tervezett és az implementált képességek minden dokumentumban elkülönülnek.
6. **Fókuszált MVP:** a termék a médiafájlok alapvető életciklusát oldja meg, a nagyvállalati és feldolgozási funkciókat későbbre hagyja.

## Várt eredmény

Az MVP akkor szolgálja a termékvíziót, ha a célfelhasználó regisztrációtól a feltöltésen és megtekintésen át a megosztásig, illetve törlésig és visszaállításig végig tud haladni úgy, hogy más felhasználó fájljaihoz nem kap jogosulatlan hozzáférést.
