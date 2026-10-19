import { HttpException } from '@nestjs/common';

const apiErrors = {
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
