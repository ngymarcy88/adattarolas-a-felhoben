import { parseApiBaseUrl } from './health';
import { readRetryAfter } from './retry-after';

export interface PreviewAccess { url: string; expiresAt: string }
export type PreviewErrorCode = 'unauthorized' | 'not_found' | 'not_allowed' | 'rate_limited' | 'unavailable';
const messages: Record<PreviewErrorCode, string> = {
  unauthorized: 'A munkamenet lejárt. Jelentkezz be újra.',
  not_found: 'A kép már nem érhető el. Frissítsd a listát.',
  not_allowed: 'Ehhez a fájlhoz nem érhető el képelőnézet.',
  rate_limited: 'Túl sok előnézeti kérés. Várj, majd próbáld újra.',
  unavailable: 'Az előnézet most nem kérhető le. Próbáld újra.',
};
export class PreviewRequestError extends Error {
  constructor(readonly code: PreviewErrorCode, readonly retryAfterMs = 0) { super(messages[code]); this.name = 'PreviewRequestError'; }
}
export function createPreviewClient(baseUrl: string | undefined, frontendOrigin = () => window.location.origin) {
  return {
    async get(id: string, signal: AbortSignal): Promise<PreviewAccess> {
      if (id.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new PreviewRequestError('not_found');
      const controller = new AbortController(); const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      const timer = setTimeout(abort, 10_000);
      try {
        const response = await fetch(`${parseApiBaseUrl(baseUrl)}/files/${id}/preview-url`, { method: 'GET', credentials: 'include',
          cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (response.status !== 200) {
          const code: PreviewErrorCode = response.status === 401 ? 'unauthorized' : response.status === 404 ? 'not_found'
            : response.status === 415 || response.status === 403 ? 'not_allowed' : response.status === 429 ? 'rate_limited' : 'unavailable';
          throw new PreviewRequestError(code, code === 'rate_limited' ? readRetryAfter(response.headers.get('Retry-After')) : 0);
        }
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 2 || !('url' in data) || !('expiresAt' in data) ||
            typeof data.url !== 'string' || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) ||
            new Date(data.expiresAt).toISOString() !== data.expiresAt || Date.parse(data.expiresAt) <= Date.now()) throw new PreviewRequestError('unavailable');
        const url = new URL(data.url);
        // anonymous images still send same-origin credentials: require the documented separate storage origin.
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.origin === frontendOrigin()) throw new PreviewRequestError('unavailable');
        return { url: data.url, expiresAt: data.expiresAt };
      } catch (error) {
        if (error instanceof PreviewRequestError) throw error;
        throw new PreviewRequestError('unavailable');
      } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    },
  };
}
export type PreviewClient = ReturnType<typeof createPreviewClient>;
export const previewClient = createPreviewClient(import.meta.env.VITE_API_BASE_URL);
