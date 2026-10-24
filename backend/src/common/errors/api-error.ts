import { HttpException } from '@nestjs/common';

const apiErrors = {
  FILE_NOT_FOUND: { status: 404, message: 'A fájl nem található.' },
  UPLOAD_NOT_READY: { status: 409, message: 'A fájl még nem érkezett meg a tárolóba.' },
  UPLOAD_VERIFICATION_UNAVAILABLE: { status: 503, message: 'A feltöltés ellenőrzése átmenetileg nem érhető el.' },
  INVALID_FILE_NAME: { status: 400, message: 'A fájlnév érvénytelen.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'A fájl vagy a kérés tartalomtípusa nem támogatott.' },
  FILE_TOO_LARGE: { status: 413, message: 'A fájl mérete meghaladja a megengedett határt.' },
  QUOTA_EXCEEDED: { status: 409, message: 'Nincs elegendő szabad tárhely.' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'Ez a műveletkulcs már más feltöltéshez tartozik.' },
  RESOURCE_STATE_CONFLICT: { status: 409, message: 'A művelet ebben az állapotban nem végezhető el.' },
  UPLOAD_EXPIRED: { status: 410, message: 'A feltöltési művelet lejárt.' },
  UPLOAD_VALIDATION_FAILED: { status: 422, message: 'A feltöltött fájl ellenőrzése sikertelen.' },
  DATABASE_UNAVAILABLE: { status: 503, message: 'Az adatbázis átmenetileg nem érhető el.' },
  STORAGE_UNAVAILABLE: { status: 503, message: 'A fájltároló átmenetileg nem érhető el.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Hibás e-mail-cím vagy jelszó.' },
  AUTH_REQUIRED: { status: 401, message: 'A művelethez bejelentkezés szükséges.' },
  VALIDATION_ERROR: { status: 400, message: 'A megadott adatok érvénytelenek.' },
  EMAIL_ALREADY_EXISTS: { status: 409, message: 'Ezzel az e-mail-címmel már létezik fiók.' },
  RATE_LIMITED: { status: 429, message: 'Túl sok kérés érkezett. Próbáld újra később.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'A szolgáltatás átmenetileg nem érhető el.' },
  ORIGIN_NOT_ALLOWED: { status: 403, message: 'Ez a kérési forrás nem engedélyezett.' },
} as const;

export class ApiError extends HttpException {
  readonly code: keyof typeof apiErrors;

  constructor(code: keyof typeof apiErrors) {
    const definition = apiErrors[code];
    super(definition.message, definition.status);
    this.code = code;
  }
}

export type ApiErrorCode = keyof typeof apiErrors;
