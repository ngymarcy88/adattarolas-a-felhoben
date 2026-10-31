import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from '../common/errors/api-error';
import type { AuthenticatedRequest } from '../auth/session.guard';

/** Each concrete singleton has an independent bounded per-user budget. Auth runs before this guard. */
class ProcessingGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; until: number }>();
  constructor(private readonly json: boolean, private readonly limit: number) {}
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp(); const request = http.getRequest<AuthenticatedRequest>();
    if (Object.keys(request.query).length) throw new ApiError('VALIDATION_ERROR');
    if (this.json) {
      const type = request.headers['content-type'];
      if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
    } else if (request.body !== undefined || request.headers['transfer-encoding'] !== undefined ||
      request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') throw new ApiError('VALIDATION_ERROR');
    const now = Date.now(); const id = request.user.id;
    const deny = (until: number): never => {
      http.getResponse<Response>().setHeader('Retry-After', String(Math.max(1, Math.ceil((until - now) / 1000))));
      throw new ApiError('RATE_LIMITED');
    };
    let window = this.windows.get(id);
    if (window && now >= window.until) { this.windows.delete(id); window = undefined; }
    if (!window) {
      if (this.windows.size >= 4096) {
        for (const [key, value] of this.windows) if (now >= value.until) this.windows.delete(key);
        if (this.windows.size >= 4096) return deny(Math.min(...Array.from(this.windows.values(), value => value.until)));
      }
      window = { count: 0, until: now + 60000 }; this.windows.set(id, window);
    }
    if (window.count >= this.limit) return deny(window.until);
    window.count++; return true;
  }
}
@Injectable()
export class ProcessingStatusGuard extends ProcessingGuard { constructor() { super(true, 60); } }
@Injectable()
export class ThumbnailUrlGuard extends ProcessingGuard { constructor() { super(false, 60); } }
@Injectable()
export class ProcessingRetryGuard extends ProcessingGuard { constructor() { super(true, 10); } }
