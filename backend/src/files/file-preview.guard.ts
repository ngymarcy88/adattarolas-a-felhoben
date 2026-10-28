import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { ApiError } from '../common/errors/api-error';

/** Independent per-user preview budget; no public provider or process-wide unbounded identity map. */
@Injectable()
export class FilePreviewGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const length = request.headers['content-length'];
    if (Object.keys(request.query).length || request.body !== undefined || request.headers['transfer-encoding'] !== undefined ||
        (length !== undefined && length !== '0')) throw new ApiError('VALIDATION_ERROR');
    const id = request.user.id; const now = Date.now();
    const deny = (until: number): never => {
      http.getResponse<Response>().setHeader('Retry-After', String(Math.max(1, Math.ceil((until - now) / 1000))));
      throw new ApiError('RATE_LIMITED');
    };
    let window = this.windows.get(id);
    if (window && now >= window.until) { this.windows.delete(id); window = undefined; }
    if (!window) {
      if (this.windows.size >= 4096) {
        for (const [key, entry] of this.windows) if (now >= entry.until) this.windows.delete(key);
        if (this.windows.size >= 4096) return deny(Math.min(...Array.from(this.windows.values(), entry => entry.until)));
      }
      window = { count: 0, until: now + 60_000 }; this.windows.set(id, window);
    }
    if (window.count >= 120) return deny(window.until);
    window.count++; return true;
  }
}
