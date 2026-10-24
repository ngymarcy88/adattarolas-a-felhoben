import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUploadClient, putImage, UploadRequestError, type UploadAccess } from '../src/api/uploads';

const base = 'http://127.0.0.1:3000/api/v1';
const id = '00000000-0000-4000-8000-000000000001';
const file = { id, status: 'PENDING_UPLOAD', originalName: 'a.png', mimeType: 'image/png', detectedMimeType: null, sizeBytes: 8, confirmBy: '2026-10-24T12:15:00.000Z' };
const metadata = { originalName: 'a.png', mimeType: 'image/png', sizeBytes: 8 };
const access = (): UploadAccess => ({ method: 'PUT', url: 'http://127.0.0.1:9000/private/key?secret=capability',
  expiresAt: new Date(Date.now() + 60_000).toISOString(), headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } });
const signal = () => new AbortController().signal;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('upload API boundary', () => {
  it('sends credentialed init with exact metadata and stable key, and keeps confirm bodyless', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ file, upload: access() }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ file: { ...file, status: 'ACTIVE', detectedMimeType: 'image/png' } }));
    vi.stubGlobal('fetch', fetch); const client = createUploadClient(base);
    await client.initiate(metadata, id, signal()); await client.confirm(id, signal());
    expect(fetch.mock.calls[0][0]).toBe(base + '/files/uploads/init');
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', redirect: 'error', cache: 'no-store', body: JSON.stringify(metadata),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id } });
    expect(fetch.mock.calls[1][0]).toBe(base + `/files/${id}/confirm`);
    expect(fetch.mock.calls[1][1]).not.toHaveProperty('body'); expect(fetch.mock.calls[1][1].headers).toEqual({ Accept: 'application/json' });
  });
  it.each(['AUTH_REQUIRED', 'QUOTA_EXCEEDED', 'UPLOAD_VALIDATION_FAILED', 'UPLOAD_EXPIRED', 'ORIGIN_NOT_ALLOWED'])('maps %s to a safe non-retryable message', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code, message: 'raw-secret-URL', details: { secret: true } } }, { status: 409 })));
    const cause = await createUploadClient(base).initiate(metadata, id, signal()).catch(e => e);
    expect(cause).toBeInstanceOf(UploadRequestError); expect(cause.code).toBe(code); expect(cause.retryable).toBe(false); expect(cause.message).not.toContain('secret');
  });
  it('honors Retry-After, including a rate-limit fallback with non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private XML', { status: 429, headers: { 'Retry-After': '120' } })));
    await expect(createUploadClient(base).initiate(metadata, id, signal())).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 120_000 });
  });
  it('handles HTTP-date Retry-After and safely maps unknown provider/error text', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'SECRET_INTERNAL_DETAIL', message: 'private' } }, { status: 503, headers: { 'Retry-After': 'Sat, 24 Oct 2026 12:03:00 GMT' } })));
    await expect(createUploadClient(base).initiate(metadata, id, signal())).rejects.toMatchObject({ code: 'UNAVAILABLE', retryAfterMs: 180_000 });
  });
  it('times out requests and forwards page cancellation', async () => {
    vi.useFakeTimers(); const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private')))));
    vi.stubGlobal('fetch', fetch); const controller = new AbortController();
    const result = createUploadClient(base).initiate(metadata, id, controller.signal).catch(e => e);
    controller.abort(); expect((await result).code).toBe('UNAVAILABLE'); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    const timed = createUploadClient(base).initiate(metadata, id, signal()).catch(e => e); await vi.advanceTimersByTimeAsync(10_000);
    expect((await timed).code).toBe('UNAVAILABLE');
  });
  it('keeps the timeout active during a stalled response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, status: 200,
      json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private')))) })));
    const pending = createUploadClient(base).initiate(metadata, id, signal()).catch(e => e);
    await vi.advanceTimersByTimeAsync(10_000); expect((await pending).code).toBe('UNAVAILABLE');
  });
  it.each(['constructor', '__proto__', 'toString'])('ignores prototype key %s in an error response', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code } }, { status: 503 })));
    const error = await createUploadClient(base).initiate(metadata, id, signal()).catch(e => e);
    expect(error.code).toBe('UNAVAILABLE'); expect(error.message).toBe(new UploadRequestError('UNAVAILABLE').message);
  });
  it('rejects init metadata that does not match the selected file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ file: { ...file, sizeBytes: 999 }, upload: access() })));
    await expect(createUploadClient(base).initiate(metadata, id, signal())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it.each([
    { file: { ...file, id: '../secret' }, upload: null },
    { file: { ...file, sizeBytes: '8' }, upload: null },
    { file: { ...file, confirmBy: 'invalid' }, upload: null },
    { file, upload: { ...access(), headers: { ...access().headers, Authorization: 'private' } } },
    { file, upload: { ...access(), headers: { ...access().headers, 'If-None-Match': 'bad' } } },
    { file, upload: { ...access(), method: 'POST' } },
  ])('rejects malformed init response without trusting extra capabilities', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
    await expect(createUploadClient(base).initiate(metadata, id, signal())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('rejects foreign or pending confirm responses and invalid IDs before sending', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ file })); vi.stubGlobal('fetch', fetch);
    const client = createUploadClient(base); await expect(client.confirm(id, signal())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(client.confirm('../other', signal())).rejects.toMatchObject({ code: 'VALIDATION_ERROR' }); expect(fetch).toHaveBeenCalledTimes(1);
  });
});

