# ADR-011: Idempotent upload confirmation and quota reservation

**Részben implementált: upload-init, tartós dedupe és kvótafoglalás; confirm és őrzött cleanup implementált, de íráslezárási proof nélkül nincs fizikai release.**

## Status

Accepted

## Date

2026-07-12

## Implementation status

A Core és UploadOperation séma/migráció létezik; a POST files/uploads/init service/végpont implementált user-szintű zárolással, atomikus reservationnel és tartós replay-jel. Init replay a confirm-határon tartós EXPIRED állapotot ír, foglalást nem old fel. A confirm és őrzött cleanup is implementált; a fizikai release provider-proofja, receipt-pruning és import/processor továbbra is nyitott.

## Context

Presigned feltöltésnél az init és a bináris upload között idő telik el. Párhuzamos init kérések túlléphetik a kvótát, a kliens megismételheti a confirmot, az invalid vagy abandoned object pedig metadata- és storage-inkonzisztenciát okozhat.

## Decision

- Init tranzakcióban `PENDING_UPLOAD` rekord és `reservedStorageBytes` foglalás készül.
- A pending rekord a presigned URL lejárata után rövid confirm-grace idővel rendelkezik.
- Confirm csak a tulajdonos pending fájljára fut, és `HEAD` + bounded range validationt végez.
- Az első sikeres confirm tranzakcióban `ACTIVE` állapotot állít, csökkenti a reservationt és növeli a used számlálót.
- Aktív fájl ismételt confirmja sikeres, ugyanazt a reprezentációt adó no-op; számláló nem változik.
- Lejárt pending rekord objektum nélkül eltávolítható és felszabadítható.
- Invalid vagy abandoned objektum esetén delete szükséges; delete-hibánál a rekord és reservation retry-ig megmarad.
- A cleanup végrehajtási technológiája nincs most kiválasztva; az üzleti szabály technológiafüggetlen.

## Alternatives considered

- Reservation nélkül csak confirmkor kvótaellenőrzés: párhuzamos feltöltések rossz UX-et és felesleges storage-adatot okozhatnak.
- Minden initkor pending rekordok `SUM` lekérdezése: csökkenti a számlálók számát, de concurrency kezelése kevésbé egyértelmű.
- Nem idempotens confirm: egyszerűbb, de retry esetén dupla accounting kockázat.
- Azonnali reservation release cleanup-hibánál: kvóta-megkerülésre és árva objektumokra adna lehetőséget.

## Consequences

- A kvóta pending uploadokra is konzisztensen érvényesíthető.
- Cleanup-hiba ideiglenesen foglalhat tárhelyet; ezt megfigyelhetővé és retry-képessé kell tenni.
- Az állapot- és számlálómódosításokat egy tranzakcióban kell végrehajtani.
- Későbbi reconciliation szükséges lehet drift és operációs hiba esetére.

## Verification

- Unit teszt konkurens init, limit boundary és rollback esetére.
- Unit teszt ismételt, párhuzamos és lejárt confirmra.
- Unit teszt object-not-found, invalid type, cleanup success/failure és counter invariánsokra.

## Első képszelet kiegészítése – 2026-10-20

