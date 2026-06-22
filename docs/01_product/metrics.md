# Termékmetrikák

## Státusz

Az alábbi értékek az MVP tervezett sikerkritériumai. Jelenleg nincs futtatható alkalmazás vagy mérési baseline, ezért egyik cél sem tekinthető teljesítettnek. A tényleges eredményeket az implementációs és release mérföldkövekben kell rögzíteni.

## Sikermetrikák

| ID | Metrika | Tervezett célérték | Mérési mód | Bizonyítás időpontja |
|---|---|---:|---|---|
| M-01 | Fő UX-folyamatok feladat-teljesítése | 3/3 folyamat blokkoló hiba nélkül | A `ux_flows.md` lépéseinek manuális végigjátszása két külön felhasználói fiókkal | MVP demo előtti release-verifikáció |
| M-02 | MVP acceptance criteria teljesülése | 100% | A `scope_contract.md` kritériumainak traceability checklistje kód-, teszt- vagy demonstrációs bizonyítékkal | Minden érintett feature mérföldkő és végső MVP review |
| M-03 | Jogosulatlan cross-user hozzáférés | 0 sikeres hozzáférés | Negatív unit tesztek és később manuális ellenőrzés másik felhasználó fájlazonosítójával | Auth-, file- és sharing-mérföldkő |
| M-04 | Tárhelyelszámolás pontossága | 100% a vizsgált upload, soft delete, restore és purge esetekben | Várt és tényleges `usedStorageBytes` összevetése unit tesztekben | Storage usage és lifecycle mérföldkő |
| M-05 | Tiltott vagy hibás fájlok elutasítása | 100% a dokumentált tesztkészleten | Túl nagy, MIME-eltéréses, hibás magic numberű és nem allowlistelt minták unit tesztje | Fájlvalidációs mérföldkő |
| M-06 | Restore helyessége | 100% a megőrzési időn belüli és kívüli tesztesetekben | Időfüggőség kontrollálásával végzett unit tesztek és manuális trash-flow | Soft delete/restore mérföldkő |
| M-07 | Share-link lejárat érvényesítése | 100% az érvényes, lejárt és hibás tokenes tesztesetekben | Unit teszt, majd manuális megnyitás hitelesítés nélküli böngészőmunkamenetben | Sharing-mérföldkő |
| M-08 | Fő API-műveletek lokális válaszideje | p95 legfeljebb 1 másodperc, a tényleges object transfer nélkül | Legalább 20 ismétlés fejlesztői gépen; lista, usage és URL-generáló műveletek mérése dokumentált adatmennyiséggel | MVP performance-verifikáció |
| M-09 | Dokumentáció és implementáció konzisztenciája | 0 ismert, jelöletlen eltérés | README, API, adatmodell, tesztriport és release note kézi összevetése | Minden mérföldkő lezárásakor |

## Mérési szabályok

- Sikert csak reprodukálható teszt, parancskimenet vagy dokumentált manuális lépéssor igazolhat.
- A manuális eredményeknél rögzíteni kell a dátumot, környezetet, tesztadatot és eredményt.
- A teljesítménymérésből ki kell zárni a fájl bináris feltöltési és letöltési idejét, mert azt a fájlméret és a hálózat erősen befolyásolja.
- A p95 cél fejlesztői, lokális irányérték, nem production SLA.
- Ha egy célérték nem teljesül, az eredményt és az elfogadott eltérést a test reportban vagy verification logban kell dokumentálni; az értéket utólag nem szabad bizonyíték nélkül átírni.

## Későbbi kvalitatív ellenőrzés

A funkcionális MVP stabilizálása után legalább egy, a fejlesztőtől különböző próbafelhasználóval érdemes végigjátszatni a három fő UX-folyamatot. A megfigyelt elakadások fejlesztési inputok, de ez a kutatás nem az MVP technikai Definition of Done kötelező része.
