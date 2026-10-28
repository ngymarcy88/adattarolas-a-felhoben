import { computed, reactive } from 'vue';
import { UploadRequestError, type UploadClient, type UploadReceipt } from '../api/uploads';
import { prepareImage } from './image-format';

export const MAX_BATCH_FILES = 20;
export const MAX_IMAGE_BYTES = 104857600;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export type UploadStatus = 'queued' | 'initializing' | 'uploading' | 'confirming' | 'success' | 'error';
export interface UploadRow {
  id: string; name: string; size: number; status: UploadStatus; progress: number;
  error: string; notice: string; retryable: boolean; retryAt: number; failures: number;
}
interface Context { file: File; prepared?: boolean; receipt?: UploadReceipt; confirmFirst: boolean }
export function validateImage(file: File): string {
  const name = file.name.trim().normalize('NFC');
  if (!name || ['.', '..'].includes(name) || [...name].length > 255 || /[\ud800-\udfff]/u.test(name) ||
      /[\/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(file.name)) return 'A fájlnév nem használható. Nevezd át a fájlt.';
  if (!Number.isSafeInteger(file.size) || file.size < 1) return 'Üres fájl nem tölthető fel.';
  if (file.size > MAX_IMAGE_BYTES) return 'A fájl legfeljebb 100 MiB lehet; a szerver ennél szigorúbb limitet is alkalmazhat.';
  return '';
}
const identity = (file: File) => JSON.stringify([file.name, file.size, file.type, file.lastModified]);

/** Page-lifetime queue; capabilities and File objects stay outside rendered/reactive state. */
export function createUploadBatch(client: UploadClient, newKey = () => crypto.randomUUID() as string) {
  const state = reactive({ rows: [] as UploadRow[], selectionError: '', authRequired: false, running: 0, completionVersion: 0 });
  const contexts = new Map<string, Context>();
  const selected = new Set<string>();
  const controllers = new Set<AbortController>();
  let disposed = false; let completedSinceIdle = false;
  const busy = computed(() => state.running > 0 || state.rows.some(row => row.status === 'queued'));
  const summary = computed(() => ({ total: state.rows.length, success: state.rows.filter(r => r.status === 'success').length,
    failed: state.rows.filter(r => r.status === 'error').length }));
  function add(files: File[]) {
    if (disposed || state.authRequired) return;
    state.selectionError = '';
    for (const file of files) {
      const fingerprint = identity(file);
      if (selected.has(fingerprint)) { state.selectionError = 'A már kiválasztott fájlokat kihagytuk.'; continue; }
      if (state.rows.length >= MAX_BATCH_FILES) { state.selectionError = `Ebben a kötegben legfeljebb ${MAX_BATCH_FILES} fájl lehet. A további fájlokat nem adtuk hozzá.`; break; }
      selected.add(fingerprint);
      const error = validateImage(file);
      const id = newKey();
      state.rows.push({ id, name: file.name, size: file.size, status: error ? 'error' : 'queued', progress: 0,
        error, notice: '', retryable: false, retryAt: 0, failures: 0 });
      if (!error) contexts.set(id, { file, confirmFirst: false });
    }
  }
  async function confirm(row: UploadRow, ctx: Context, signal: AbortSignal) {
    row.status = 'confirming';
    await client.confirm(ctx.receipt!.file.id, signal);
  }
  async function process(row: UploadRow, signal: AbortSignal) {
    const ctx = contexts.get(row.id)!;
    if (!ctx.receipt) {
      row.status = 'initializing';
      if (!ctx.prepared) {
        const prepared = await prepareImage(ctx.file);
        if (disposed || signal.aborted) return;
        ctx.file = prepared.file; ctx.prepared = true; row.notice = prepared.notice;
      }
      if (state.authRequired) throw new UploadRequestError('AUTH_REQUIRED');
      ctx.receipt = await client.initiate({ originalName: ctx.file.name.trim().normalize('NFC'), mimeType: ctx.file.type, sizeBytes: ctx.file.size }, row.id, signal);
      if (disposed) return;
      if (ctx.receipt.file.status === 'ACTIVE') return false; // Already finalized replay, not a new confirm notification.
    }
    // Confirm before any resend after a PUT was attempted, even if the previous response was lost/412.
    if (ctx.confirmFirst || !ctx.receipt.upload || Date.now() >= Date.parse(ctx.receipt.upload.expiresAt)) {
      try { await confirm(row, ctx, signal); return true; }
      catch (error) {
        if (!(error instanceof UploadRequestError) || error.code !== 'UPLOAD_NOT_READY') throw error;
      }
    }
    if (disposed) return;
    const access = ctx.receipt.upload;
    if (!access || Date.now() >= Date.parse(access.expiresAt) || Date.now() >= Date.parse(ctx.receipt.file.confirmBy)) {
      throw new UploadRequestError('UPLOAD_EXPIRED');
    }
    row.status = 'uploading'; row.progress = 0;
    ctx.confirmFirst = true;
    try { await client.put(access, ctx.file, signal, value => { if (!disposed) row.progress = value; }); }
    catch {
      if (disposed) return;
      // The storage error body/status is not an application result. A lost response may still have committed the object.
    }
    if (!disposed) { await confirm(row, ctx, signal); return true; }
  }
  async function run(row: UploadRow) {
    const controller = new AbortController(); controllers.add(controller); state.running++;
    try {
      const confirmed = await process(row, controller.signal);
      if (!disposed) { row.status = 'success'; row.progress = 100; contexts.delete(row.id); completedSinceIdle ||= confirmed === true; }
    } catch (cause) {
      if (!disposed) {
        const error = cause instanceof UploadRequestError ? cause : new UploadRequestError('UNAVAILABLE');
        row.status = 'error'; row.error = error.message; row.retryable = error.retryable;
        row.failures++; row.retryAt = Date.now() + Math.max(error.retryAfterMs, Math.min(30_000, 1000 * 2 ** Math.min(row.failures - 1, 5)));
        if (error.code === 'AUTH_REQUIRED') state.authRequired = true;
      }
    } finally {
      controllers.delete(controller); state.running--;
      // One invalidation per drained wave, including partial success and later successful retries.
      if (!disposed && completedSinceIdle && state.running === 0 && !state.rows.some(item => item.status === 'queued')) {
        completedSinceIdle = false; state.completionVersion++;
      }
    }
  }
  async function start() {
    if (disposed || state.running || state.authRequired) return;
    async function worker() {
      while (!disposed && !state.authRequired) {
        const row = state.rows.find(row => row.status === 'queued');
        if (!row) return;
        await run(row);
      }
    }
    await Promise.all([worker(), worker()]);
  }
  function retry(id: string) {
    const row = state.rows.find(row => row.id === id);
    if (!row || disposed || state.authRequired || row.status !== 'error' || !row.retryable || Date.now() < row.retryAt) return;
    row.error = ''; row.status = 'queued'; row.retryable = false;
    void start(); // Running workers will also pick up queued retries; never start a third worker.
  }
  function dispose() { disposed = true; for (const controller of controllers) controller.abort(); contexts.clear(); selected.clear(); }
  return { state, busy, summary, add, start, retry, dispose };
}
