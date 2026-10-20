# Frontend

Vue 3 + Vite + TypeScript + Tailwind CSS + Vue Router alapalkalmazás. Egy magyar kezdőoldalt tartalmaz, amely a backend health endpointját lekéri, betöltési/hiba/elérhető állapotot mutat és újraellenőrizhető. A kérés öt másodperc után megszakad. A `/login` belépőűrlap, `/app` védett fiókoldal és kijelentkezés implementált; a `/register` UI név/e-mail/jelszó/megerősítés mezőkkel és loading/hiba/siker állapotokkal is implementált; fájlkezelés még nincs.

## Konfiguráció és indítás

A gyökérbeli README Quickstart részét kövesd. A függőségek telepítése a repógyökérből, az egyetlen root lockfile alapján történik: `npm ci`.

A root `.env` fájl `VITE_API_BASE_URL` változója adja a backend API alapcímét, például `http://127.0.0.1:3000/api/v1`. A Vite csak a `VITE_` prefixű értékeket teszi elérhetővé a böngésző számára; ebbe a névtérbe kizárólag nyilvános beállítás kerülhet. Storage credential, adatbázis-URL vagy JWT-titok nem adható át a frontendnek. A Vite build a konfigurációt beépíti a bundle-be; változtatás után új build szükséges.

A repógyökérből:

```bash
npm run dev --workspace frontend
npm run typecheck --workspace frontend
npm run test --workspace frontend
npm run build --workspace frontend
npm run preview --workspace frontend
```

A fejlesztői szerver és a preview a `http://127.0.0.1:5173` címen indul. A backend CORS-engedélyezésének ugyanezt az origint kell tartalmaznia; a `localhost` és a `127.0.0.1` eltérő origin. A frontend API-kérések `credentials: include` beállítást használnak a HttpOnly cookie-auth támogatására. A JWT-t JavaScript nem olvassa és nem tárolja.

A Vitest unit tesztek hálózati hívás nélkül vizsgálják az API-konfigurációt, a válaszellenőrzést, a hibaadatok elrejtését és a megszakítás kezelését. Pinia és böngészőalapú tesztfüggőség jelenleg nem szükséges.


## Védett útvonal és állapotok

- `/`: publikus health kezdőlap, „Saját fiók” linkkel.
- `/register`: nyilvános regisztráció, kötelező név/email/jelszó/megerősítés, mezőhibák és kérés alatti loading/disabled; 201 után sikerjelzés és login link, auto-login nélkül. 409 foglalt email biztonságos üzenettel; 400/429/kiesés javítható hiba. A megerősítés csak frontend, a backend három mezőt kap.
- `/login`: email/jelszó form, regisztrációs link, pending/disabled és biztonságos hibaüzenet; ismételt submit blokkolt. A jelszó minden kísérlet után és unmountkor ürül. Siker után mindig a belső `account` route, tetszőleges return URL nélkül.
- `/app`: `requiresAuth` router meta; belépéskor és új navigációnál mindig friss `GET /auth/me`, credentialdel. A backend SessionGuard ellenőrzi a JWT-t és a DB-usert; a frontend önmagában nem authorization.
- Ellenőrzés alatt az App nem renderel fiókadatot. 401 a loginra vezet; hálózati/503/érvénytelen válasz a publikus `/auth-unavailable` oldalra, ahonnan `/app` újra megpróbálható. Nem állítjuk szerverkiesésnél, hogy kijelentkeztél.
- A fiókoldalon publikus név/email és logout van; nincs még fájllista vagy kvótakijelzés. Csak igazolt 204 logout után töröljük a memóriabeli usert és navigálunk loginra; sikertelen kérés hibát és retry-t hagy a fiókoldalon.

Az auth API-kliens külön réteg, típus- és allowlist-válaszellenőrzéssel, 10 másodperces teljes request/body timeouttal, megszakítással, `credentials: include`, `cache: no-store` és redirect tiltással. Backend hibatörzs/URL/belső részlet nem kerül UI-ba. Nincs localStorage/sessionStorage/cookie-olvasás vagy kliensoldali tartós „bejelentkezve” flag; csak a publikus profil rövid életű Vue memóriabeli refje. Régi navigáció válasza nem írhatja felül az újabbat. Nincs új Pinia vagy tesztfüggőség.

Az útvonalellenőrzés navigációkor fut; már megnyitott, tétlen oldalon nem pollolja a sessiont és nem végez cross-tab szinkront. A már megjelenített profil nem hozzáférési bizonyíték: következő védett navigáció és minden backend protected kérés új ellenőrzést igényel. Token-revokáció/refresh nincs (ADR-010). Same-site hosthasználat és production HTTPS szükséges.

Unit bizonyíték: API HTTP/JSON/timeout/abort, tényleges Vue Router memory-history-val (401, kiesés/retry, késői siker/hiba és elavult profil kizárása), Vue SSR template-render (loginmezők, loading alatti adatrejtés, escaped profil és retry link). A template-render nem böngésző/hydration/űrlap-interakció igazolás. A valós DB- és browser-próba státusza a tesztriportban szerepel.


## Közös auth-űrlapkezelés

A `src/auth/form.ts` tesztelhető reaktív űrlapállapotot ad a két oldalnak. Beküldés előtt ellenőrzi a kötelező mezőket, regisztrációnál a név 1–100 Unicode-kódpontját, a jelszó legalább 15 kódpontját/legfeljebb 1024 UTF-8 bájtját és pontos megerősítését; jelszót nem trimel/normalizál. Az email teljes szabályát a backend ellenőrzi, a böngésző `type=email` és az űrlap alapellenőrzése csak UX-segítség. Login meglévő rövid jelszót is elfogad. Új backend-szabály vagy jelszópolicy nem készült.

Kérés alatt új submit nem indít másik kérést. Minden elküldött kísérlet után mindkét jelszó ürül; helyi mezőhiba esetén az el nem küldött mezők javíthatók. Unmount abortál és törli a jelszavakat; késői siker/hiba nem indít navigációt vagy regisztrációs sikerjelzést. Megerősített siker után a regisztrációs űrlap eltűnik, így ismételt beküldés nincs. Az email/név nem kerül query-paraméterbe, jelszó/token webstorage-ba sem. Timeout után nem állítjuk, hogy a szerver biztosan nem hozott létre fiókot; az ismétlés 409 üzenete belépésre is irányít.

Unit bizonyíték: `auth-form.spec.ts` a tényleges oldalak által használt form-kezelő loading/error/retry/success/dispose ágait ellenőrzi; az API-kliens 201/409 és csak három backendmező átadását is teszteli. Az SSR template-próbák a mezőkapcsolatokat, loading visszajelzést, disabled attribútumokat és a siker/login linket ellenőrzik. A browseres DOM-interakció, fókusz, natív email-validáció és valódi cookie/DB-együttműködés külön kézi kapu.
