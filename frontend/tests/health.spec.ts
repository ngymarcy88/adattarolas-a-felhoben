import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth, HealthRequestError, parseApiBaseUrl } from '../src/api/health';

const baseUrl = 'http://localhost:3000/api/v1';
afterEach(() => vi.unstubAllGlobals());

describe('API configuration', () => {
  it('normalizes trailing slashes', () => {
    expect(parseApiBaseUrl(`${baseUrl}///`)).toBe(baseUrl);
  });

  it.each([undefined, '', '/api/v1', 'not a url', 'ftp://localhost/api', 'https://user:secret@example.test/api', 'https://example.test/api?token=x', 'https://example.test/api#x'])('rejects unsafe or invalid URL %s', (value) => {
    expect(() => parseApiBaseUrl(value)).toThrow();
  });
});

describe('health client', () => {
  it('checks the health response with cookies and the cancellation signal', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchHealth(baseUrl, controller.signal)).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/health`, {
      credentials: 'include', headers: { Accept: 'application/json' }, signal: controller.signal,
    });
  });

  it('hides internal error response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive server details', { status: 503 })));
    await expect(fetchHealth(baseUrl)).rejects.toThrow(new HealthRequestError());
  });

  it.each(['invalid JSON', '{}', '{"status":"down"}', 'null', '42'])('rejects an unexpected health response: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchHealth(baseUrl)).rejects.toBeInstanceOf(HealthRequestError);
  });

  it('maps network failures to a safe user-facing error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal network address')));
    await expect(fetchHealth(baseUrl)).rejects.toThrow(new HealthRequestError());
  });

  it('maps cancellation and timeout to a safe error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(fetchHealth(baseUrl)).rejects.toThrow(new HealthRequestError());
  });
});
