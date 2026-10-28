import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGalleryClient, GalleryRequestError } from '../src/api/gallery';
import { galleryFile, galleryPage } from './helpers/gallery-fixture';

const base = 'http://127.0.0.1:3000/api/v1';
const signal = () => new AbortController().signal;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Gallery list API boundary', () => {
  it('requests only credentialed no-store metadata with fixed limit and opaque cursor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(galleryPage([galleryFile()], 'opaque_-position')))
      .mockResolvedValueOnce(Response.json(galleryPage([])));
    vi.stubGlobal('fetch', fetch); const client = createGalleryClient(base);
    expect((await client.list(null, signal())).nextCursor).toBe('opaque_-position'); await client.list('opaque_-position', signal());
    expect(fetch.mock.calls.map(call => call[0])).toEqual([base + '/files?limit=20', base + '/files?limit=20&cursor=opaque_-position']);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('body');
  });
  it.each(['', 'bad cursor', 'secret?token=x', 'x'.repeat(513)])('rejects unsafe outgoing cursor %# without a request', async cursor => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(createGalleryClient(base).list(cursor, signal())).rejects.toMatchObject({ code: 'cursor_invalid' }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    {}, [], null, { ...galleryPage(), storageKey: 'private' },
    { ...galleryPage(), hasNextPage: 'true' }, { ...galleryPage(), nextCursor: 'next' },
    { ...galleryPage(), hasNextPage: true }, galleryPage([], 'next'), galleryPage([galleryFile()], 'bad cursor'),
    galleryPage(Array.from({ length: 21 }, (_, i) => galleryFile(i))),
  ])('rejects malformed page envelope %#', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
    await expect(createGalleryClient(base).list(null, signal())).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([
    { storageKey: 'private' }, { ownerId: 'private' }, { previewUrl: 'private' }, { status: 'PENDING_UPLOAD' },
    { mimeType: 'video/mp4', detectedMimeType: 'video/mp4' }, { detectedMimeType: null }, { detectedMimeType: 'image/png' },
    { id: '../file' }, { id: galleryFile().id + '\n' }, { originalName: '' }, { originalName: 'x'.repeat(256) },
    { sizeBytes: '12' }, { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: 1.5 }, { sizeBytes: Number.MAX_SAFE_INTEGER + 1 },
    { createdAt: '2026-02-30T10:00:00.000Z' }, { createdAt: 'not a date' }, { createdAt: '0000-01-01T00:00:00.000Z' },
  ])('rejects wrong item type/private fields %#', changes => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(galleryPage([{ ...galleryFile(), ...changes } as never]))));
    return expect(createGalleryClient(base).list(null, signal())).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([401, 403, 503, 500, 404, 201, 204])('maps HTTP %i to safe feedback, never raw server details', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(status === 204 ? null : 'private provider XML/token', { status })));
    const error = await createGalleryClient(base).list(null, signal()).catch(e => e);
    expect(error).toBeInstanceOf(GalleryRequestError); expect(error.code).toBe(status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'unavailable');
    expect(error.message).not.toContain('private');
  });
  it('maps CURSOR_INVALID only from a controlled error code', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: { code: 'CURSOR_INVALID', message: 'private' } }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ error: { code: 'constructor', message: 'private' } }, { status: 400 }));
    vi.stubGlobal('fetch', fetch); const client = createGalleryClient(base);
    await expect(client.list('old', signal())).rejects.toMatchObject({ code: 'cursor_invalid' });
    await expect(client.list('old', signal())).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([[null, 60000], ['12', 12000], ['0', 0], ['bad', 60000], ['9'.repeat(40), 60000]])('honors Retry-After %s or uses a safe fallback', async (header, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private', { status: 429, headers: header ? { 'Retry-After': header } : {} })));
    await expect(createGalleryClient(base).list(null, signal())).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: expected });
  });
  it('handles an HTTP-date Retry-After', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': 'Wed, 28 Oct 2026 10:02:00 GMT' } })));
    await expect(createGalleryClient(base).list(null, signal())).rejects.toMatchObject({ retryAfterMs: 120000 });
  });
  it('cancels pending requests, including an already aborted caller', async () => {
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(new Error('private'));
      else options.signal.addEventListener('abort', () => reject(new Error('private')));
    })); vi.stubGlobal('fetch', fetch);
    const controller = new AbortController(); const result = createGalleryClient(base).list(null, controller.signal).catch(e => e);
    controller.abort(); expect((await result).code).toBe('unavailable');
    await expect(createGalleryClient(base).list(null, controller.signal)).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetch.mock.calls.every(call => call[1].signal.aborted)).toBe(true);
  });
  it('keeps the timeout active through stalled JSON consumption', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ status: 200,
      json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private')))) })));
    const pending = createGalleryClient(base).list(null, signal()).catch(e => e); await vi.advanceTimersByTimeAsync(10000);
    expect((await pending).code).toBe('unavailable');
  });
  it('does not fetch with an invalid API base URL', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(createGalleryClient('javascript:private').list(null, signal())).rejects.toMatchObject({ code: 'unavailable' }); expect(fetch).not.toHaveBeenCalled();
  });
});
