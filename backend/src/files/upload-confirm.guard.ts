import { CanActivate, ExecutionContext, Injectable, PipeTransform } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { ApiError } from '../common/errors/api-error';

@Injectable()
export class FileIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError('VALIDATION_ERROR');
    return value.toLowerCase();
  }
}
@Injectable()
export class UploadConfirmGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const length = request.headers['content-length'];
    if (request.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0') || request.body !== undefined) {
      throw new ApiError('VALIDATION_ERROR');
    }
    const now = Date.now(); const id = request.user.id;
    let window = this.attempts.get(id);
    if (window && now >= window.until) { this.attempts.delete(id); window = undefined; }
    if (!window) {
      if (this.attempts.size >= 4096) {
        for (const [key, entry] of this.attempts) if (now >= entry.until) this.attempts.delete(key);
        if (this.attempts.size >= 4096) throw new ApiError('RATE_LIMITED');
      }
      window = { count: 0, until: now + 60000 }; this.attempts.set(id, window);
    }
    if (window.count >= 60) throw new ApiError('RATE_LIMITED');
    window.count++; return true;
  }
}
