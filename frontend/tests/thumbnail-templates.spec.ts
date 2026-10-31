import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import GalleryCard from '../src/components/GalleryCard.vue';
import PreviewDialog from '../src/components/PreviewDialog.vue';
import { createProcessing } from '../src/gallery/processing';
import { createPreviews, createPreviewPool } from '../src/gallery/previews';
import { observeVisibility } from '../src/gallery/modal';
import { processingStatus as row } from './helpers/processing-fixture';
import { galleryFile } from './helpers/gallery-fixture';
const file = galleryFile();
function fixture(state: Parameters<typeof row>[1]) {
  const processing = createProcessing({ status: vi.fn(), retry: vi.fn() }); processing.retain([file.id]); processing.setVisible(file.id, true); processing.state.entries[file.id].status = row(1, state);
  const previews = createPreviews({ get: vi.fn() }); previews.retain([file.id]); return { processing, previews };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('Thumbnail processing card templates', () => {
  it.each([['QUEUED', 'Kisképre várakozik'], ['RUNNING', 'Kiskép készítése…'], ['RETRY_WAIT', 'Újabb feldolgozásra vár'], ['FAILED', 'A kiskép feldolgozása sikertelen'],
    ['BLOCKED_QUOTA', 'Nincs elég tárhely a kisképhez'], ['NOT_SCHEDULED', 'Kiskép nincs ütemezve']] as const)('distinguishes %s without disabling original open', async (state, label) => {
    const x = fixture(state); const html = await renderToString(createSSRApp(GalleryCard, { file, ...x, now: Date.now() }));
    expect(html).toContain(label); expect(html).toContain('Az eredeti kép'); expect(html).toMatch(/aria-label="Nagy előnézet:[^"]*"/); expect(html.match(/<button[^>]*>/)![0]).not.toMatch(/\sdisabled(?:\s|=|>)/);
    expect(html.includes('Feldolgozás újrapróbálása')).toBe(['FAILED', 'BLOCKED_QUOTA'].includes(state));
  });
  it('shows separate status, processor and image errors, preserves original open and retry cooldown', async () => {
    const x = fixture('FAILED'); const e = x.processing.state.entries[file.id]; e.error = 'Állapot hiba.'; e.retryError = 'Processor retry hiba.'; x.processing.state.retryAt = 30000;
    const html = await renderToString(createSSRApp(GalleryCard, { file, ...x, now: 0 }));
    expect(html).toContain('Állapot újrapróbálása'); expect(html).toContain('Processor retry hiba.'); expect(html).toContain('30 mp'); expect(html).toContain('Az eredeti kép');
    expect(html).not.toContain('>Kiskép újrapróbálása');
  });
  it('renders thumbnail on card and original in dialog using distinct memory managers', async () => {
    const x = fixture('SUCCEEDED'); const original = createPreviews({ get: vi.fn() }); original.retain([file.id]);
    const image = (url: string) => ({ phase: 'ready' as const, url, expiresAt: Date.now() + 10000, version: 1, error: '', retryable: false, retryAt: 0 });
    x.previews.state.entries[file.id] = image('https://storage.invalid/thumbnail-synthetic'); original.state.entries[file.id] = image('https://storage.invalid/original-synthetic');
    const card = await renderToString(createSSRApp(GalleryCard, { file, ...x, now: Date.now() }));
    const dialog = await renderToString(createSSRApp(PreviewDialog, { file, previews: original, now: Date.now() }));
    expect(card).toContain('thumbnail-synthetic'); expect(card).not.toContain('original-synthetic'); expect(dialog).toContain('original-synthetic'); expect(dialog).not.toContain('thumbnail-synthetic');
    expect(card).toContain('crossorigin="anonymous"'); expect(card).toContain('referrerpolicy="no-referrer"'); expect(card).not.toContain('Feldolgozás újrapróbálása');
    x.previews.imageFailed(file.id, 1);
    const failed = await renderToString(createSSRApp(GalleryCard, { file, ...x, now: Date.now() }));
    expect(failed).toContain('Kiskép újrapróbálása'); expect(failed).toContain('Az eredeti kép'); expect(original.state.entries[file.id].url).toContain('original-synthetic');
  });
  it('updates continuous viewport visibility, including cleanup', () => {
    const element = {} as Element; let callback!: (entries: { target: Element; isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn(); vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof callback) { callback = cb; } observe() {} disconnect = disconnect; });
    const changed = vi.fn(); const cleanup = observeVisibility(element, changed);
    callback([{ target: element, isIntersecting: true }]); callback([{ target: element, isIntersecting: false }]); cleanup();
    expect(changed.mock.calls.map(call => call[0])).toEqual([true, false, false]); expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
describe('Shared original/thumbnail physical URL budget', () => {
  it('limits combined requests to four, discards cancelled waiting tasks, holds active slots until settlement', async () => {
    const pool = createPreviewPool(); const completions: (() => void)[] = [];
    const get = vi.fn((_id: string, _signal: AbortSignal) => new Promise<{ url: string; expiresAt: string }>(resolve => { completions.push(() => resolve({ url: 'https://storage.invalid/synthetic', expiresAt: new Date(Date.now() + 10000).toISOString() })); }));
    const a = pool({ get }); const b = pool({ get }); const controllers = Array.from({ length: 6 }, () => new AbortController());
    const pending = controllers.map((controller, i) => (i % 2 ? a : b).get(file.id, controller.signal).catch(() => null));
    await Promise.resolve(); expect(get).toHaveBeenCalledTimes(4); controllers[0].abort(); controllers[4].abort(); await Promise.resolve(); expect(get).toHaveBeenCalledTimes(4);
    completions[0](); await pending[0]; await new Promise(resolve => setTimeout(resolve, 0)); expect(get).toHaveBeenCalledTimes(5);
    for (const complete of completions) complete(); await Promise.all(pending);
  });
  it('invalidates one thumbnail URL and rejects a late old reply without affecting originals', async () => {
    let resolve!: (v: { url: string; expiresAt: string }) => void;
    const get = vi.fn(() => new Promise<{ url: string; expiresAt: string }>(r => { resolve = r; })); const thumbs = createPreviews({ get });
    thumbs.retain([file.id]); thumbs.request(file.id); thumbs.invalidate(file.id); resolve({ url: 'https://storage.invalid/old', expiresAt: new Date(Date.now() + 10000).toISOString() });
    await new Promise(r => setTimeout(r, 0)); expect(thumbs.state.entries[file.id]).toBeUndefined(); thumbs.dispose();
  });
});
