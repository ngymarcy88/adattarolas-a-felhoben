import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthRequestError, createAuthClient } from '../src/api/auth';

const base = 'http://127.0.0.1:3000/api/v1';
const client = createAuthClient(base);
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'unit@example.test', displayName: 'Unit User', createdAt: '2026-10-19T10:00:00.000Z' };
const success = () => new Response(JSON.stringify({ user }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Auth API client', () => {
  it('loads only the public user through a non-cached credentialed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success()); vi.stubGlobal('fetch', fetchMock);
    await expect(client.currentUser()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith(`${base}/auth/me`, expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error' }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });
  it('submits login without normalizing passwords or accepting a token response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success()); vi.stubGlobal('fetch', fetchMock);
    await expect(client.login(' Unit@Example.test ', ' unchanged password ')).resolves.toEqual(user);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: ' Unit@Example.test ', password: ' unchanged password ' });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
  });
  it('requires a successful 204 for logout and sends cookies without a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetchMock);
    await expect(client.logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(`${base}/auth/logout`, expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(client.logout()).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([[401, 'unauthorized'], [400, 'invalid_input'], [403, 'unavailable'], [429, 'rate_limited'], [503, 'unavailable'], [500, 'unavailable']])
    ('maps HTTP %i without exposing the server body', async (status, code) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private details password=secret', { status: Number(status) })));
      await expect(client.currentUser()).rejects.toMatchObject({ code });
      await expect(client.currentUser()).rejects.not.toThrow('secret');
    });
  it('distinguishes invalid login from an expired /me session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private', { status: 401 })));
    await expect(client.login('unit@example.test', 'test')).rejects.toMatchObject({ code: 'invalid_credentials' });
  });
  it.each([null, {}, [], { user: null }, { user: { ...user, id: 'invalid' } }, { user: { ...user, createdAt: 'invalid' } },
    { user: { ...user, email: 123 } }, { user: { ...user, passwordHash: 'private' } }, { user, token: 'private' }])
    ('rejects malformed or overbroad user responses %#', async (data) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
      await expect(client.currentUser()).rejects.toMatchObject({ code: 'unavailable' });
    });
  it('sanitizes invalid configuration, network errors and invalid JSON', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('private server address')); vi.stubGlobal('fetch', fetchMock);
    await expect(createAuthClient(undefined).currentUser()).rejects.toBeInstanceOf(AuthRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(client.currentUser()).rejects.not.toThrow('private');
    fetchMock.mockResolvedValue(new Response('invalid JSON'));
    await expect(client.currentUser()).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('aborts a hanging fetch at the timeout and removes its timer', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('private abort')), { once: true });
    })); vi.stubGlobal('fetch', fetchMock);
    const checked = expect(client.currentUser()).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(10_000); await checked;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates cancellation while parsing the response body', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url, options) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('private stream')), { once: true });
    }) })); vi.stubGlobal('fetch', fetchMock);
    const checked = expect(client.currentUser(controller.signal)).rejects.toMatchObject({ code: 'unavailable' });
    await Promise.resolve(); await Promise.resolve(); controller.abort(); await checked;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
