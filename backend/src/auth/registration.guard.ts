import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { OriginGuard } from './origin.guard';
import { ApiError } from '../common/errors/api-error';

@Injectable()
export class RegistrationGuard extends OriginGuard {
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(config: ConfigService) { super(config); }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    super.canActivate(context);
    // Trust the direct peer, never client-supplied X-Forwarded-For. The local
    // backend does not enable Express trust proxy. Limits are process-local.
    const peer = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let attempt = this.attempts.get(peer);
    if (attempt && attempt.expiresAt <= now) {
      this.attempts.delete(peer);
      attempt = undefined;
    }
    if (!attempt) {
      if (this.attempts.size >= 1024) {
        for (const [key, entry] of this.attempts) {
          if (entry.expiresAt <= now) this.attempts.delete(key);
        }
        if (this.attempts.size >= 1024) throw new ApiError('RATE_LIMITED');
      }
      attempt = { count: 0, expiresAt: now + 60_000 };
      this.attempts.set(peer, attempt);
    }
    if (attempt.count >= 5) throw new ApiError('RATE_LIMITED');
    attempt.count++;
    return true;
  }
}