class FakeXHR {
  static instances: FakeXHR[] = [];
  upload = { onprogress: null as ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
  status = 200; withCredentials = true; timeout = 0;
  open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn(); abort = vi.fn(() => this.onabort?.());
  constructor() { FakeXHR.instances.push(this); }
}
function xhrSetup() {
  FakeXHR.instances = []; vi.stubGlobal('XMLHttpRequest', FakeXHR); vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5173' } });
}
describe('credential-free binary upload', () => {
  it('sends exact File, signed headers and no credentials/content-length; clamps progress and waits for load', async () => {
    xhrSetup(); const progress = vi.fn(); const file = new File(['12345678'], 'a.png', { type: 'image/png' });
    const pending = putImage(access(), file, signal(), progress); const xhr = FakeXHR.instances[0];
    expect(xhr.open).toHaveBeenCalledWith('PUT', access().url); expect(xhr.withCredentials).toBe(false); expect(xhr.timeout).toBe(120_000);
    expect(xhr.setRequestHeader.mock.calls).toEqual([['Content-Type', 'image/png'], ['If-None-Match', '*']]); expect(xhr.send).toHaveBeenCalledWith(file);
    xhr.upload.onprogress?.({ loaded: 25, total: 100, lengthComputable: true }); xhr.upload.onprogress?.({ loaded: 150, total: 100, lengthComputable: true });
    expect(progress.mock.calls).toEqual([[25], [100]]); xhr.onload?.(); await pending;
  });
  it.each([412, 403, 500])('treats storage %i as unknown until application confirmation', async status => {
    xhrSetup(); const pending = putImage(access(), new File(['x'], 'a.png'), signal(), vi.fn()).catch(e => e);
    const xhr = FakeXHR.instances[0]; xhr.status = status; xhr.onload?.(); expect((await pending).code).toBe('UNAVAILABLE');
  });
  it.each(['onerror', 'ontimeout', 'onabort'] as const)('handles %s without exposing provider data', async event => {
    xhrSetup(); const pending = putImage(access(), new File(['x'], 'a.png'), signal(), vi.fn()).catch(e => e);
    FakeXHR.instances[0][event]?.(); expect((await pending).code).toBe('UNAVAILABLE');
  });
  it.each(['http://127.0.0.1:5173/put', 'javascript:private', 'https://user:password@storage.test/a', 'https://storage.test/a#fragment'])('rejects unsafe or same-origin URL %s before constructing XHR', async url => {
    xhrSetup(); await expect(putImage({ ...access(), url }, new File(['x'], 'a.png'), signal(), vi.fn())).rejects.toBeInstanceOf(UploadRequestError);
    expect(FakeXHR.instances).toHaveLength(0);
  });
  it('rejects expired access and already aborted signals, and aborts an active XHR on page disposal', async () => {
    xhrSetup(); const controller = new AbortController(); controller.abort();
    await expect(putImage(access(), new File(['x'], 'a'), controller.signal, vi.fn())).rejects.toBeInstanceOf(UploadRequestError);
    await expect(putImage({ ...access(), expiresAt: new Date(0).toISOString() }, new File(['x'], 'a'), signal(), vi.fn())).rejects.toBeInstanceOf(UploadRequestError);
    expect(FakeXHR.instances).toHaveLength(0);
    const live = new AbortController(); const pending = putImage(access(), new File(['x'], 'a'), live.signal, vi.fn()).catch(e => e);
    live.abort(); expect(FakeXHR.instances[0].abort).toHaveBeenCalledTimes(1); expect((await pending).code).toBe('UNAVAILABLE');
  });
  it('cleans up abort listeners after a synchronous send failure', async () => {
    xhrSetup(); const controller = new AbortController(); const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal('XMLHttpRequest', class extends FakeXHR { constructor() { super(); this.send.mockImplementation(() => { throw new Error('private'); }); } });
    await expect(putImage(access(), new File(['x'], 'a'), controller.signal, vi.fn())).rejects.toBeInstanceOf(UploadRequestError);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function)); expect(FakeXHR.instances[0].onabort).toBeNull();
  });
});
