import { HttpException } from '@nestjs/common';

const apiErrors = {
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
