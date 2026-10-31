import { parseApiBaseUrl } from './health';
import { readRetryAfter } from './retry-after';

export type ProcessingState = 'NOT_SCHEDULED' | 'QUEUED' | 'RUNNING' | 'RETRY_WAIT' | 'BLOCKED_QUOTA' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export interface ProcessingStatus {
  fileId: string; processorKey: 'thumbnail'; processorVersion: '1.0.0'; state: ProcessingState;
  retryRevision: number; attemptCount: number; nextAttemptAt: string | null; errorCode: string | null;
  retryable: boolean; cleanupPending: boolean;
  result: null | { id: string; mimeType: 'image/webp'; sizeBytes: number; width: number; height: number; createdAt: string };
}
export type RetryResult = Pick<ProcessingStatus, 'fileId' | 'processorKey' | 'processorVersion' | 'state' | 'retryRevision'>;
type Code = 'unauthorized' | 'not_found' | 'not_allowed' | 'conflict' | 'rate_limited' | 'unavailable';
const messages: Record<Code, string> = {
  unauthorized: 'A munkamenet lejárt. Jelentkezz be újra.', not_found: 'A kép már nem érhető el. Frissítsd a listát.',
  not_allowed: 'Ehhez a képhez nem érhető el feldolgozás.', conflict: 'A feldolgozás most nem indítható újra. Ellenőrizd az állapotát.',
  rate_limited: 'Túl sok feldolgozási kérés. Várj, majd próbáld újra.', unavailable: 'A feldolgozás állapota most nem kérhető le. Próbáld újra.',
};
export class ProcessingRequestError extends Error {
  constructor(readonly code: Code, readonly retryAfterMs = 0) { super(messages[code]); this.name = 'ProcessingRequestError'; }
}
const invalid = (): never => { throw new ProcessingRequestError('unavailable'); };
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const iso = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(key => !Object.hasOwn(v, key))) return invalid();
  return v as Record<string, unknown>;
}
const states: readonly string[] = ['NOT_SCHEDULED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'BLOCKED_QUOTA', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
const identity = ['fileId', 'processorKey', 'processorVersion', 'state', 'retryRevision'];
function validIdentity(row: Record<string, unknown>, id: string) {
  if (row.fileId !== id || row.processorKey !== 'thumbnail' || row.processorVersion !== '1.0.0' || !states.includes(row.state as string) || !integer(row.retryRevision, 0, 2)) invalid();
}
function status(v: unknown, id: string): ProcessingStatus {
  const row = record(v, [...identity, 'attemptCount', 'nextAttemptAt', 'errorCode', 'retryable', 'result', 'cleanupPending']); validIdentity(row, id);
  if (!integer(row.attemptCount, 0, 9) || row.nextAttemptAt !== null && !iso(row.nextAttemptAt) ||
      row.errorCode !== null && (typeof row.errorCode !== 'string' || !/^[A-Z_]{1,64}$/.test(row.errorCode)) ||
      typeof row.retryable !== 'boolean' || typeof row.cleanupPending !== 'boolean') invalid();
  if (row.result !== null) {
    const r = record(row.result, ['id', 'mimeType', 'sizeBytes', 'width', 'height', 'createdAt']);
    if (row.state !== 'SUCCEEDED' || !uuid(r.id) || r.mimeType !== 'image/webp' || !integer(r.sizeBytes, 1, 524288) ||
        !integer(r.width, 1, 512) || !integer(r.height, 1, 512) || !iso(r.createdAt)) invalid();
  }
  return row as unknown as ProcessingStatus;
}
export function createProcessingClient(baseUrl: string | undefined) {
  async function post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController(); const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    const timer = setTimeout(abort, 10000);
    try {
      const response = await fetch(`${parseApiBaseUrl(baseUrl)}/files/${path}`, { method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (response.status !== 200 && !(path.endsWith('/retry') && response.status === 202)) {
        const code: Code = response.status === 401 ? 'unauthorized' : response.status === 404 ? 'not_found' : response.status === 403 || response.status === 415 ? 'not_allowed'
          : response.status === 409 ? 'conflict' : response.status === 429 ? 'rate_limited' : 'unavailable';
        throw new ProcessingRequestError(code, code === 'rate_limited' ? readRetryAfter(response.headers.get('Retry-After')) : 0);
      }
      return await response.json();
    } catch (error) { if (error instanceof ProcessingRequestError) throw error; return invalid(); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  return {
    async status(ids: readonly string[], signal: AbortSignal): Promise<ProcessingStatus[]> {
      if (!Array.isArray(ids)) return invalid();
      const snapshot = [...ids];
      if (!snapshot.length || snapshot.length > 20 || snapshot.some(id => !uuid(id)) || new Set(snapshot).size !== snapshot.length) return invalid();
      const body = record(await post('processing/status', { fileIds: snapshot }, signal), ['items']);
      if (!Array.isArray(body.items) || body.items.length !== snapshot.length) return invalid();
      return snapshot.map((id, i) => status((body.items as unknown[])[i], id));
    },
    async retry(id: string, revision: number, signal: AbortSignal): Promise<RetryResult> {
      if (!uuid(id) || !integer(revision, 0, 2)) return invalid();
      const row = record(await post(`${id}/processing/thumbnail/retry`, { expectedRetryRevision: revision }, signal), identity); validIdentity(row, id);
      if (row.state === 'NOT_SCHEDULED' || (row.retryRevision as number) < revision) return invalid();
      return row as unknown as RetryResult;
    },
  };
}
export type ProcessingClient = ReturnType<typeof createProcessingClient>;
export const processingClient = createProcessingClient(import.meta.env.VITE_API_BASE_URL);
