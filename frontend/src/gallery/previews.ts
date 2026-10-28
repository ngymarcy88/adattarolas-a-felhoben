import { reactive } from 'vue';
import { PreviewRequestError, type PreviewClient } from '../api/preview';

export interface PreviewEntry {
  phase: 'queued' | 'loading' | 'ready' | 'error'; url: string | null; expiresAt: number;
  version: number; error: string; retryable: boolean; retryAt: number;
}
export function createPreviews(client: PreviewClient, onUnauthorized: () => void = () => {}) {
  const state = reactive({ entries: Object.create(null) as Record<string, PreviewEntry>, running: 0, retryAt: 0 });
  let allowed = new Set<string>(); let disposed = false; let version = 0;
  type Task = { id: string; entry: PreviewEntry };
  const queue: Task[] = [];
  const jobs = new Set<Task & { controller: AbortController }>();
  const current = (task: Task) => !disposed && state.entries[task.id] === task.entry;
  function failure(entry: PreviewEntry, error: PreviewRequestError) {
    entry.phase = 'error'; entry.url = null; entry.expiresAt = 0; entry.error = error.message;
    entry.retryable = error.code === 'rate_limited' || error.code === 'unavailable'; entry.retryAt = state.retryAt;
  }
  function stop() {
    disposed = true; queue.length = 0; allowed.clear(); for (const job of jobs) job.controller.abort();
    for (const id of Object.keys(state.entries)) delete state.entries[id];
  }
  async function run(task: Task) {
    const job = { ...task, controller: new AbortController() }; jobs.add(job); state.running++; task.entry.phase = 'loading';
    try {
      const access = await client.get(task.id, job.controller.signal);
      if (!current(task)) return;
      if (Date.parse(access.expiresAt) <= Date.now()) throw new PreviewRequestError('unavailable');
      Object.assign(task.entry, { phase: 'ready', url: access.url, expiresAt: Date.parse(access.expiresAt), error: '', retryable: false });
    } catch (cause) {
      if (!current(task)) return;
      const error = cause instanceof PreviewRequestError ? cause : new PreviewRequestError('unavailable');
      if (error.code === 'unauthorized') { stop(); onUnauthorized(); return; }
      if (error.code === 'rate_limited') {
        state.retryAt = Math.max(state.retryAt, Date.now() + error.retryAfterMs);
        for (const waiting of queue.splice(0)) if (current(waiting)) failure(waiting.entry, error);
      }
      failure(task.entry, error);
    } finally { jobs.delete(job); state.running--; pump(); }
  }
  function pump() {
    if (disposed || Date.now() < state.retryAt) return;
    while (state.running < 4 && queue.length) {
      const task = queue.shift()!; if (current(task)) void run(task);
    }
  }
  function schedule(id: string, manual: boolean) {
    if (disposed || !allowed.has(id)) return;
    const old = state.entries[id];
    if (old && (old.phase === 'loading' || old.phase === 'queued' || (!manual && (old.phase === 'error' || old.expiresAt > Date.now())))) return;
    if (manual && old && (!old.retryable || Date.now() < Math.max(old.retryAt, state.retryAt))) return;
    state.entries[id] = { phase: 'queued', url: null, expiresAt: 0, version: ++version,
      error: '', retryable: false, retryAt: 0 };
    const task = { id, entry: state.entries[id] };
    if (Date.now() < state.retryAt) { failure(task.entry, new PreviewRequestError('rate_limited')); return; }
    queue.push(task); pump();
  }
  function retain(ids: string[]) {
    allowed = new Set(ids);
    for (const id of Object.keys(state.entries)) if (!allowed.has(id)) delete state.entries[id];
    for (const job of jobs) if (!allowed.has(job.id)) job.controller.abort();
    for (let i = queue.length - 1; i >= 0; i--) if (!allowed.has(queue[i].id)) queue.splice(i, 1);
  }
  function imageFailed(id: string, version: number) {
    const entry = state.entries[id]; if (disposed || !entry || entry.version !== version || entry.phase !== 'ready') return;
    Object.assign(entry, { phase: 'error', url: null, expiresAt: 0, retryable: true,
      error: 'A kép nem tölthető be. Ellenőrizd a kapcsolatot, majd próbáld újra.' });
  }
  function clearErrors() {
    if (!disposed) for (const id of Object.keys(state.entries)) if (state.entries[id].phase === 'error') delete state.entries[id];
  }
  return { state, request: (id: string) => schedule(id, false), retry: (id: string) => schedule(id, true), retain, imageFailed, clearErrors, dispose: stop };
}
export type Previews = ReturnType<typeof createPreviews>;
