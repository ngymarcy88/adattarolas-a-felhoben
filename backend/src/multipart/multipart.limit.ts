import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
export const multipartRates = { create: 10, init: 60, sign: 120, resume: 20, complete: 20, cancel: 20, read: 60 } as const;
export type MultipartBudget = keyof typeof multipartRates;
@Injectable()
export class MultipartLimits {
  private readonly windows = new Map<string, { count: number; until: number }>();
  consume(owner: string, budget: MultipartBudget, response?: { setHeader(name: string, value: string): unknown }) {
    const key = `${budget}:${owner}`; const now = Date.now(); let w = this.windows.get(key);
    if (!w || now >= w.until) {
      for (const [k, old] of this.windows) if (now >= old.until) this.windows.delete(k);
      if (this.windows.size >= 4096) { response?.setHeader('Retry-After', '60'); throw new ApiError('RATE_LIMITED'); }
      w = { count: 0, until: now + 60000 }; this.windows.set(key, w);
    }
    if (w.count >= multipartRates[budget]) { response?.setHeader('Retry-After', String(Math.max(1, Math.ceil((w.until - now) / 1000)))); throw new ApiError('RATE_LIMITED'); }
    w.count++;
  }
}
