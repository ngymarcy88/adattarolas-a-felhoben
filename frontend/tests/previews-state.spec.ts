import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreviews } from '../src/gallery/previews';
import { PreviewRequestError, type PreviewAccess, type PreviewClient } from '../src/api/preview';
const access = (): PreviewAccess => ({ url: 'https://storage.invalid/synthetic', expiresAt: new Date(Date.now() + 60000).toISOString() });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(ids = ['a', 'b', 'c', 'd', 'e', 'f']) {
  const client = { get: vi.fn<PreviewClient['get']>().mockImplementation(async () => access()) }; const unauthorized = vi.fn();
  const previews = createPreviews(client, unauthorized); previews.retain(ids); return { client, previews, unauthorized };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Demand-driven preview queue', () => {
  it('does not request on registration, starts at most four and deduplicates card/modal demand', async () => {
    const { client, previews } = setup(); const finish: ((access: PreviewAccess) => void)[] = [];
    client.get.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
    expect(client.get).not.toHaveBeenCalled(); for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) previews.request(id); previews.request('a');
    expect(client.get).toHaveBeenCalledTimes(4); expect(previews.state.running).toBe(4); expect(previews.state.entries.e.phase).toBe('queued');
    finish[0](access()); await settle(); expect(client.get).toHaveBeenCalledTimes(5);
    finish[1](access()); await settle(); expect(client.get).toHaveBeenCalledTimes(6);
    for (const resolve of finish.slice(2)) resolve(access()); await settle();
    expect(previews.state.running).toBe(0); previews.request('a'); expect(client.get).toHaveBeenCalledTimes(6);
  });
  it('leaves a loaded image alone after expiry until a new display is requested', async () => {
    vi.useFakeTimers(); const { client, previews } = setup(); previews.request('a'); await settle(); const url = previews.state.entries.a.url;
    await vi.advanceTimersByTimeAsync(60001); expect(client.get).toHaveBeenCalledTimes(1); expect(previews.state.entries.a.url).toBe(url);
    previews.request('a'); await settle(); expect(client.get).toHaveBeenCalledTimes(2);
  });
  it('never retries a failed URL or image automatically; manual retry has a fresh version', async () => {
    const { client, previews } = setup(); client.get.mockRejectedValueOnce(new PreviewRequestError('unavailable'));
    previews.request('a'); await settle(); previews.request('a'); expect(client.get).toHaveBeenCalledTimes(1);
    previews.retry('a'); await settle(); const version = previews.state.entries.a.version;
    previews.imageFailed('a', version); expect(previews.state.entries.a.error).toContain('A kép nem tölthető be'); expect(previews.state.entries.a.url).toBeNull();
    previews.request('a'); expect(client.get).toHaveBeenCalledTimes(2); previews.retry('a'); await settle();
    expect(client.get).toHaveBeenCalledTimes(3); expect(previews.state.entries.a.version).toBeGreaterThan(version);
    previews.imageFailed('a', version); expect(previews.state.entries.a.phase).toBe('ready');
  });
  it.each(['not_found', 'not_allowed'] as const)('makes %s terminal until a new list/view lifetime', async code => {
    const { client, previews } = setup(); client.get.mockRejectedValue(new PreviewRequestError(code));
    previews.request('a'); await settle(); previews.retry('a'); previews.request('a');
    expect(client.get).toHaveBeenCalledTimes(1); expect(previews.state.entries.a.retryable).toBe(false);
  });
  it('allows explicit successful list refresh to clear failed entries without fetching or evicting loaded images', async () => {
    const { client, previews } = setup(); client.get.mockRejectedValueOnce(new PreviewRequestError('not_found'));
    previews.request('a'); previews.request('b'); await settle(); const loaded = previews.state.entries.b.url;
    previews.clearErrors(); expect(previews.state.entries.a).toBeUndefined(); expect(previews.state.entries.b.url).toBe(loaded); expect(client.get).toHaveBeenCalledTimes(2);
    previews.request('a'); await settle(); expect(client.get).toHaveBeenCalledTimes(3); expect(previews.state.entries.a.phase).toBe('ready');
  });
  it('isolates one failure from successful siblings', async () => {
    const { client, previews } = setup(); client.get.mockRejectedValueOnce(new Error('private URL and stack'));
    previews.request('a'); previews.request('b'); await settle();
    expect(previews.state.entries.a.phase).toBe('error'); expect(previews.state.entries.a.error).not.toContain('private'); expect(previews.state.entries.b.phase).toBe('ready');
  });
  it('pauses and fails queued demand on 429, does not auto-resume, then honors manual retry', async () => {
    vi.useFakeTimers(); const { client, previews } = setup(); let reject!: (error: Error) => void;
    const held: ((value: PreviewAccess) => void)[] = [];
    client.get.mockImplementation((id) => id === 'a' ? new Promise((_resolve, fail) => { reject = fail; })
      : ['b', 'c', 'd'].includes(id) ? new Promise(resolve => held.push(resolve)) : Promise.resolve(access()));
    for (const id of ['a', 'b', 'c', 'd', 'e']) previews.request(id);
    reject(new PreviewRequestError('rate_limited', 12000)); await settle(); expect(previews.state.entries.e.phase).toBe('error');
    previews.retry('e'); expect(client.get).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(12000); expect(client.get).toHaveBeenCalledTimes(4);
    previews.retry('e'); await settle(); expect(client.get).toHaveBeenCalledTimes(5); expect(previews.state.entries.e.phase).toBe('ready');
    for (const resolve of held) resolve(access()); await settle();
  });
  it('drops removed/queued IDs and keeps four physical pending jobs counted until they settle', async () => {
    const { client, previews } = setup(); const finish: ((access: PreviewAccess) => void)[] = [];
    client.get.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
    for (const id of ['a', 'b', 'c', 'd', 'e']) previews.request(id);
    previews.retain(['f']); expect(client.get.mock.calls.every(call => call[1].aborted)).toBe(true);
    previews.request('f'); expect(client.get).toHaveBeenCalledTimes(4);
    finish[0](access()); await settle(); expect(client.get).toHaveBeenCalledTimes(5); expect(previews.state.entries.a).toBeUndefined(); expect(previews.state.entries.e).toBeUndefined();
    previews.dispose(); for (const resolve of finish.slice(1)) resolve(access()); await settle(); expect(Object.keys(previews.state.entries)).toEqual([]);
  });
  it('uses globally increasing image versions across removal/re-add of the same ID', async () => {
    const { previews } = setup(); previews.request('a'); await settle(); const oldVersion = previews.state.entries.a.version;
    previews.retain([]); previews.retain(['a']); previews.request('a'); await settle(); previews.imageFailed('a', oldVersion);
    expect(previews.state.entries.a.version).toBeGreaterThan(oldVersion); expect(previews.state.entries.a.phase).toBe('ready');
  });
  it('clears all capabilities before notifying 401 and ignores late data', async () => {
    const { client, previews, unauthorized } = setup(); let late!: (access: PreviewAccess) => void;
    client.get.mockRejectedValueOnce(new PreviewRequestError('unauthorized')).mockReturnValueOnce(new Promise(resolve => { late = resolve; }));
    unauthorized.mockImplementation(() => expect(Object.keys(previews.state.entries)).toEqual([]));
    previews.request('a'); previews.request('b'); await settle(); late(access()); await settle(); previews.request('c');
    expect(unauthorized).toHaveBeenCalledTimes(1); expect(client.get).toHaveBeenCalledTimes(2); expect(Object.keys(previews.state.entries)).toEqual([]);
  });
  it('ignores disposed callbacks, does not reintroduce removed IDs, and rejects already-expired responses', async () => {
    const { client, previews } = setup(); previews.request('unknown'); expect(client.get).not.toHaveBeenCalled();
    client.get.mockResolvedValue({ ...access(), expiresAt: new Date(0).toISOString() }); previews.request('a'); await settle();
    expect(previews.state.entries.a.phase).toBe('error'); previews.dispose(); previews.request('a'); expect(Object.keys(previews.state.entries)).toEqual([]);
  });
});
