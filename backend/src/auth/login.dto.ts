import { Injectable, PipeTransform } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { MAX_PASSWORD_BYTES } from './password.service';
import { normalizeEmail, validUnicode } from './register.dto';

export class LoginDto {
  constructor(readonly email: string, readonly password: string) {}
}

@Injectable()
export class LoginValidationPipe implements PipeTransform<unknown, LoginDto> {
  transform(value: unknown): LoginDto {
    const fail = (): never => { throw new ApiError('VALIDATION_ERROR'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== 2 || !Object.hasOwn(body, 'email') || !Object.hasOwn(body, 'password')) return fail();
    const email = normalizeEmail(body.email);
    const password = body.password;
    // Login accepts existing passwords without applying new-account strength rules.
    if (typeof password !== 'string' || !password.length || password.length > MAX_PASSWORD_BYTES ||
        Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES || !validUnicode(password)) return fail();
    return new LoginDto(email, password);
  }
}