Az [API-szerződés](../../03_design/api.md#upload--első-képfeltöltési-szelet-tervezett) az initet is idempotenssé teszi: kötelező ownerhez és init művelethez kötött UUIDv4 kulcs, normalizált payload-azonosság, konfliktusnál 409. A dedupe, a kvótafeltétel, pending létrehozás és foglalás ugyanazon DB-tranzakció invariánsai. A presign előkészítése után csak sikeres commitra adható ki URL; ismeretlen commit-kimenetel ugyanazzal a kulccsal tisztázható. A sikeres művelet tartós azonossága legalább 24 óráig, és minden nyitott upload-jog/írás/cleanup lezárásáig megmarad. A pontos entitás-/állapotszerződés a 2026-10-23-i adatmodell-kiegészítésben szerepel; a séma és SQL-migráció implementált, a tranzakciós service továbbra is külön feladat.

Replay nem hosszabbítja meg az 5 perces PUT-jogot vagy 15 perces confirm-ablakot; aktív fájl nem kap új PUT-jogot. Confirm végső tranzakciójában is pending és `now < confirmBy` feltétel szükséges. Saját ACTIVE no-op, SOFT_DELETED nem reaktiválható. Konkurens confirmokból csak egy mozgathatja a reserved bájtokat a used számlálóba; a cleanup előbb kizárja az aktiválást.

A korábbi object-not-found/delete utáni release szabály **szükséges, de nem elégséges**: ki kell zárni, hogy korábban kiadott PUT később objektumot hozzon létre. Élő jog, in-flight írás vagy ennek bizonytalansága esetén a foglalás megmarad. A storage-oldali íráslezárás és az aktív objektum felülírásának kizárása az adapter implementáció előtti kapuja. A kliensnek adott 410/413/422 nem állít automatikusan sikeres cleanupot vagy már felszabadult kvótát.

## Első upload-adatmodell döntése – 2026-10-23

A [részletes szerződés](../../03_design/data_model.md#első-képfeltöltés-adatmodell-szerződése--2026-10-23) egy UploadOperation companion rekordot választ; a séma/migráció implementált, az init/confirm implementált, a fizikai cleanup/release továbbra is bizonyítási kapu mögött marad. A fájl életciklusa és a feltöltési művelet OPEN/FINALIZED/REJECTED/EXPIRED állapota külön marad. A normalizált payload verziózott fingerprintje, unique owner+init-kulcs és owner/file FK köti a retry-t ugyanahhoz a fájlhoz. A foglalás élő, amíg OPEN, vagy sikertelenül lezárt és release-ideje null; a PENDING_UPLOAD státusz önmagában nem bájtelszámolás.

A sikeres confirm és a hibás/lejárt lezárás kölcsönösen kizáró, végleges átmenet. A cleanup a terminális hiba után futhat; a release-jelző és a reserved-levonás egy commit, ezért ismételt delete/cleanup nem számol kétszer. Külön queue/lease/foglalástábla nem kell ehhez a szelethez. A tranzakciók user→file→operation zárolási rendet követnek, storage I/O nem fut SQL-zár alatt.

A receipt legalább 24 óráig, ezen túl is minden nyitott írás/foglalás lezárásáig él; a sikertelen FileObject metadata addig vele marad. A Restrict kapcsolat így nem veszti el a replay okát cleanup után. Sikeres fájlnál később csak a receipt törölhető, a fájl és used megmarad. A writesClosedAt csak bizonyított storage-lezárásról szól; nem helyettesíti a továbbra is nyitott provider-bizonyítást.

Alternatívák: minden mező FileObjectre tétele összekeverné a fájl- és a műveletmegőrzést; csak folyamatmemóriás dedupe nem él túl restartot; új CLEANING állapot és worker lease a terminális, idempotens cleanuphoz most indokolatlan többlet. A választott companion tábla kis séma-/tranzakciós többletért cserébe külön receipt-életciklust ad. Ellenőrzés: állapotmátrix, dupla init/confirm/release és crash-esetek review-ja; majd külön implementációs unit és tényleges provider/DB-bizonyíték. Ez a döntés csak dokumentált, nincs séma- vagy runtime-változás.

Az init presignje DB-záron kívül fut, de minden válasz tranzakciós állapot-/deadline-újraellenőrzés után adható ki. A 3s lock_timeout / 4s statement_timeout lokális tranzakciós beállítás; 5s Prisma transaction timeout mellett a feloldhatatlan konkurencia biztonságos 503. Valós párhuzamos és rollback-bizonyíték a tesztriportban. A writesClosedAt kapu változatlanul nyitott, nincs automatikus release.

A confirm 2026-10-24-én implementált: provider-I/O a DB-zárakon kívül, majd User→FileObject→UploadOperation újraellenőrzés, ACTIVE/FINALIZED és reserved→used + egyetlen audit egy tranzakcióban. A cleanup OPEN-t lejárttá tesz, de writesClosedAt nélkül sem objektumot, sem számlálót nem érint, csak retry-metaadatot ment. A proof-függő delete/HEAD/release út kizárólag szintetikus proof-fixture-rel unit tesztelt; a jelenlegi adapterrel ténylegesen blokkolt. A single-PUT íráslezárási kapu nem oldódott meg ettől az implementációtól.

A jövőbeli provider-proofnak a bucket verziózását is rendeznie kell: ez a modell az eredeti, nem verziózott helyi bucketre épül. Verziózott S3 bucketben egy egyszerű DeleteObject/HEAD404 nem igazolja a korábbi verziók fizikai eltűnését; ilyen targetre nincs verzióérzékeny cleanup implementálva. A jelenlegi proof nélküli worker erre sem ad release-jogot.
