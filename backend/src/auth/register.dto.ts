import { Injectable, PipeTransform } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { MAX_PASSWORD_BYTES } from './password.service';

export class RegisterDto {
  constructor(readonly email: string, readonly displayName: string, readonly password: string) {}
}

const localPart = /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+$/;
const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const validUnicode = (value: string): boolean => Buffer.from(value, 'utf8').toString('utf8') === value;

@Injectable()
export class RegisterValidationPipe implements PipeTransform<unknown, RegisterDto> {
  transform(value: unknown): RegisterDto {
    const fail = (): never => { throw new ApiError('VALIDATION_ERROR'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const body = value as Record<string, unknown>;
    const fields = ['email', 'displayName', 'password'];
    if (Object.keys(body).length !== 3 || fields.some((key) =>
      !Object.hasOwn(body, key) || typeof body[key] !== 'string')) return fail();
    // Bound raw input before normalization; never normalize or trim passwords.
    const { email, displayName, password } = body as Record<string, string>;
    if (email.length > 320 || displayName.length > 200 || password.length > MAX_PASSWORD_BYTES) return fail();
    const normalizedEmail = email.trim().toLowerCase();
    const [local, domain, extra] = normalizedEmail.split('@');
    if (!local || !domain || extra !== undefined || normalizedEmail.length > 254 || local.length > 64 ||
        !localPart.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
        domain.split('.').length < 2 || domain.split('.').some((label) => !domainLabel.test(label))) return fail();
    const normalizedName = displayName.trim();
    if (!normalizedName || [...normalizedName].length > 100 || !validUnicode(normalizedName) ||
        /[\u0000-\u001f\u007f-\u009f]/.test(normalizedName)) return fail();
    if ([...password].length < 15 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES ||
        !validUnicode(password)) return fail();
    return new RegisterDto(normalizedEmail, normalizedName, password);
  }
}
