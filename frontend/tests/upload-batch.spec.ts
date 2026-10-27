import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUploadBatch, MAX_BATCH_FILES, validateImage } from '../src/upload/batch';
import { UploadRequestError, type UploadClient, type UploadReceipt, type UploadedFile } from '../src/api/uploads';

const image = (name = 'image.png') => new File(['12345678'], name, { type: 'image/png', lastModified: 1 });
const id = '00000000-0000-4000-8000-000000000001';
function receipt(): UploadReceipt {
  return { file: { id, status: 'PENDING_UPLOAD', originalName: 'image.png', mimeType: 'image/png', detectedMimeType: null, sizeBytes: 8,
    confirmBy: new Date(Date.now() + 900_000).toISOString() }, upload: { method: 'PUT', url: 'http://storage.example.test/object?signed=private',
    expiresAt: new Date(Date.now() + 300_000).toISOString(), headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } } };
}
const active = (): UploadedFile => ({ ...receipt().file, status: 'ACTIVE', detectedMimeType: 'image/png' });
function setup() {
  let key = 0;
  const client = { initiate: vi.fn<UploadClient['initiate']>().mockImplementation(async () => receipt()),
    confirm: vi.fn<UploadClient['confirm']>().mockImplementation(async () => active()),
    put: vi.fn<UploadClient['put']>().mockResolvedValue() };
  const batch = createUploadBatch(client, () => `key-${++key}`);
  return { client, batch };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('image selection', () => {
  it.each(['text/html', 'image/svg+xml', 'video/mp4', '', 'application/octet-stream'])('rejects %s without API calls', async type => {
    const { client, batch } = setup(); batch.add([new File(['x'], 'test', { type })]); await batch.start();
    expect(batch.state.rows[0].status).toBe('error'); expect(client.initiate).not.toHaveBeenCalled();
  });
  it.each(['../file.png', 'a\\b.png', '\u202Eevil.png', '\tname.png', '.', '..', ' ', '\ud800.png', 'a'.repeat(256)])('rejects unsafe name %j', name => {
    expect(validateImage({ name, size: 8, type: 'image/png' } as File)).not.toBe('');
  });
  it('accepts Unicode including paired supplementary characters and NFC names', () => {
    expect(validateImage(image('  ke\u0301p😀.png  '))).toBe('');
  });
  it('rejects zero/oversized files and accepts exact size ceiling', () => {
    expect(validateImage(new File([], 'empty.png', { type: 'image/png' }))).not.toBe('');
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 104857601 } as File)).not.toBe('');
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 104857600 } as File)).toBe('');
  });
  it('deduplicates repeated picker selection, limits rows, and keeps invalid files isolated', async () => {
    const { client, batch } = setup(); batch.add([image(), image(), ...Array.from({ length: 24 }, (_, i) => image(`${i}.png`))]);
    expect(batch.state.rows).toHaveLength(MAX_BATCH_FILES); expect(batch.state.selectionError).not.toBe('');
    expect(client.initiate).not.toHaveBeenCalled();
    const other = setup(); other.batch.add([new File(['x'], 'bad.svg', { type: 'image/svg+xml' }), image()]);
    await other.batch.start(); expect(other.batch.summary.value).toEqual({ total: 2, success: 1, failed: 1 });
  });
});
describe('bounded queue and application completion', () => {
  it('keeps at most two files in flight, ignores duplicate start, then drains queued siblings', async () => {
    const { client, batch } = setup(); const finish: (() => void)[] = [];
    client.put.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
    batch.add([image('a.png'), image('b.png'), image('c.png')]); const running = batch.start();
    await vi.waitFor(() => expect(finish).toHaveLength(2)); await batch.start();
    expect(batch.state.running).toBe(2); expect(batch.state.rows[2].status).toBe('queued');
    finish[0](); await vi.waitFor(() => expect(finish).toHaveLength(3)); finish[1](); finish[2](); await running;
    expect(client.initiate).toHaveBeenCalledTimes(3); expect(batch.summary.value.success).toBe(3); expect(batch.busy.value).toBe(false);
  });
  it('normalizes init metadata, shows progress, and never treats 100% as final success', async () => {
    const { client, batch } = setup(); let finish!: (file: UploadedFile) => void;
    client.put.mockImplementation(async (_access, _file, _signal, progress) => { progress(100); });
    client.confirm.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    batch.add([image('  ke\u0301p.png  ')]); const running = batch.start();
    await vi.waitFor(() => expect(batch.state.rows[0].status).toBe('confirming'));
    expect(batch.state.rows[0].progress).toBe(100); expect(batch.summary.value.success).toBe(0);
    expect(client.initiate.mock.calls[0].slice(0, 2)).toEqual([{ originalName: 'kép.png', mimeType: 'image/png', sizeBytes: 8 }, 'key-1']);
    finish(active()); await running; expect(batch.state.rows[0].status).toBe('success');
    expect(JSON.stringify(batch.state)).not.toContain('signed=private');
  });
  it('isolates terminal validation failure and prevents retry or resend of completed files', async () => {
    const { client, batch } = setup(); client.confirm.mockRejectedValueOnce(new UploadRequestError('UPLOAD_VALIDATION_FAILED'));
    batch.add([image('a.png'), image('b.png')]); await batch.start();
    expect(batch.summary.value).toEqual({ total: 2, success: 1, failed: 1 });
    batch.retry('key-1'); batch.retry('key-2'); await batch.start();
    expect(client.put).toHaveBeenCalledTimes(2); expect(batch.state.rows[0].retryable).toBe(false);
  });
  it('recognizes ACTIVE init replay without PUT or confirm', async () => {
    const { client, batch } = setup(); client.initiate.mockResolvedValue({ file: active(), upload: null });
    batch.add([image()]); await batch.start(); expect(batch.summary.value.success).toBe(1);
    expect(client.put).not.toHaveBeenCalled(); expect(client.confirm).not.toHaveBeenCalled();
  });
});
describe('retry identity and unknown outcomes', () => {
  it('reuses the same key after an unknown init outcome and applies a manual retry delay', async () => {
    vi.useFakeTimers(); const { client, batch } = setup(); client.initiate.mockRejectedValueOnce(new UploadRequestError('UNAVAILABLE'));
    batch.add([image()]); await batch.start(); batch.retry('key-1'); expect(client.initiate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); batch.retry('key-1'); await vi.runAllTimersAsync();
    expect(client.initiate.mock.calls.map(call => call[1])).toEqual(['key-1', 'key-1']); expect(batch.summary.value.success).toBe(1);
  });
  it('confirms a lost PUT response / conditional conflict without retransmitting', async () => {
    const { client, batch } = setup(); client.put.mockRejectedValue(new Error('raw provider URL and XML must stay private'));
    batch.add([image()]); await batch.start(); expect(batch.summary.value.success).toBe(1);
    expect(client.confirm).toHaveBeenCalledWith(id, expect.any(AbortSignal)); expect(client.put).toHaveBeenCalledTimes(1);
  });
  it('retries confirmation before another PUT after a transient confirm failure', async () => {
    vi.useFakeTimers(); const { client, batch } = setup(); client.confirm.mockRejectedValueOnce(new UploadRequestError('UPLOAD_VERIFICATION_UNAVAILABLE'));
    batch.add([image()]); await batch.start(); await vi.advanceTimersByTimeAsync(1000); batch.retry('key-1'); await vi.runAllTimersAsync();
    expect(client.confirm).toHaveBeenCalledTimes(2); expect(client.put).toHaveBeenCalledTimes(1); expect(client.initiate).toHaveBeenCalledTimes(1);
    expect(batch.summary.value.success).toBe(1);
  });
  it('only resends a whole file when confirm says NOT_READY and the original access still lives', async () => {
    vi.useFakeTimers(); const { client, batch } = setup(); const order: string[] = [];
    client.put.mockImplementation(async () => { order.push('put'); });
    client.confirm.mockImplementationOnce(async () => { order.push('confirm-missing'); throw new UploadRequestError('UPLOAD_NOT_READY'); })
      .mockImplementationOnce(async () => { order.push('confirm-missing'); throw new UploadRequestError('UPLOAD_NOT_READY'); })
      .mockImplementation(async () => { order.push('confirm-ok'); return active(); });
    batch.add([image()]); await batch.start(); await vi.advanceTimersByTimeAsync(1000); batch.retry('key-1'); await vi.runAllTimersAsync();
    expect(order).toEqual(['put', 'confirm-missing', 'confirm-missing', 'put', 'confirm-ok']); expect(client.initiate).toHaveBeenCalledTimes(1);
  });
  it('confirms pending replay with no access or expired access, never renews or assumes failure', async () => {
    for (const expired of [false, true]) {
      const { client, batch } = setup(); const data = receipt();
      if (expired) data.upload!.expiresAt = new Date(Date.now() - 1).toISOString(); else data.upload = null;
      client.initiate.mockResolvedValue(data); batch.add([image()]); await batch.start();
      expect(batch.summary.value.success).toBe(1); expect(client.put).not.toHaveBeenCalled();
    }
  });
  it('ends an expired unreceived file without a new init, and preserves RATE_LIMITED waiting', async () => {
    const { client, batch } = setup(); const data = receipt(); data.upload = null;
    client.initiate.mockResolvedValue(data); client.confirm.mockRejectedValue(new UploadRequestError('UPLOAD_NOT_READY'));
    batch.add([image()]); await batch.start(); expect(batch.state.rows[0].retryable).toBe(false); expect(client.put).not.toHaveBeenCalled();
    const other = setup(); other.client.initiate.mockRejectedValue(new UploadRequestError('RATE_LIMITED', 120_000));
    other.batch.add([image()]); const before = Date.now(); await other.batch.start(); expect(other.batch.state.rows[0].retryAt).toBeGreaterThanOrEqual(before + 120_000);
  });
});
describe('session loss and page disposal', () => {
  it('pauses queued siblings after AUTH_REQUIRED without starting more init requests', async () => {
    const { client, batch } = setup(); client.initiate.mockRejectedValue(new UploadRequestError('AUTH_REQUIRED'));
    batch.add([image('a.png'), image('b.png'), image('c.png')]); await batch.start();
    expect(batch.state.authRequired).toBe(true); expect(client.initiate).toHaveBeenCalledTimes(2); expect(batch.state.rows[2].status).toBe('queued');
    await batch.start(); batch.add([image('d.png')]); expect(batch.state.rows).toHaveLength(3);
  });
  it('aborts in-flight I/O, ignores late completion/progress and never starts another file after dispose', async () => {
    const { client, batch } = setup(); const finish: (() => void)[] = []; const progress: ((value: number) => void)[] = [];
    client.put.mockImplementation((_access, _file, _signal, update) => { progress.push(update); return new Promise(resolve => finish.push(resolve)); });
    batch.add([image('a.png'), image('b.png'), image('c.png')]); const running = batch.start();
    await vi.waitFor(() => expect(finish).toHaveLength(2)); batch.dispose(); const snapshot = JSON.stringify(batch.state.rows);
    expect(client.put.mock.calls.every(call => call[2].aborted)).toBe(true);
    progress[0](99); finish[0](); finish[1](); await running; await batch.start();
    expect(client.confirm).not.toHaveBeenCalled(); expect(client.initiate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(batch.state.rows)).toBe(snapshot);
  });
});
