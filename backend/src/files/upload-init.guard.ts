import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { uploadKey } from './upload-init.dto';

/** Initial single-process abuse limit, applied after Origin and current-user authentication. */
@Injectable()
export class UploadInitGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const type = request.headers['content-type'];
    if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
    uploadKey(request.headers['idempotency-key']);
    const now = Date.now(); const id = request.user.id;
    let window = this.windows.get(id);
    if (window && now >= window.until) { this.windows.delete(id); window = undefined; }
    if (!window) {
      if (this.windows.size >= 4096) {
        for (const [key, entry] of this.windows) if (now >= entry.until) this.windows.delete(key);
        if (this.windows.size >= 4096) throw new ApiError('RATE_LIMITED');
      }
      window = { count: 0, until: now + 60_000 }; this.windows.set(id, window);
    }
    if (window.count >= 30) throw new ApiError('RATE_LIMITED');
    window.count++; return true;
  }
}
