import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import UploadPanel from '../src/components/UploadPanel.vue';
import * as batches from '../src/upload/batch';
import type { UploadClient } from '../src/api/uploads';

const client = { initiate: vi.fn(), confirm: vi.fn(), put: vi.fn() } as UploadClient;
async function render(disabled = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/login', component: { template: '<div />' } }] });
  await router.push('/');
  return renderToString(createSSRApp(UploadPanel, { disabled }).use(router));
}
afterEach(() => vi.restoreAllMocks());
describe('upload panel isolated template rendering', () => {
  it('shows an accessible empty picker, image limits and honest page-lifetime guidance', async () => {
    const html = await render();
    expect(html).toContain('type="file" multiple'); expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/gif"');
    expect(html).toContain('for="upload-files"'); expect(html).toContain('aria-describedby="upload-help upload-lifetime"');
    expect(html).toContain('Még nem választottál képet.'); expect(html).toContain('legfeljebb 20'); expect(html).toContain('100 MiB');
    expect(html).toContain('elölről indul'); expect(html).toContain('foglalás megmaradhat');
  });
  it('escapes filenames, renders progress and keeps confirmation distinct from success', async () => {
    const batch = batches.createUploadBatch(client); batch.add([new File(['x'], '<img src=x onerror=alert(1)>.png', { type: 'image/png' }), new File(['x'], 'b.png', { type: 'image/png' })]);
    batch.state.rows[0].status = 'uploading'; batch.state.rows[0].progress = 75;
    batch.state.rows[1].status = 'confirming'; batch.state.running = 2;
    vi.spyOn(batches, 'createUploadBatch').mockReturnValue(batch); const html = await render();
    expect(html).toContain('&lt;img'); expect(html).not.toContain('<img'); expect(html).toContain('<progress value="75" max="100"');
    expect(html).toContain('75%'); expect(html).toContain('Ellenőrzés és véglegesítés…'); expect(html).toContain('0 / 2 sikeres');
    expect(html).toContain('aria-busy="true"'); expect(html).toMatch(/type="file"[^>]*disabled/); expect(html).toContain('Feltöltés folyamatban…');
  });
  it('renders independent safe errors, delayed retry and partial success without implying processing', async () => {
    const batch = batches.createUploadBatch(client); batch.add([new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.png', { type: 'image/png' })]);
    batch.state.rows[0].status = 'success'; Object.assign(batch.state.rows[1], { status: 'error', error: 'Átmeneti hiba.', retryable: true, retryAt: Date.now() + 60_000 });
    vi.spyOn(batches, 'createUploadBatch').mockReturnValue(batch); const html = await render();
    expect(html).toContain('1 / 2 sikeres · 1 hibás'); expect(html).toContain('Sikeresen feltöltve'); expect(html).toContain('role="alert"');
    expect(html).toContain('Átmeneti hiba.'); expect(html).toContain('aria-label="b.png újrapróbálása"'); expect(html).toContain('Újrapróbálás');
    expect(html).toContain('Galéria és képfeldolgozás még nem érhető el.');
  });
  it('offers login and paused-state explanation after session loss', async () => {
    const batch = batches.createUploadBatch(client); batch.state.authRequired = true;
    vi.spyOn(batches, 'createUploadBatch').mockReturnValue(batch); const html = await render();
    expect(html).toContain('href="/login"'); expect(html).toContain('további fájlokat nem indítunk'); expect(html).toContain('helyi állapota elveszik');
    expect(html).toMatch(/type="file"[^>]*disabled/);
  });
  it('disables the picker during logout without destroying queue state', async () => {
    const html = await render(true); expect(html).toMatch(/type="file"[^>]*disabled/);
  });
  it('shows an escaped correction notice next to the original selected name', async () => {
    const batch = batches.createUploadBatch(client); batch.add([new File(['x'], 'cashback.png', { type: 'image/png' })]);
    batch.state.rows[0].notice = 'A felismert formátum JPEG. Feltöltési név: <cashback>.jpg.';
    vi.spyOn(batches, 'createUploadBatch').mockReturnValue(batch); const html = await render();
    expect(html).toContain('cashback.png'); expect(html).toContain('A felismert formátum JPEG.');
    expect(html).toContain('&lt;cashback&gt;.jpg'); expect(html).not.toContain('<cashback>');
  });
});
