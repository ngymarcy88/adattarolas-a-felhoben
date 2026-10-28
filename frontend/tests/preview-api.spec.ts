import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviewClient, PreviewRequestError } from '../src/api/preview';
import { galleryFile } from './helpers/gallery-fixture';
const id = galleryFile().id;
const base = 'http://127.0.0.1:3000/api/v1';
const origin = 'http://127.0.0.1:5173';
const access = () => ({ url: 'http://127.0.0.1:9000/private/object?synthetic-token=example', expiresAt: new Date(Date.now() + 60000).toISOString() });
const client = () => createPreviewClient(base, () => origin);
const signal = () => new AbortController().signal;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Preview API credential/schema boundary', () => {
  it('fetches the exact owner-protected API without rewriting its storage URL', async () => {
    const data = access(); const fetch = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetch);
    expect(await client().get(id, signal())).toEqual(data);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(base + `/files/${id}/preview-url`, expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } }));
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('body');
  });
  it.each(['../file', '', id + '\n'])('rejects invalid id %# before fetch', async value => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(client().get(value, signal())).rejects.toMatchObject({ code: 'not_found' }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...access(), storageKey: 'private' }, { ...access(), expiresAt: 'invalid' },
    { ...access(), expiresAt: new Date(0).toISOString() }, { ...access(), url: 'javascript:example' },
    { ...access(), url: origin + '/same-origin' }, { ...access(), url: 'https://user:password@storage.invalid/a' },
    { ...access(), url: 'https://storage.invalid/a#fragment' }])('rejects malformed/expired/unsafe response %#', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data))); await expect(client().get(id, signal())).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([[401, 'unauthorized'], [404, 'not_found'], [403, 'not_allowed'], [415, 'not_allowed'], [503, 'unavailable'], [201, 'unavailable']] as const)('sanitizes HTTP %i', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('raw private URL/XML/credential', { status })));
    const error = await client().get(id, signal()).catch(e => e); expect(error).toBeInstanceOf(PreviewRequestError); expect(error.code).toBe(code); expect(error.message).not.toContain('private');
  });
  it('honors retry seconds without exposing response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private', { status: 429, headers: { 'Retry-After': '12' } })));
    await expect(client().get(id, signal())).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 12000 });
  });
  it('keeps timeout active through stalled JSON and propagates cancellation', async () => {
    vi.useFakeTimers(); const fetch = vi.fn(async (_url, options) => ({ status: 200,
      json: () => new Promise((_resolve, reject) => { if (options.signal.aborted) reject(new Error('private')); else options.signal.addEventListener('abort', () => reject(new Error('private'))); }) }));
    vi.stubGlobal('fetch', fetch); const pending = client().get(id, signal()).catch(e => e); await vi.advanceTimersByTimeAsync(10000);
    expect((await pending).code).toBe('unavailable');
    const abort = new AbortController(); abort.abort(); await expect(client().get(id, abort.signal)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
