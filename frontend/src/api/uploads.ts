import { parseApiBaseUrl } from './health';

export interface UploadedFile {
  id: string; status: 'PENDING_UPLOAD' | 'ACTIVE'; originalName: string;
  mimeType: string; detectedMimeType: string | null; sizeBytes: number; confirmBy: string;
}
export interface UploadAccess {
  method: 'PUT'; url: string; expiresAt: string;
  headers: { 'Content-Type': string; 'If-None-Match': '*' };
}
export interface UploadReceipt { file: UploadedFile; upload: UploadAccess | null }
export interface UploadMetadata { originalName: string; mimeType: string; sizeBytes: number }

const messages: Record<string, string> = {
  AUTH_REQUIRED: 'A munkamenet lejárt. Jelentkezz be újra.',
  ORIGIN_NOT_ALLOWED: 'A feltöltés ezen a címen nem engedélyezett. Ellenőrizd az alkalmazás beállításait.',
  INVALID_FILE_NAME: 'A fájlnév nem használható. Válassz másik fájlt vagy nevezd át.',
  VALIDATION_ERROR: 'A fájl adatai nem fogadhatók el.',
  INVALID_REQUEST: 'A feltöltési kérés nem fogadható el.',
  UNSUPPORTED_MEDIA_TYPE: 'Ez a képtípus nem engedélyezett.',
  FILE_TOO_LARGE: 'A fájl túllépi a megengedett méretet.',
  QUOTA_EXCEEDED: 'Nincs elegendő szabad tárhely a fájlhoz. A korábbi függő feltöltések is foglalnak helyet.',
  IDEMPOTENCY_CONFLICT: 'A feltöltési művelet adatai eltérnek. Ezt a kísérletet nem lehet megismételni.',
  FILE_NOT_FOUND: 'A feltöltési művelet nem érhető el ebben a fiókban.',
  RESOURCE_STATE_CONFLICT: 'A fájl jelenlegi állapotában nem véglegesíthető.',
  UPLOAD_EXPIRED: 'A feltöltési határidő lejárt. Ez a kísérlet már nem folytatható; a korábbi foglalás megmaradhat.',
  UPLOAD_VALIDATION_FAILED: 'A fájl tartalma vagy tényleges mérete nem felel meg a megadott képadatoknak.',
  UPLOAD_NOT_READY: 'A feltöltés még nem igazolható. Próbáld újra ezt a fájlt.',
  RATE_LIMITED: 'Túl sok kérés. A jelzett várakozás után próbáld újra.',
  UNAVAILABLE: 'A művelet eredménye most nem ellenőrizhető. Az újrapróbálás ugyanazt a feltöltést ellenőrzi.',
};
const retryable = new Set(['UNAVAILABLE', 'STORAGE_UNAVAILABLE', 'UPLOAD_VERIFICATION_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR', 'RATE_LIMITED', 'UPLOAD_NOT_READY']);
export class UploadRequestError extends Error {
  constructor(readonly code: string, readonly retryAfterMs = 0) {
    super(Object.hasOwn(messages, code) ? messages[code] : messages.UNAVAILABLE);
    this.name = 'UploadRequestError';
  }
  get retryable() { return retryable.has(this.code); }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseFile(value: unknown): UploadedFile {
  if (!record(value) || typeof value.id !== 'string' || !uuid.test(value.id) ||
      !['ACTIVE', 'PENDING_UPLOAD'].includes(String(value.status)) || typeof value.originalName !== 'string' ||
      typeof value.mimeType !== 'string' || !(value.detectedMimeType === null || typeof value.detectedMimeType === 'string') ||
      !Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 1 || !validDate(value.confirmBy)) throw new UploadRequestError('UNAVAILABLE');
  return { id: value.id, status: value.status as UploadedFile['status'], originalName: value.originalName,
    mimeType: value.mimeType, detectedMimeType: value.detectedMimeType as string | null, sizeBytes: Number(value.sizeBytes), confirmBy: value.confirmBy };
}
function parseReceipt(value: unknown): UploadReceipt {
  if (!record(value)) throw new UploadRequestError('UNAVAILABLE');
  const file = parseFile(value.file);
  if (value.upload === null) return { file, upload: null };
  const access = value.upload;
  if (!record(access) || access.method !== 'PUT' || typeof access.url !== 'string' || !validDate(access.expiresAt) ||
      !record(access.headers) || access.headers['Content-Type'] !== file.mimeType || access.headers['If-None-Match'] !== '*' ||
      Object.keys(access.headers).length !== 2 || file.status !== 'PENDING_UPLOAD') throw new UploadRequestError('UNAVAILABLE');
  // Whitelist headers: never forward API cookies, authorization or arbitrary server headers.
  return { file, upload: { method: 'PUT', url: access.url, expiresAt: access.expiresAt,
    headers: { 'Content-Type': file.mimeType, 'If-None-Match': '*' } } };
}
export function createUploadClient(baseUrl: string | undefined) {
  async function request(path: string, signal: AbortSignal, body?: UploadMetadata, key?: string): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, 10_000);
    try {
      const response = await fetch(`${parseApiBaseUrl(baseUrl)}/files/${path}`, { method: 'POST', credentials: 'include',
        cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key! } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) {
        let code = ({ 400: 'VALIDATION_ERROR', 401: 'AUTH_REQUIRED', 403: 'ORIGIN_NOT_ALLOWED', 404: 'FILE_NOT_FOUND',
          409: 'RESOURCE_STATE_CONFLICT', 410: 'UPLOAD_EXPIRED', 413: 'FILE_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE',
          422: 'UPLOAD_VALIDATION_FAILED', 429: 'RATE_LIMITED' } as Record<number, string>)[response.status] ?? 'UNAVAILABLE';
        try {
          const data: unknown = await response.json();
          if (record(data) && record(data.error) && typeof data.error.code === 'string' &&
              (Object.hasOwn(messages, data.error.code) || retryable.has(data.error.code))) code = data.error.code;
        } catch { /* No raw JSON/provider text in the UI. */ }
        const header = response.headers.get('Retry-After');
        const delay = header && /^\d+$/.test(header) ? Number(header) * 1000
          : header && Number.isFinite(Date.parse(header)) ? Math.max(0, Date.parse(header) - Date.now()) : 0;
        throw new UploadRequestError(code, Math.max(code === 'RATE_LIMITED' ? 60_000 : 0, Number.isFinite(delay) ? delay : 0));
      }
      if (![200, 201].includes(response.status)) throw new UploadRequestError('UNAVAILABLE');
      return await response.json();
    } catch (error) {
      if (error instanceof UploadRequestError) throw error;
      throw new UploadRequestError('UNAVAILABLE');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  return {
    async initiate(input: UploadMetadata, key: string, signal: AbortSignal): Promise<UploadReceipt> {
      const receipt = parseReceipt(await request('uploads/init', signal, input, key));
      if (receipt.file.originalName !== input.originalName || receipt.file.mimeType !== input.mimeType || receipt.file.sizeBytes !== input.sizeBytes) {
        throw new UploadRequestError('UNAVAILABLE');
      }
      return receipt;
    },
    async confirm(id: string, signal: AbortSignal): Promise<UploadedFile> {
      if (!uuid.test(id)) throw new UploadRequestError('VALIDATION_ERROR');
      const data = await request(`${id}/confirm`, signal);
      if (!record(data)) throw new UploadRequestError('UNAVAILABLE');
      const file = parseFile(data.file);
      if (file.id !== id || file.status !== 'ACTIVE') throw new UploadRequestError('UNAVAILABLE');
      return file;
    },
  };
}

/** Cross-origin XHR provides upload progress. A same-origin URL would send cookies even with withCredentials=false. */
export function putImage(access: UploadAccess, file: File, signal: AbortSignal, progress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let xhr: XMLHttpRequest | undefined;
    let cleanup = () => {};
    const fail = () => reject(new UploadRequestError('UNAVAILABLE'));
    try {
      const url = new URL(access.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
          url.origin === window.location.origin || Date.now() >= Date.parse(access.expiresAt)) return fail();
      if (signal.aborted) return fail();
      xhr = new XMLHttpRequest();
      const abort = () => xhr!.abort();
      cleanup = () => {
        signal.removeEventListener('abort', abort);
        xhr!.onload = xhr!.onerror = xhr!.ontimeout = xhr!.onabort = null;
        xhr!.upload.onprogress = null;
      };
      const done = (success: boolean) => { cleanup(); success ? resolve() : fail(); };
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0 && !signal.aborted) progress(Math.min(100, Math.max(0, Math.floor(event.loaded / event.total * 100))));
      };
      xhr.onload = () => done(xhr!.status >= 200 && xhr!.status < 300);
      xhr.onerror = xhr.ontimeout = xhr.onabort = () => done(false);
      xhr.open('PUT', url.href);
      xhr.withCredentials = false;
      xhr.timeout = 120_000;
      xhr.setRequestHeader('Content-Type', access.headers['Content-Type']);
      xhr.setRequestHeader('If-None-Match', '*');
      // Content-Length is set by the browser for this exact File, never by application code.
      signal.addEventListener('abort', abort, { once: true });
      xhr.send(file);
    } catch { cleanup(); xhr?.abort(); fail(); }
  });
}
export interface UploadClient {
  initiate(input: UploadMetadata, key: string, signal: AbortSignal): Promise<UploadReceipt>;
  confirm(id: string, signal: AbortSignal): Promise<UploadedFile>;
  put(access: UploadAccess, file: File, signal: AbortSignal, progress: (percent: number) => void): Promise<void>;
}
export const uploadClient: UploadClient = { ...createUploadClient(import.meta.env.VITE_API_BASE_URL), put: putImage };
