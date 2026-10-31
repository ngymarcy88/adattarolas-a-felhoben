import { afterEach, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import * as galleryState from '../src/gallery/state';
import * as processingState from '../src/gallery/processing';
import * as previewState from '../src/gallery/previews';
import { galleryPage } from './helpers/gallery-fixture';
import * as modal from '../src/gallery/modal';
import { createPreviews } from '../src/gallery/previews';
import { createProcessing } from '../src/gallery/processing';
import { galleryFile } from './helpers/gallery-fixture';
import { processingStatus } from './helpers/processing-fixture';
import { clientComponent, componentModule, renderer, hostNode } from './helpers/client-renderer';
const image = clientComponent('GalleryImage', {});
const card = clientComponent('GalleryCard', { '../gallery/modal': modal, './GalleryImage.vue': componentModule(image) });
afterEach(() => { vi.unstubAllGlobals(); });
it('requests a thumbnail when the mounted visible card changes from queued to succeeded', async () => {
  vi.stubGlobal('IntersectionObserver', class { constructor(private cb: (e: unknown[]) => void) {} observe(target: unknown) { this.cb([{ target, isIntersecting: true }]); } disconnect() {} });
  const file = galleryFile(); const get = vi.fn().mockResolvedValue({ url: 'https://storage.invalid/thumbnail', expiresAt: new Date(Date.now() + 60000).toISOString() });
  const previews = createPreviews({ get }); previews.retain([file.id]);
  const processing = createProcessing({ status: vi.fn(), retry: vi.fn() }); processing.retain([file.id]); processing.setVisible(file.id, true);
  processing.state.entries[file.id].status = processingStatus();
  const root = hostNode(); const app = renderer.createApp(card, { file, previews, processing, now: Date.now(), disabled: false }); app.mount(root);
  await nextTick(); expect(get).not.toHaveBeenCalled();
  processing.state.entries[file.id].status = processingStatus(1, 'SUCCEEDED');
  await nextTick(); await Promise.resolve(); await nextTick(); expect(get).toHaveBeenCalledTimes(1);
  app.unmount(); previews.dispose(); processing.dispose();
});

const dialog = clientComponent('PreviewDialog', { '../gallery/modal': modal, './GalleryImage.vue': componentModule(image) });
it('loads ready thumbnails through the real gallery parent lifecycle', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('IntersectionObserver', class { constructor(private cb: (e: unknown[]) => void) {} observe(target: unknown) { setTimeout(() => this.cb([{ target, isIntersecting: true }]), 0); } disconnect() {} });
  const file = galleryFile(); const get = vi.fn().mockResolvedValue({ url: 'https://storage.invalid/thumbnail', expiresAt: new Date(Date.now() + 60000).toISOString() });
  const status = vi.fn().mockResolvedValueOnce([processingStatus()]).mockResolvedValue([processingStatus(1, 'SUCCEEDED')]);
  const panel = clientComponent('GalleryPanel', { '../api/gallery': { galleryClient: { list: vi.fn().mockResolvedValue(galleryPage([file])) } },
    '../api/preview': { previewClient: { get: vi.fn() }, thumbnailClient: { get } }, '../api/processing': { processingClient: { status, retry: vi.fn() } },
    '../gallery/state': galleryState, '../gallery/processing': processingState, '../gallery/previews': previewState, '../gallery/modal': modal,
    './GalleryCard.vue': componentModule(card), './PreviewDialog.vue': componentModule(dialog) });
  const root = hostNode(); const app = renderer.createApp(panel, { ownerId: 'test-owner' }); app.mount(root);
  try { await nextTick(); await vi.advanceTimersByTimeAsync(10); await nextTick(); expect(get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000); await nextTick();
    expect(status).toHaveBeenCalledTimes(2); expect(get).toHaveBeenCalledTimes(1);
  } finally { app.unmount(); vi.clearAllTimers(); vi.useRealTimers(); }
});
it('keeps the thumbnail when visibility and a completed result arrive in the same update batch', async () => {
  let show!: () => void;
  vi.stubGlobal('IntersectionObserver', class { constructor(private cb: (e: unknown[]) => void) {} observe(target: unknown) { show = () => this.cb([{ target, isIntersecting: true }]); } disconnect() {} });
  const file = galleryFile(); const get = vi.fn().mockResolvedValue({ url: 'https://storage.invalid/thumbnail', expiresAt: new Date(Date.now() + 60000).toISOString() });
  const previews = createPreviews(previewState.createPreviewPool()({ get })); previews.retain([file.id]);
  const processing = createProcessing({ status: vi.fn(), retry: vi.fn() }); processing.retain([file.id]); processing.setVisible(file.id, true); processing.state.entries[file.id].status = processingStatus();
  const root = hostNode(); const app = renderer.createApp(card, { file, previews, processing, now: Date.now() }); app.mount(root);
  try {
    show(); processing.state.entries[file.id].status = processingStatus(1, 'SUCCEEDED');
    await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
    expect(previews.state.entries[file.id]?.phase).toBe('ready');
    expect(get).toHaveBeenCalledTimes(1);
    previews.imageFailed(file.id, previews.state.entries[file.id].version);
    await nextTick(); expect(get).toHaveBeenCalledTimes(1);
    expect(previews.state.entries[file.id].phase).toBe('error');
    previews.retry(file.id); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
    expect(get).toHaveBeenCalledTimes(2); expect(previews.state.entries[file.id].phase).toBe('ready');
    processing.state.entries[file.id].status = processingStatus(1, 'SUCCEEDED', { result: { ...processingStatus(1, 'SUCCEEDED').result!, id: galleryFile(2001).id } });
    await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
    expect(get).toHaveBeenCalledTimes(3); expect(previews.state.entries[file.id].phase).toBe('ready');
  } finally { app.unmount(); previews.dispose(); processing.dispose(); }
});
