import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGallery } from '../src/gallery/state';
import { GalleryRequestError, type GalleryClient, type GalleryPage } from '../src/api/gallery';
import { galleryFile as file, galleryPage as page } from './helpers/gallery-fixture';

function setup() {
  const client = { list: vi.fn<GalleryClient['list']>().mockResolvedValue(page()) }; const unauthorized = vi.fn();
  return { client, unauthorized, gallery: createGallery(client, unauthorized) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Gallery state and pagination', () => {
  it('separates initial loading and successful empty data', async () => {
    const { client, gallery } = setup(); let finish!: (value: GalleryPage) => void;
    client.list.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = gallery.refresh(); expect(gallery.state.loading).toBe('refresh'); expect(gallery.state.loaded).toBe(false);
    finish(page([])); await pending; expect(gallery.state.loaded).toBe(true); expect(gallery.state.loading).toBeNull(); expect(gallery.state.items).toEqual([]);
  });
  it('preserves API order, deduplicates within/across pages and stops at the end', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file(3), file(2), file(2)], 'page2'))
      .mockResolvedValueOnce(page([file(2), file(1)]));
    await gallery.refresh(); await gallery.loadMore(); await gallery.loadMore();
    expect(gallery.state.items.map(item => item.id)).toEqual([file(3).id, file(2).id, file(1).id]);
    expect(client.list.mock.calls.map(call => call[0])).toEqual([null, 'page2']); expect(gallery.state.nextCursor).toBeNull();
  });
  it('ignores duplicate load-more clicks and keeps existing cards during pagination', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2')); await gallery.refresh();
    let finish!: (value: GalleryPage) => void; client.list.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = gallery.loadMore(); await gallery.loadMore(); expect(client.list).toHaveBeenCalledTimes(2);
    expect(gallery.state.loading).toBe('more'); expect(gallery.state.items).toHaveLength(1);
    finish(page([file(2)])); await pending; expect(gallery.state.items).toHaveLength(2);
  });
  it('keeps cards/cursor after page failure and retries that exact page', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2'))
      .mockRejectedValueOnce(new GalleryRequestError('unavailable')).mockResolvedValueOnce(page([file(), file(2)]));
    await gallery.refresh(); await gallery.loadMore(); expect(gallery.state.items).toEqual([file()]); expect(gallery.state.nextCursor).toBe('page2');
    expect(gallery.state.error).not.toBe(''); await gallery.retry();
    expect(client.list.mock.calls.map(call => call[0])).toEqual([null, 'page2', 'page2']); expect(gallery.state.items).toHaveLength(2); expect(gallery.state.error).toBe('');
  });
  it('retries a first-page failure from the beginning', async () => {
    const { client, gallery } = setup(); client.list.mockRejectedValueOnce(new Error('private API URL')).mockResolvedValueOnce(page());
    await gallery.refresh(); expect(gallery.state.error).not.toContain('private'); await gallery.retry();
    expect(client.list.mock.calls.map(call => call[0])).toEqual([null, null]); expect(gallery.state.loaded).toBe(true);
  });
  it('restarts the chain on invalid cursor while retaining cards until refresh succeeds', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2'))
      .mockRejectedValueOnce(new GalleryRequestError('cursor_invalid')).mockResolvedValueOnce(page([file(9)], 'newpage2'));
    await gallery.refresh(); await gallery.loadMore(); await gallery.loadMore(); expect(client.list).toHaveBeenCalledTimes(2);
    expect(gallery.state.items).toEqual([file()]); expect(gallery.state.resetRequired).toBe(true);
    await gallery.retry(); expect(client.list.mock.calls[2][0]).toBeNull(); expect(gallery.state.items).toEqual([file(9)]); expect(gallery.state.nextCursor).toBe('newpage2');
  });
  it('detects repeated/looping next cursors without committing the broken page', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2'))
      .mockResolvedValueOnce(page([file(2)], 'page3')).mockResolvedValueOnce(page([file(3)], 'page2'));
    await gallery.refresh(); await gallery.loadMore(); await gallery.loadMore();
    expect(gallery.state.items).toEqual([file(), file(2)]); expect(gallery.state.resetRequired).toBe(true); expect(gallery.state.error).toBe(new GalleryRequestError('cursor_invalid').message);
  });
  it('retains cards on refresh failure but never continues the old cursor chain', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2')).mockRejectedValueOnce(new GalleryRequestError('unavailable'));
    await gallery.refresh(); await gallery.refresh(); await gallery.loadMore();
    expect(gallery.state.items).toEqual([file()]); expect(gallery.state.resetRequired).toBe(true); expect(client.list).toHaveBeenCalledTimes(2);
  });
  it('supersedes an old request, aborts it and ignores its late result', async () => {
    const { client, gallery } = setup(); let old!: (value: GalleryPage) => void;
    client.list.mockReturnValueOnce(new Promise(resolve => { old = resolve; })).mockResolvedValueOnce(page([file(2)]));
    const first = gallery.refresh(); await gallery.refresh(); old(page([file(1)])); await first;
    expect(client.list.mock.calls[0][1].aborted).toBe(true); expect(gallery.state.items).toEqual([file(2)]); expect(gallery.state.loading).toBeNull();
  });
  it('honors rate waiting for refresh and retry without losing the current page', async () => {
    vi.useFakeTimers(); const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2'))
      .mockRejectedValueOnce(new GalleryRequestError('rate_limited', 12000)).mockResolvedValueOnce(page([file(2)]));
    await gallery.refresh(); await gallery.loadMore(); const until = Date.now() + 12000;
    expect(gallery.state.retryAt).toBe(until); await gallery.retry(); await gallery.refresh(); expect(client.list).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12000); await gallery.retry(); expect(client.list.mock.calls[2][0]).toBe('page2'); expect(gallery.state.items).toHaveLength(2);
  });
  it('clears data before notifying session expiry and cannot request more with the expired session', async () => {
    const { client, gallery, unauthorized } = setup(); client.list.mockResolvedValueOnce(page([file()], 'page2')).mockRejectedValueOnce(new GalleryRequestError('unauthorized'));
    unauthorized.mockImplementation(() => expect(gallery.state.items).toEqual([]));
    await gallery.refresh(); await gallery.loadMore(); expect(unauthorized).toHaveBeenCalledTimes(1); expect(gallery.state.unauthorized).toBe(true);
    expect(gallery.state.nextCursor).toBeNull(); await gallery.retry(); await gallery.refresh(); expect(client.list).toHaveBeenCalledTimes(2);
  });
  it('disposes account data, aborts pending work and ignores late success or 401 callbacks', async () => {
    for (const reject of [false, true]) {
      const { client, gallery, unauthorized } = setup(); let finish!: (value: GalleryPage) => void; let fail!: (error: Error) => void;
      client.list.mockResolvedValueOnce(page([file()], 'page2')).mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
      await gallery.refresh(); const pending = gallery.loadMore(); gallery.dispose();
      expect(client.list.mock.calls[1][1].aborted).toBe(true);
      if (reject) fail(new GalleryRequestError('unauthorized')); else finish(page([file(2)]));
      await pending; await gallery.refresh(); expect(gallery.state.items).toEqual([]); expect(unauthorized).not.toHaveBeenCalled(); expect(client.list).toHaveBeenCalledTimes(2);
    }
  });
});
