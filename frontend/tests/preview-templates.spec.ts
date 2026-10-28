import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import GalleryCard from '../src/components/GalleryCard.vue';
import PreviewDialog from '../src/components/PreviewDialog.vue';
import { createPreviews } from '../src/gallery/previews';
import { mountModal, restoreModalFocus, observeVisible } from '../src/gallery/modal';
import { galleryFile } from './helpers/gallery-fixture';
const file = galleryFile(1, { originalName: '<script>test</script>.jpg' });
function fixture() {
  const get = vi.fn(); const previews = createPreviews({ get }); previews.retain([file.id]); return { get, previews };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Image/card/native modal SSR templates', () => {
  it('does not fetch in SSR or on card registration and offers a keyboard-native open button', async () => {
    const { get, previews } = fixture(); const html = await renderToString(createSSRApp(GalleryCard, { file, previews, now: Date.now() }));
    expect(get).not.toHaveBeenCalled(); expect(html).toContain('type="button"'); expect(html).toContain('Nagy előnézet:');
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).not.toContain('<img');
  });
  it('renders only a memory URL as a credential-free lazy image, never a download link', async () => {
    const { previews } = fixture(); previews.state.entries[file.id] = { phase: 'ready', url: 'https://storage.invalid/synthetic', expiresAt: Date.now() + 10000, version: 1, error: '', retryable: false, retryAt: 0 };
    const html = await renderToString(createSSRApp(GalleryCard, { file, previews, now: Date.now() }));
    expect(html).toContain('<img'); expect(html).toContain('crossorigin="anonymous"'); expect(html).toContain('referrerpolicy="no-referrer"'); expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('<a'); expect(html).toContain('Kép betöltése…');
  });
  it('renders separate image errors and manual retry/cooldown', async () => {
    const { previews } = fixture(); previews.state.entries[file.id] = { phase: 'error', url: null, expiresAt: 0, version: 1, error: 'Képhiba.', retryable: true, retryAt: 30000 };
    const html = await renderToString(createSSRApp(GalleryCard, { file, previews, now: 0 }));
    expect(html).toContain('role="alert"'); expect(html).toContain('Képhiba.'); expect(html).toContain('30 mp'); expect(html).toMatch(/disabled[^>]*>Kép újrapróbálása/); expect(html).not.toContain('<img');
  });
  it('renders a labelled modal dialog with autofocus close and Escape guidance', async () => {
    const { previews } = fixture(); const html = await renderToString(createSSRApp(PreviewDialog, { file, previews, now: Date.now() }));
    expect(html).toContain('<dialog'); expect(html).toContain('aria-modal="true"'); expect(html).toContain('aria-labelledby="preview-dialog-title"');
    expect(html).toContain('autofocus'); expect(html).toContain('Escape'); expect(html).toContain('Bezárás'); expect(html).toContain('&lt;script&gt;');
  });
});
describe('Native dialog and visibility adapters (fake DOM, not browser proof)', () => {
  it('uses showModal for native focus trapping, focuses close, then restores body scroll', () => {
    const body = { style: { overflow: 'auto' } }; const focus = { focus: vi.fn() };
    const dialog = { open: false, ownerDocument: { body }, showModal: vi.fn(() => { dialog.open = true; }), close: vi.fn(() => { dialog.open = false; }) };
    const cleanup = mountModal(dialog as unknown as HTMLDialogElement, focus as unknown as HTMLElement);
    expect(dialog.showModal).toHaveBeenCalledTimes(1); expect(focus.focus).toHaveBeenCalledTimes(1); expect(body.style.overflow).toBe('hidden');
    cleanup(); expect(dialog.close).toHaveBeenCalledTimes(1); expect(body.style.overflow).toBe('auto');
  });
  it('returns focus to the connected opener or the refresh fallback, never a removed element', () => {
    const opener = { isConnected: true, focus: vi.fn() }; const fallback = { isConnected: true, focus: vi.fn() };
    restoreModalFocus(opener as unknown as HTMLElement, fallback as unknown as HTMLElement); expect(opener.focus).toHaveBeenCalledTimes(1);
    opener.isConnected = false; restoreModalFocus(opener as unknown as HTMLElement, fallback as unknown as HTMLElement); expect(fallback.focus).toHaveBeenCalledTimes(1);
    fallback.isConnected = false; restoreModalFocus(opener as unknown as HTMLElement, fallback as unknown as HTMLElement); expect(opener.focus).toHaveBeenCalledTimes(1); expect(fallback.focus).toHaveBeenCalledTimes(1);
  });
  it('requests once only after visibility and cleans up its observer', () => {
    let callback!: (entries: { isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn(); const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof callback) { callback = cb; } disconnect = disconnect; observe = observe; });
    const visible = vi.fn(); const element = {} as Element; const cleanup = observeVisible(element, visible);
    expect(observe).toHaveBeenCalledWith(element); expect(visible).not.toHaveBeenCalled(); callback([{ isIntersecting: false }]); expect(visible).not.toHaveBeenCalled();
    callback([{ isIntersecting: true }]); callback([{ isIntersecting: true }]); expect(visible).toHaveBeenCalledTimes(1); cleanup(); expect(disconnect).toHaveBeenCalled();
  });
  it('leaves unsupported IntersectionObserver environments for explicit clicking', () => {
    vi.stubGlobal('IntersectionObserver', undefined); const visible = vi.fn(); observeVisible({} as Element, visible)(); expect(visible).not.toHaveBeenCalled();
  });
});
