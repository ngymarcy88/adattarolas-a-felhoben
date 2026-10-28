import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGallery } from '../src/gallery/state';
import { createGalleryRefreshSignal } from '../src/gallery/refresh-signal';
import { GalleryRequestError, type GalleryClient, type GalleryPage } from '../src/api/gallery';
import { galleryFile as file, galleryPage as page } from './helpers/gallery-fixture';

function setup() {
  vi.useFakeTimers();
  const client = { list: vi.fn<GalleryClient['list']>().mockResolvedValue(page()) };
  return { client, gallery: createGallery(client) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Coalesced gallery refresh after confirmed uploads', () => {
  it('merges rapid notifications into one first-page read and deduplicates cards', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValue(page([file(2), file(2), file(1)], 'new-page'));
    for (let i = 0; i < 20; i++) gallery.requestRefresh();
    await vi.advanceTimersByTimeAsync(299); expect(client.list).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(client.list).toHaveBeenCalledTimes(1);
    expect(client.list.mock.calls[0][0]).toBeNull(); expect(gallery.state.items.map(f => f.id)).toEqual([file(2).id, file(1).id]);
    await vi.advanceTimersByTimeAsync(10000); expect(client.list).toHaveBeenCalledTimes(1); gallery.dispose();
  });
  it.each(['refresh', 'more'] as const)('waits for an in-flight %s, then performs one trailing first-page read', async kind => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file(1)], 'old-cursor')); await gallery.refresh();
    let finish!: (value: GalleryPage) => void;
    client.list.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(page([file(3)], 'new-cursor'));
    const pending = kind === 'more' ? gallery.loadMore() : gallery.refresh();
    const signal = client.list.mock.calls[1][1];
    for (let i = 0; i < 10; i++) gallery.requestRefresh();
    await vi.advanceTimersByTimeAsync(1000); expect(client.list).toHaveBeenCalledTimes(2); expect(signal.aborted).toBe(false);
    finish(page([file(2)], 'middle-cursor')); await pending;
    await vi.advanceTimersByTimeAsync(300); expect(client.list).toHaveBeenCalledTimes(3);
    expect(client.list.mock.calls[2][0]).toBeNull(); expect(gallery.state.items).toEqual([file(3)]);
    await gallery.loadMore(); expect(client.list.mock.calls[3][0]).toBe('new-cursor'); gallery.dispose();
  });
  it('lets an explicit refresh consume the scheduled automatic refresh', async () => {
    const { client, gallery } = setup(); gallery.requestRefresh(); await gallery.refresh();
    await vi.advanceTimersByTimeAsync(500); expect(client.list).toHaveBeenCalledTimes(1); gallery.dispose();
  });
  it('keeps cards and exposes manual retry after an automatic read failure without a loop', async () => {
    const { client, gallery } = setup(); await gallery.refresh();
    client.list.mockRejectedValueOnce(new GalleryRequestError('unavailable')); gallery.requestRefresh();
    await vi.advanceTimersByTimeAsync(300); expect(gallery.state.items).toEqual([file()]); expect(gallery.state.error).not.toBe('');
    await vi.advanceTimersByTimeAsync(60000); expect(client.list).toHaveBeenCalledTimes(2);
    await gallery.retry(); expect(client.list.mock.calls[2][0]).toBeNull(); expect(gallery.state.error).toBe(''); gallery.dispose();
  });
  it('cancels a scheduled refresh if a later pagination read fails before the timer', async () => {
    const { client, gallery } = setup(); client.list.mockResolvedValueOnce(page([file()], 'next')); await gallery.refresh();
    gallery.requestRefresh(); client.list.mockRejectedValueOnce(new GalleryRequestError('unavailable'));
    await gallery.loadMore(); await vi.advanceTimersByTimeAsync(1000);
    expect(client.list).toHaveBeenCalledTimes(2); expect(gallery.state.error).not.toBe('');
    expect(gallery.state.items).toEqual([file()]); gallery.dispose();
  });
  it('drops a pending trailing refresh on failure and respects Retry-After without automatic wakeup', async () => {
    const { client, gallery } = setup(); let reject!: (error: Error) => void;
    client.list.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const pending = gallery.refresh(); gallery.requestRefresh(); reject(new GalleryRequestError('rate_limited', 1000)); await pending;
    gallery.requestRefresh(); await vi.advanceTimersByTimeAsync(2000); expect(client.list).toHaveBeenCalledTimes(1);
    await gallery.retry(); expect(client.list).toHaveBeenCalledTimes(2); gallery.dispose();
  });
  it('clears timers and late results on disposal, and never schedules after unauthorized', async () => {
    const { client, gallery } = setup(); gallery.requestRefresh(); gallery.dispose();
    await vi.advanceTimersByTimeAsync(300); expect(client.list).not.toHaveBeenCalled(); gallery.requestRefresh();
    const other = createGallery(client); client.list.mockRejectedValueOnce(new GalleryRequestError('unauthorized'));
    await other.refresh(); other.requestRefresh(); await vi.advanceTimersByTimeAsync(5000);
    expect(client.list).toHaveBeenCalledTimes(1); expect(other.state.items).toEqual([]); other.dispose();
  });
});
describe('Account-bound completion signal', () => {
  it('ignores a previous account and events after leaving the page', () => {
    let owner: string | undefined = 'first'; const signal = createGalleryRefreshSignal(() => owner);
    signal.notify('first'); signal.notify('first'); expect(signal.request.value).toEqual({ ownerId: 'first', version: 2 });
    owner = 'second'; signal.notify('first'); expect(signal.request.value?.version).toBe(2);
    signal.notify('second'); expect(signal.request.value).toEqual({ ownerId: 'second', version: 1 });
    owner = undefined; signal.notify('second'); signal.notify(''); expect(signal.request.value?.version).toBe(1);
  });
});
