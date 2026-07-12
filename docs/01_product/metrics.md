# Termékmetrikák

**Tervezett állapot – nem implementált funkcionalitás.**

Jelenleg nincs futtatható alkalmazás, test runner vagy mérési baseline. Az alábbi célok ezért elfogadási irányértékek; egyik sem tekinthető teljesítettnek. A későbbi eredményeket dátummal, környezettel és reprodukálható bizonyítékkal kell a test reportban vagy verification logban rögzíteni.

## Core MVP sikermetrikák

| ID | Metrika | Tervezett célérték | Tervezett mérési mód | Bizonyítás időpontja |
|---|---|---:|---|---|
| M-01 | Core UX-folyamatok feladat-teljesítése | 3/3 folyamat blokkoló hiba nélkül | A `ux_flows.md` három core folyamatának manuális végigjátszása legalább két külön felhasználói fiókkal | Core MVP release-verifikáció |
| M-02 | Core MVP acceptance criteria teljesülése | 100% | A `scope_contract.md` kritériumainak traceability checklistje kód-, unit teszt- vagy demonstrációs bizonyítékkal | Minden érintett feature-szelet és végső review |
| M-03 | Jogosulatlan cross-user hozzáférés | 0 sikeres hozzáférés | Negatív ownership és authorization unit tesztek, majd dokumentált manuális ellenőrzés másik felhasználó azonosítóival | Auth-, file- és sharing-szeletek |
| M-04 | Pontosan egyszeri usage accounting | 100% minden vizsgált init, confirm, confirm-retry, soft delete és restore esetben | Várt és tényleges `usedStorageBytes` és `reservedStorageBytes` változás összevetése unit tesztekben | Upload- és lifecycle-szeletek |
| M-05 | Párhuzamos kvótafoglalás helyessége | 0 kvótát túllépő elfogadott reservation | Azonos felhasználóra versengő init esetek determinisztikus service unit tesztje | Upload- és usage-szeletek |
| M-06 | Tiltott vagy hibás fájlok elutasítása | 100% a dokumentált mintakészleten | Túl nagy, MIME-eltéréses, hibás magic numberű és nem allowlistelt minták unit tesztje | Fájlvalidációs szelet |
| M-07 | Cursor pagination stabilitása | 0 kihagyott vagy duplikált elem változatlan adathalmaznál | Több azonos `createdAt` értéket is tartalmazó adathalmaz `createdAt + id` szerinti, többoldalas unit tesztje; új első oldali beszúrás melletti duplikációellenőrzés | Fájllista-szelet |
| M-08 | Abandoned upload cleanup helyessége | 100% a sikeres, hiányzó objektumos és storage-hibás tesztesetekben | Kontrollált idővel és storage adapter mockkal végzett unit teszt: sikeres cleanup feloldja, hiba megtartja a reservationt és retry-képes állapotot hagy | Upload-lifecycle szelet |
| M-09 | Restore és retention helyessége | 100% a megőrzési időn belüli és kívüli tesztesetekben | Kontrollált idővel végzett unit tesztek és manuális trash-flow | Soft delete/restore szelet |
| M-10 | Share-link lejárat érvényesítése | 100% az érvényes, lejárt, hibás és nem aktív fájlos esetekben | Token-hash és lejárat unit tesztje, majd manuális megnyitás hitelesítés nélküli munkamenetben | Sharing-szelet |
| M-11 | Stateless kérésfolytonosság | 100% a dokumentált többlépéses forgatókönyvekben | Annak ellenőrzése, hogy init után confirm és share validáció lokális memóriában őrzött sessionállapot nélkül elvégezhető | Architektúra- és feature-review |
| M-12 | Alap audit lefedettség és adatminimalizálás | 100% kijelölt esemény; 0 tiltott adat | Auth-, upload-, lifecycle-, sharing- és security service unit tesztek; token, URL, jelszó és fájltartalom tiltólista-ellenőrzése | Minden érintett core szelet |
| M-13 | Fő API-műveletek lokális válaszideje | p95 legfeljebb 1 másodperc, object transfer nélkül | Bemelegítés után legalább 100 ismétlés dokumentált adatmennyiséggel a lista-, usage- és URL-generáló műveleteken | Core MVP performance-verifikáció |
| M-14 | Dokumentáció és implementáció konzisztenciája | 0 ismert, jelöletlen eltérés | README, API, adatmodell, ADR-ek, test report és release note kézi összevetése | Minden mérföldkő lezárásakor |

## MVP+ MI-metrikák

Ezek a célok csak az opcionális `MVP+` kép-metaadat-javaslat megvalósítása esetén válnak mérendővé. Nem részei a `Core MVP` elfogadásának.

| ID | Metrika | Tervezett célérték | Tervezett mérési mód |
|---|---|---:|---|
| AI-M-01 | Core működés MI-provider kiesésekor | 100% a kijelölt storage műveleteknél | Provider timeout- és hibamock mellett a core service-ek változatlan eredményének unit tesztje, majd manuális smoke flow |
| AI-M-02 | Emberi jóváhagyás érvényesítése | 0 jóváhagyás nélküli végleges metaadat-változás | Elfogadás, szerkesztett elfogadás, elutasítás, ismételt kérés és providerhiba unit tesztje |
| AI-M-03 | Explicit trigger és kép-only scope | 0 automatikus providerhívás; 100% videókérés-elutasítás | Provider adapter call-count és fájlállapot-/MIME-validáció unit tesztje |
| AI-M-04 | Javaslat döntési útjának követhetősége | 100% elfogadott, szerkesztett és elutasított döntésnél | Státusz-, provenance- és adatminimalizálási ellenőrzés tiltott nyers tartalom naplózása nélkül |

Az MI-javaslat szakmai minősége kvalitatív értékelést is igényelhet, de az elfogadási kapu elsődlegesen a biztonságos fallback, az explicit felhasználói indítás és a human-in-the-loop döntés helyessége. A javaslatok elfogadási aránya önmagában nem sikerességi mérce.

## Mérési szabályok

- Sikert csak reprodukálható unit teszt, parancskimenet vagy dokumentált manuális lépéssor igazolhat.
- A manuális eredménynél rögzíteni kell a dátumot, környezetet, tesztadatot és eredményt.
- Az első fejlesztési fázis unit tesztekre korlátozódik; integration vagy e2e teszt nem vezethető be pusztán e metrikák miatt.
- A teljesítménymérésből ki kell zárni a bináris feltöltés és letöltés idejét, mert azt a fájlméret és a hálózat erősen befolyásolja.
- A p95 cél lokális fejlesztői irányérték, nem production SLA.
- Egy metric scenario csak akkor sikeres, ha az állapot mellett a számlálók és a tiltott mellékhatások hiánya is igazolt.
- Nem teljesülő célt és elfogadott eltérést a test reportban vagy verification logban kell dokumentálni; célérték utólag nem írható át bizonyíték nélkül.

## Későbbi kvalitatív ellenőrzés

A `Core MVP` stabilizálása után legalább egy, a fejlesztőtől különböző próbafelhasználóval érdemes végigjátszatni a három core UX-folyamatot. Az `MVP+` elkészülte esetén külön kell megfigyelni, hogy az MI-javaslat, a szerkesztés és az elutasítás közötti döntés érthető-e. Ezek fejlesztési inputok, nem helyettesítik a technikai Definition of Done bizonyítékait.
