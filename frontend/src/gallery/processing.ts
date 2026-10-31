import { reactive } from 'vue';
import { ProcessingRequestError, type ProcessingClient, type ProcessingStatus } from '../api/processing';

export interface ProcessingEntry {
  status: ProcessingStatus | null; loading: boolean; error: string; retryError: string;
  pendingRevision: number | null; generation: number; due: number;
}
const transient = (state: string) => ['QUEUED', 'RUNNING', 'RETRY_WAIT'].includes(state);
export function createProcessing(client: ProcessingClient, onUnauthorized: () => void = () => {}) {
  const state = reactive({ entries: Object.create(null) as Record<string, ProcessingEntry>, retryAt: 0, retryingId: null as string | null });
  let allowed = new Set<string>(); const visible = new Set<string>();
  let active = false; let disposed = false; let nextReadAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  type Read = { controller: AbortController; entries: { id: string; entry: ProcessingEntry; generation: number }[] };
  let reading: Read | undefined; let retrying: AbortController | undefined;
  const usable = (id: string) => !disposed && active && allowed.has(id) && visible.has(id);
  function entry(id: string) {
    return state.entries[id] ??= { status: null, loading: false, error: '', retryError: '', pendingRevision: null, generation: 0, due: 0 };
  }
  function schedule() {
    clearTimeout(timer); timer = undefined;
    if (!active || disposed || reading) return;
    const candidates = [...visible].filter(id => allowed.has(id)).map(id => entry(id)).filter(e => !e.error && !e.loading && state.retryingId !== e.status?.fileId);
    const earliest = Math.min(...candidates.map(e => e.due));
    if (!Number.isFinite(earliest)) return;
    timer = setTimeout(() => { timer = undefined; void read(); }, Math.max(0, earliest - Date.now(), nextReadAt - Date.now(), state.retryAt - Date.now()));
  }
  async function read() {
    if (reading || !active || disposed) return;
    const ids = [...visible].filter(id => usable(id) && !entry(id).error && !entry(id).loading && state.retryingId !== id && entry(id).due <= Date.now())
      .sort((a, b) => entry(a).due - entry(b).due).slice(0, 20);
    if (!ids.length) { schedule(); return; }
    const task: Read = { controller: new AbortController(), entries: ids.map(id => ({ id, entry: entry(id), generation: entry(id).generation })) };
    reading = task; nextReadAt = Date.now() + 10000;
    for (const item of task.entries) item.entry.loading = true;
    const current = (item: Read['entries'][number]) => usable(item.id) && !task.controller.signal.aborted && state.entries[item.id] === item.entry && item.entry.generation === item.generation;
    try {
      const statuses = await client.status(ids, task.controller.signal);
      for (let i = 0; i < task.entries.length; i++) {
        const item = task.entries[i]; if (!current(item)) continue;
        item.entry.status = statuses[i]; item.entry.error = '';
        item.entry.due = transient(statuses[i].state) ? Date.now() + 10000 : Infinity;
      }
    } catch (cause) {
      if (task.controller.signal.aborted || disposed || !active) return;
      const error = cause instanceof ProcessingRequestError ? cause : new ProcessingRequestError('unavailable');
      if (error.code === 'unauthorized') { dispose(); onUnauthorized(); return; }
      if (error.code === 'rate_limited') state.retryAt = Math.max(state.retryAt, Date.now() + error.retryAfterMs);
      // Every read error stops automatic polling for this batch; manual status refresh remains available.
      for (const item of task.entries) if (current(item)) { item.entry.error = error.message; item.entry.due = Infinity; }
    } finally {
      for (const item of task.entries) if (state.entries[item.id] === item.entry) item.entry.loading = false;
      if (reading === task) reading = undefined;
      schedule();
    }
  }
  function retain(ids: string[]) {
    if (disposed) return;
    allowed = new Set(ids);
    for (const id of Object.keys(state.entries)) if (!allowed.has(id)) { delete state.entries[id]; visible.delete(id); }
    if (reading?.entries.some(item => !allowed.has(item.id))) reading.controller.abort();
    if (state.retryingId && !allowed.has(state.retryingId)) retrying?.abort();
    schedule();
  }
  function setVisible(id: string, value: boolean) {
    if (disposed) return;
    if (value && allowed.has(id)) { visible.add(id); entry(id); }
    else { visible.delete(id); if (reading?.entries.every(item => !visible.has(item.id))) reading.controller.abort(); }
    schedule();
  }
  function setActive(value: boolean) {
    if (disposed) return;
    active = value;
    if (!value) { clearTimeout(timer); timer = undefined; reading?.controller.abort(); retrying?.abort(); }
    schedule();
  }
  function refresh(id?: string) {
    if (disposed || Date.now() < state.retryAt) return;
    for (const key of id ? [id] : [...visible]) if (allowed.has(key)) { const e = entry(key); e.error = ''; e.due = 0; }
    schedule();
  }
  function canRetry(id: string) {
    const s = state.entries[id]?.status;
    return !!s && s.retryable && ['FAILED', 'BLOCKED_QUOTA', 'CANCELLED'].includes(s.state) && s.retryRevision < 2 && s.attemptCount < 9 && !s.result;
  }
  async function retry(id: string) {
    if (!usable(id) || state.retryingId || Date.now() < state.retryAt || !canRetry(id)) return;
    const e = entry(id); e.pendingRevision ??= e.status!.retryRevision;
    const revision = e.pendingRevision; const generation = ++e.generation;
    if (reading?.entries.some(item => item.id === id)) reading.controller.abort();
    const controller = new AbortController(); retrying = controller; state.retryingId = id; e.retryError = '';
    const current = () => !disposed && allowed.has(id) && state.entries[id] === e && e.generation === generation;
    try {
      const result = await client.retry(id, revision, controller.signal);
      if (!current() || controller.signal.aborted || !active) return;
      e.status = { ...e.status!, ...result, errorCode: null, retryable: false, nextAttemptAt: null, result: null };
      e.pendingRevision = null; e.error = ''; e.due = 0;
    } catch (cause) {
      if (!current()) return;
      const error = cause instanceof ProcessingRequestError ? cause : new ProcessingRequestError('unavailable');
      if (error.code === 'unauthorized' && !controller.signal.aborted) { dispose(); onUnauthorized(); return; }
      if (error.code === 'rate_limited') state.retryAt = Math.max(state.retryAt, Date.now() + error.retryAfterMs);
      // Keep the submitted revision after uncertain delivery; a manual replay must not start another cycle.
      e.retryError = controller.signal.aborted ? 'A kérés megszakadt. Ellenőrizd az állapotot, vagy próbáld újra.' : error.message;
      if (error.code === 'conflict') { e.pendingRevision = null; e.due = 0; e.error = ''; }
    } finally {
      if (retrying === controller) { retrying = undefined; state.retryingId = null; }
      schedule();
    }
  }
  function dispose() {
    disposed = true; active = false; clearTimeout(timer); reading?.controller.abort(); retrying?.abort(); visible.clear(); allowed.clear();
    for (const id of Object.keys(state.entries)) delete state.entries[id];
  }
  return { state, retain, setVisible, setActive, refresh, retry, canRetry, dispose };
}
export type Processing = ReturnType<typeof createProcessing>;
