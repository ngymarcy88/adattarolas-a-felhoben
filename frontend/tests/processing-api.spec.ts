import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProcessingClient } from '../src/api/processing';
import { createPreviewClient } from '../src/api/preview';
import { processingStatus as row } from './helpers/processing-fixture';
const base = 'http://localhost:3000/api/v1'; const id = row().fileId;
const client = () => createProcessingClient(base); const signal = () => new AbortController().signal;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Processing API client', () => {
  it('uses credentialed no-store JSON batch requests, preserves safe contract and order', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ items: [row(2), row(1, 'SUCCEEDED')] })); vi.stubGlobal('fetch', fetch);
    expect(await client().status([row(2).fileId, id], signal())).toEqual([row(2), row(1, 'SUCCEEDED')]);
    expect(fetch).toHaveBeenCalledWith(base + '/files/processing/status', expect.objectContaining({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error',
      body: JSON.stringify({ fileIds: [row(2).fileId, id] }), headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }));
  });
  it.each([[], [id, id], ['bad'], Array.from({ length: 21 }, (_, n) => row(n).fileId)].map(ids => [ids]))('rejects invalid request batch %# before fetch', async ids => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(client().status(ids, signal())).rejects.toMatchObject({ code: 'unavailable' }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ items: [row(), row()] }, { items: [row(2)] }, { items: [{ ...row(), storageKey: 'private' }] },
    { items: [row(1, 'SUCCEEDED', { result: { ...row(1, 'SUCCEEDED').result!, width: 513 } })] }, { items: [row(1, 'RUNNING', { result: row(1, 'SUCCEEDED').result })] },
    { items: [row(1, 'QUEUED', { processorVersion: '2.0.0' as '1.0.0' })] }, { items: [row(1, 'QUEUED', { nextAttemptAt: 'not-date' })] },
    { items: [row(1, 'QUEUED', { retryRevision: 3 })] }])('rejects malformed/private/mismatched status %#', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body))); await expect(client().status([id], signal())).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([[401, 'unauthorized'], [404, 'not_found'], [415, 'not_allowed'], [403, 'not_allowed'], [409, 'conflict'], [503, 'unavailable']] as const)('maps HTTP%i without raw errors', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider body', { status })));
    const error = await client().status([id], signal()).catch(e => e); expect(error.code).toBe(code); expect(error.message).not.toContain('private');
  });
  it('honors Retry-After, including retry requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private', { status: 429, headers: { 'Retry-After': '17' } })));
    await expect(client().retry(id, 0, signal())).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 17000 });
  });
  it.each([200, 202])('accepts replay/winner %i and sends exact expected revision', async status => {
    const body = { fileId: id, processorKey: 'thumbnail', processorVersion: '1.0.0', state: 'QUEUED', retryRevision: 1 };
    const fetch = vi.fn().mockResolvedValue(response(body, status)); vi.stubGlobal('fetch', fetch);
    expect(await client().retry(id, 0, signal())).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(base + `/files/${id}/processing/thumbnail/retry`, expect.objectContaining({ body: '{"expectedRetryRevision":0}' }));
  });
  it('sanitizes stalled JSON timeout and external cancellation', async () => {
    vi.useFakeTimers(); const fetch = vi.fn(async (_url, options) => ({ status: 200, json: () => new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(Error('private')); else options.signal.addEventListener('abort', () => reject(Error('private')));
    }) })); vi.stubGlobal('fetch', fetch);
    const result = client().status([id], signal()).catch(e => e); await vi.advanceTimersByTimeAsync(10000); expect((await result).code).toBe('unavailable');
    const controller = new AbortController(); const pending = client().retry(id, 0, controller.signal).catch(e => e); await Promise.resolve(); controller.abort(); expect((await pending).code).toBe('unavailable');
  });
  it('requests thumbnail access through its own URL endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ url: 'https://storage.invalid/synthetic', expiresAt: new Date(Date.now() + 60000).toISOString() })); vi.stubGlobal('fetch', fetch);
    await createPreviewClient(base, () => 'http://localhost:5173', 'thumbnail-url').get(id, signal());
    expect(fetch).toHaveBeenCalledWith(base + `/files/${id}/thumbnail-url`, expect.objectContaining({ credentials: 'include', method: 'GET', cache: 'no-store' }));
  });
});
