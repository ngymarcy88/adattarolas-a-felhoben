import { parseApiBaseUrl } from './health';

export const GALLERY_PAGE_SIZE = 20;
export interface GalleryFile {
  id: string; originalName: string; mimeType: string; detectedMimeType: string;
  sizeBytes: number; status: 'ACTIVE'; createdAt: string;
}
export interface GalleryPage { items: GalleryFile[]; nextCursor: string | null; hasNextPage: boolean }
export type GalleryErrorCode = 'unauthorized' | 'cursor_invalid' | 'rate_limited' | 'forbidden' | 'unavailable';
const messages: Record<GalleryErrorCode, string> = {
  unauthorized: 'A munkamenet lejárt. Jelentkezz be újra.',
  cursor_invalid: 'A lapozás nem folytatható. Frissítsd a listát az elejéről.',
  rate_limited: 'Túl sok kérés. A jelzett várakozás után próbáld újra.',
  forbidden: 'Ezen a címen a lista nem érhető el. Ellenőrizd az alkalmazás beállításait.',
  unavailable: 'A képek listája most nem tölthető be. Próbáld újra.',
};
export class GalleryRequestError extends Error {
  constructor(readonly code: GalleryErrorCode, readonly retryAfterMs = 0) { super(messages[code]); this.name = 'GalleryRequestError'; }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validCursor = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[^A-Za-z0-9_-]/.test(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const images = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function parseFile(value: unknown): GalleryFile {
  if (!record(value) || Object.keys(value).length !== 7 || typeof value.id !== 'string' || value.id.length !== 36 || !uuid.test(value.id) ||
      typeof value.originalName !== 'string' || !value.originalName.trim() || [...value.originalName].length > 255 ||
      typeof value.mimeType !== 'string' || !images.has(value.mimeType) || value.detectedMimeType !== value.mimeType || value.status !== 'ACTIVE' ||
      !Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 1 || typeof value.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) ||
      new Date(value.createdAt).getUTCFullYear() < 1 || new Date(value.createdAt).toISOString() !== value.createdAt) throw new GalleryRequestError('unavailable');
  return { id: value.id, originalName: value.originalName, mimeType: value.mimeType, detectedMimeType: value.mimeType,
    sizeBytes: Number(value.sizeBytes), status: 'ACTIVE', createdAt: value.createdAt };
}
function parsePage(value: unknown): GalleryPage {
  if (!record(value) || Object.keys(value).length !== 3 || !Array.isArray(value.items) || value.items.length > GALLERY_PAGE_SIZE ||
      typeof value.hasNextPage !== 'boolean' || (value.hasNextPage ? !validCursor(value.nextCursor) || !value.items.length : value.nextCursor !== null)) {
    throw new GalleryRequestError('unavailable');
  }
  return { items: value.items.map(parseFile), nextCursor: value.nextCursor as string | null, hasNextPage: value.hasNextPage };
}
function retryAfter(header: string | null): number {
  if (!header) return 60_000;
  const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now());
  return Number.isSafeInteger(delay) && delay >= 0 && delay <= Number.MAX_SAFE_INTEGER - Date.now() ? delay : 60_000;
}
export function createGalleryClient(baseUrl: string | undefined) {
  return {
    async list(cursor: string | null, signal: AbortSignal): Promise<GalleryPage> {
      if (cursor !== null && !validCursor(cursor)) throw new GalleryRequestError('cursor_invalid');
      const controller = new AbortController(); const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      const timer = setTimeout(abort, 10_000);
      try {
        const query = new URLSearchParams({ limit: String(GALLERY_PAGE_SIZE) }); if (cursor !== null) query.set('cursor', cursor);
        const response = await fetch(`${parseApiBaseUrl(baseUrl)}/files?${query}`, { method: 'GET', credentials: 'include',
          cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (response.status === 401) throw new GalleryRequestError('unauthorized');
        if (response.status === 403) throw new GalleryRequestError('forbidden');
        if (response.status === 429) throw new GalleryRequestError('rate_limited', retryAfter(response.headers.get('Retry-After')));
        if (response.status === 400) {
          let data: unknown; try { data = await response.json(); } catch { /* Never expose raw bodies. */ }
          if (record(data) && record(data.error) && data.error.code === 'CURSOR_INVALID') throw new GalleryRequestError('cursor_invalid');
        }
        if (response.status !== 200) throw new GalleryRequestError('unavailable');
        return parsePage(await response.json());
      } catch (error) {
        if (error instanceof GalleryRequestError) throw error;
        throw new GalleryRequestError('unavailable');
      } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    },
  };
}
export type GalleryClient = ReturnType<typeof createGalleryClient>;
export const galleryClient = createGalleryClient(import.meta.env.VITE_API_BASE_URL);
