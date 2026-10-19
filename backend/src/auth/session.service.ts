import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';

export const AUTH_COOKIE = 'cloudvault_access';
const ISSUER = 'cloudvault';
const AUDIENCE = 'cloudvault-api';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService) {}

  private options(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.getOrThrow<AppConfig>('app').environment === 'production', path: '/api/v1' };
  }

  issue(response: Response, userId: string): void {
    const config = this.config.getOrThrow<AppConfig>('app');
    try {
      if (!uuid.test(userId)) throw new Error('Invalid subject');
      const token = jwt.sign({}, config.jwtSecret, {
        algorithm: 'HS256', subject: userId, issuer: ISSUER, audience: AUDIENCE, expiresIn: config.jwtTtlSeconds,
      });
      response.cookie(AUTH_COOKIE, token, { ...this.options(), maxAge: config.jwtTtlSeconds * 1000 });
    } catch { throw new ApiError('SERVICE_UNAVAILABLE'); }
  }

  clear(response: Response): void {
    response.clearCookie(AUTH_COOKIE, this.options());
  }

  subject(cookieHeader: string | undefined): string {
    const fail = (): never => { throw new ApiError('AUTH_REQUIRED'); };
    if (!cookieHeader || cookieHeader.length > 8192) return fail();
    const values = cookieHeader.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${AUTH_COOKIE}=`));
    if (values.length !== 1) return fail();
    const token = values[0].slice(AUTH_COOKIE.length + 1);
    if (!token || token.length > 4096) return fail();
    const config = this.config.getOrThrow<AppConfig>('app');
    try {
      const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
      const now = Math.floor(Date.now() / 1000);
      if (typeof claims === 'string' || typeof claims.sub !== 'string' || !uuid.test(claims.sub) ||
          !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
          claims.iat! > now || claims.exp! <= now || claims.exp! <= claims.iat! ||
          claims.exp! - claims.iat! > config.jwtTtlSeconds) return fail();
      return claims.sub;
    } catch { return fail(); }
  }
}
