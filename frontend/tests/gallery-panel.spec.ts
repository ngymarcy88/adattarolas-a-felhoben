import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import GalleryPanel from '../src/components/GalleryPanel.vue';
import * as galleryModule from '../src/gallery/state';
import { galleryFile as file } from './helpers/gallery-fixture';

const owner = '00000000-0000-4000-8000-000000000001';
const client = { list: vi.fn() };
const render = (disabled = false) => renderToString(createSSRApp(GalleryPanel, { ownerId: owner, disabled }));
function setup() {
  const gallery = galleryModule.createGallery(client); vi.spyOn(galleryModule, 'createGallery').mockReturnValue(gallery); return gallery;
}
afterEach(() => vi.restoreAllMocks());
describe('Metadata gallery templates (isolated SSR, not browser evidence)', () => {
  it('shows first-load feedback without a premature empty state', async () => {
    const gallery = setup(); gallery.state.loading = 'refresh'; const html = await render();
    expect(html).toContain('Képek listájának betöltése…'); expect(html).toContain('aria-busy="true"'); expect(html).toContain('role="status"');
    expect(html).not.toContain('Még nincs feltöltött képed.'); expect(client.list).not.toHaveBeenCalled();
  });
  it('offers upload from a real empty success and no next-page button', async () => {
    const gallery = setup(); gallery.state.loaded = true; const html = await render();
    expect(html).toContain('Még nincs feltöltött képed.'); expect(html).toContain('href="#upload-title"'); expect(html).not.toContain('További képek</button>');
  });
  it('renders filename/size/date cards with escaped text, no image or preview requests', async () => {
    const gallery = setup(); gallery.state.loaded = true; gallery.state.items = [file(1, { originalName: '<img src=x onerror=alert(1)>.jpg' })];
    const html = await render(); expect(html).toContain('&lt;img'); expect(html).not.toContain('<img'); expect(html).not.toMatch(/<iframe|<video|<picture/);
    expect(html).toContain('1 MiB'); expect(html).toContain('datetime="2026-10-28T10:00:00.000Z"'); expect(html).toContain('1 betöltött kép');
    expect(html).toContain('aria-label="Saját képek"'); expect(html).toContain('Létrehozva'); expect(client.list).not.toHaveBeenCalled();
  });
  it('keeps cards during page loading and disables more requests', async () => {
    const gallery = setup(); Object.assign(gallery.state, { loaded: true, items: [file()], nextCursor: 'next', loading: 'more' });
    const html = await render(); expect(html).toContain('photo-1.jpg'); expect(html).toContain('További képek betöltése…'); expect(html).toMatch(/disabled[^>]*>További képek<\/button>/);
  });
  it('shows safe retry feedback beside retained cards on a pagination failure', async () => {
    const gallery = setup(); Object.assign(gallery.state, { loaded: true, items: [file()], nextCursor: 'next', error: 'Átmeneti hiba.' });
    const html = await render(); expect(html).toContain('photo-1.jpg'); expect(html).toContain('role="alert"'); expect(html).toContain('Újrapróbálás');
    expect(html).not.toContain('További képek</button>');
  });
  it('explains reset on an invalid cursor without removing the old cards', async () => {
    const gallery = setup(); Object.assign(gallery.state, { loaded: true, items: [file()], error: 'Lapozási hiba.', resetRequired: true });
    const html = await render(); expect(html).toContain('photo-1.jpg'); expect(html).toContain('első oldalt tölti újra'); expect(html).toContain('Lista frissítése');
  });
  it('disables retry for the remaining rate-limit delay and while logging out', async () => {
    const gallery = setup(); gallery.state.error = 'Várj.'; gallery.state.retryAt = Date.now() + 30000;
    const html = await render(); expect(html).toContain('30 mp'); expect(html).toMatch(/disabled[^>]*>Újrapróbálás/);
    gallery.state.retryAt = 0; expect(await render(true)).toMatch(/disabled[^>]*>Lista frissítése/);
  });
});
