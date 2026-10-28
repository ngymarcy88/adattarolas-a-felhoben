import { reactive } from 'vue';
import { GalleryRequestError, type GalleryClient, type GalleryFile } from '../api/gallery';

/** Component/account lifetime only. No persistent cache or preview/storage requests. */
export function createGallery(client: GalleryClient, onUnauthorized: () => void = () => {}) {
  const state = reactive({ items: [] as GalleryFile[], loaded: false, loading: null as 'refresh' | 'more' | null,
    nextCursor: null as string | null, error: '', resetRequired: false, unauthorized: false, retryAt: 0 });
  const cursors = new Set<string>();
  let generation = 0; let disposed = false; let controller: AbortController | undefined;
  async function load(reset: boolean) {
    if (disposed || state.unauthorized || Date.now() < state.retryAt || (!reset && (state.loading || state.resetRequired || !state.nextCursor))) return;
    const cursor = reset ? null : state.nextCursor;
    controller?.abort(); controller = new AbortController(); const attempt = ++generation;
    state.loading = reset ? 'refresh' : 'more'; state.error = '';
    if (reset) { state.nextCursor = null; state.resetRequired = true; }
    try {
      const page = await client.list(cursor, controller.signal);
      if (disposed || attempt !== generation) return;
      if (!reset && page.nextCursor && cursors.has(page.nextCursor)) throw new GalleryRequestError('cursor_invalid');
      const items = reset ? [] : [...state.items]; const seen = new Set(items.map(file => file.id));
      for (const file of page.items) if (!seen.has(file.id)) { seen.add(file.id); items.push(file); }
      if (reset) cursors.clear(); if (page.nextCursor) cursors.add(page.nextCursor);
      state.items = items; state.nextCursor = page.nextCursor; state.loaded = true; state.resetRequired = false; state.retryAt = 0;
    } catch (cause) {
      if (disposed || attempt !== generation) return;
      const error = cause instanceof GalleryRequestError ? cause : new GalleryRequestError('unavailable');
      state.error = error.message;
      if (error.code === 'cursor_invalid') state.resetRequired = true;
      if (error.code === 'rate_limited') state.retryAt = Date.now() + error.retryAfterMs;
      if (error.code === 'unauthorized') {
        state.items = []; state.nextCursor = null; state.loaded = false; state.unauthorized = true; cursors.clear();
        onUnauthorized();
      }
    } finally { if (!disposed && attempt === generation) state.loading = null; }
  }
  const refresh = () => load(true);
  const loadMore = () => load(false);
  const retry = () => state.resetRequired || !state.loaded ? refresh() : loadMore();
  function dispose() { disposed = true; generation++; controller?.abort(); state.items = []; state.nextCursor = null; cursors.clear(); }
  return { state, refresh, loadMore, retry, dispose };
}
