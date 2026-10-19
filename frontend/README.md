# Frontend

Vue 3 + Vite + TypeScript + Tailwind CSS + Vue Router alapalkalmazás. Egy magyar kezdőoldalt tartalmaz, amely a backend health endpointját lekéri, betöltési/hiba/elérhető állapotot mutat és újraellenőrizhető. A kérés öt másodperc után megszakad. A belépés és fájlkezelés még nincs implementálva.

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

A fejlesztői szerver és a preview a `http://127.0.0.1:5173` címen indul. A backend CORS-engedélyezésének ugyanezt az origint kell tartalmaznia; a `localhost` és a `127.0.0.1` eltérő origin. A frontend API-kérések `credentials: include` beállítást használnak a tervezett cookie-auth támogatására.

A Vitest unit tesztek hálózati hívás nélkül vizsgálják az API-konfigurációt, a válaszellenőrzést, a hibaadatok elrejtését és a megszakítás kezelését. Pinia és böngészőalapú tesztfüggőség jelenleg nem szükséges.
