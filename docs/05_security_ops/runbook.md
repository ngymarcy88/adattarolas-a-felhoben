# Tervezett runbook

**Tervezett állapot – nem implementált funkcionalitás.**

## Használat

Nincs futó szolgáltatás, ezért az alábbiak tervezett incidensforgatókönyvek, nem kipróbált production eljárások. Konkrét parancs, host, dashboard vagy deploylépés csak tényleges környezet létrejötte és verifikációja után kerülhet ide.

Minden incidensnél:

1. rögzíts dátumot, környezetet, request ID-t és tünetet secret nélkül;
2. határozd meg az érintett scope-ot;
3. állítsd le a további káros állapotváltozást, ha biztonságosan lehetséges;
4. őrizd meg a minimális diagnosztikai evidence-et;
5. dokumentáld a helyreállítást és a follow-up tesztet/ADR-változást.

## R-01: API nem válaszol

**Tünet:** health vagy normál API kérés timeout/5xx.

**Tervezett vizsgálat:** process állapot, erőforráskimerülés, deploy/konfiguráció változás, PostgreSQL/MinIO dependency, request ID körüli redaktált log.

**Containment:** új state-changing forgalom korlátozása; hibás példány kivétele csak akkor, ha több stateless példány elérhető.

**Recovery evidence:** health, auth és egy read-only metadata kérés; adatkonzisztencia ellenőrzés. Bináris vagy credential nem kerül ticketbe.

## R-02: PostgreSQL nem elérhető

**Tünet:** auth, metadata és lifecycle kérés backend dependency hibát ad.

**Tervezett válasz:** az API kontrollált `DATABASE_UNAVAILABLE` választ ad; nem próbál memóriában „ideiglenes igazságforrást” létrehozni.

**Vizsgálat:** kapcsolatkonfiguráció jelenléte érték kiírása nélkül, hálózat, DB health, connection pool, migration állapot a későbbi környezetben.

**Recovery:** DB-kapcsolat helyreállítása, majd pending/accounting és legutóbbi state transition ellenőrzése.

## R-03: MinIO/S3 nem elérhető

**Tünet:** init presign, confirm `HEAD`/range, preview/download vagy cleanup hibázik.

**Tervezett válasz:** metadata nem válhat hamisan aktívvá; confirm/cleanup retry-képes marad; URL nem kerül logba.

**Recovery:** adapter connectivity ellenőrzése, majd célzott pending/cleanup retry. Counter csak bizonyított storage eredmény után változhat.

## R-04: Pending cleanup backlog vagy reservation beragad

**Tünet:** nő az expired pending rekordok vagy reserved bytes száma.

**Tervezett vizsgálat:** 15 percnél régebbi pendingek darabszáma, retry count és biztonságos error category; object existence adapteren keresztül.

**Containment:** érintett usernél új init korlátozható, de reservation kézzel nem nullázható object evidence nélkül.

**Recovery:** object-not-found vagy idempotens delete után tranzakciós reservation release; audit és reconciliation evidence.

## R-05: Usage/accounting drift gyanú

**Tünet:** user által látott usage nem egyezik a fájlállapotokkal.

**Tervezett válasz:** automatikus számlálófelülírás helyett read-only reconciliation riport. Az ok lehet confirm retry bug, cleanup/purge részhiba vagy kézi DB-módosítás.

**Recovery:** javítás külön, review-zott tranzakcióval és audit eseménnyel; regression unit teszt kötelező.

## R-06: Auth vagy cookie hiba

**Tünet:** login siker után 401, logout után aktív cookie, vagy Origin/CORS elutasítás.

**Vizsgálat:** cookie attribútumok, frontend/backend origin, CORS credentials és Origin check; tokenérték kiírása tilos.

**Biztonsági eltérés:** ha token localStorage-ban vagy logban jelenik meg, az security incident; érintett secret rotáció és scope review szükséges.

## R-07: Share- vagy presigned URL kiszivárgás

**Tünet:** capability URL vagy raw share token logban/ticketben jelenik meg.

**Containment:** share esetén a link rekord invalidálása/törlése; soft delete is végleg invalidálja. Presigned URL esetén rövid TTL kivárása és access log review; új URL csak új authorization után.

**Follow-up:** redaction javítás, secret scan, regression teszt és verification log.

## R-08: Opcionális MI-provider kiesik

**Tünet:** suggestion `FAILED`, timeout vagy provider error.

**Tervezett válasz:** `AI_UNAVAILABLE`/failed suggestion; core file műveletek változatlanok. Automatikus retry vagy más providerre küldés nincs explicit döntés nélkül.

**Privacy incident:** ha a provider retention/policy eltér a jóváhagyottól, minden új MI-kérés leállítandó; core működés folytatható.

## R-09: Tiltott vagy érzékeny adat logban

**Tünet:** token, URL, password hash, file content, raw MI input/output vagy személyes adat jelenik meg.

**Containment:** hozzáférés szűkítése, további logolás leállítása, érintett credential/capability kezelése. A logot nem szabad további, nem kontrollált csatornára másolni.

**Follow-up:** redaction javítás, retention/törlés policy szerinti kezelés, threat model és teszt frissítése.

## Runbook érettségi kapu

Egy scenario csak akkor jelölhető kipróbáltnak, ha létezik futó környezet, konkrét végrehajtási evidence, dátum, eredmény és utóellenőrzés. Jelenleg minden scenario planned.
