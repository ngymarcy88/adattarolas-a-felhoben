import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProcessing } from '../src/gallery/processing';
import { ProcessingRequestError, type ProcessingStatus, type RetryResult } from '../src/api/processing';
import { processingStatus as row } from './helpers/processing-fixture';
const id = row().fileId;
const tick = () => vi.advanceTimersByTimeAsync(0);
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(count = 1) {
  const client = { status: vi.fn(async (ids: readonly string[], _signal: AbortSignal) => ids.map(fileId => ({ ...row(), fileId }))), retry: vi.fn<(id: string, revision: number, signal: AbortSignal) => Promise<RetryResult>>() };
  const expired = vi.fn(); const processing = createProcessing(client, expired); const ids = Array.from({ length: count }, (_, i) => row(i + 1).fileId);
  processing.retain(ids); for (const fileId of ids) processing.setVisible(fileId, true); processing.setActive(true);
  return { client, processing, expired, ids };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('Bounded visible-card batch status scheduler', () => {
  it('coalesces cards, caps at20, fairly visits overflow and never sends faster than10s', async () => {
    const x = fixture(45); await tick(); expect(x.client.status).toHaveBeenCalledTimes(1); expect(x.client.status.mock.calls[0][0]).toHaveLength(20);
    await vi.advanceTimersByTimeAsync(9999); expect(x.client.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(x.client.status.mock.calls[1][0]).toEqual(x.ids.slice(20, 40));
    await vi.advanceTimersByTimeAsync(10000); expect(x.client.status.mock.calls[2][0]).toContain(x.ids[44]);
  });
  it('only queries visible allowed IDs and stops when terminal', async () => {
    const x = fixture(3); x.processing.setVisible(x.ids[1], false); x.processing.setVisible(x.ids[2], false);
    x.client.status.mockResolvedValueOnce([row(1, 'SUCCEEDED')]); await tick(); expect(x.client.status.mock.calls[0][0]).toEqual([id]);
    await vi.advanceTimersByTimeAsync(60000); expect(x.client.status).toHaveBeenCalledTimes(1);
    x.processing.setVisible(x.ids[1], true); await tick(); expect(x.client.status.mock.calls[1][0]).toEqual([x.ids[1]]);
  });
  it.each(['NOT_SCHEDULED', 'SUCCEEDED', 'FAILED', 'BLOCKED_QUOTA', 'CANCELLED'] as const)('never automatically polls terminal %s', async state => {
    const x = fixture(); x.client.status.mockResolvedValueOnce([row(1, state)]); await tick(); await vi.advanceTimersByTimeAsync(120000); expect(x.client.status).toHaveBeenCalledTimes(1);
  });
  it('does not overlap a slow read and aborts/discards hidden-page results, then resumes', async () => {
    const x = fixture(); const slow = deferred<ProcessingStatus[]>(); x.client.status.mockReturnValueOnce(slow.promise); await tick();
    await vi.advanceTimersByTimeAsync(60000); expect(x.client.status).toHaveBeenCalledTimes(1);
    const signal = x.client.status.mock.calls[0][1]; x.processing.setActive(false); expect(signal.aborted).toBe(true);
    slow.resolve([row(1, 'SUCCEEDED')]); await tick(); expect(x.processing.state.entries[id].status).toBeNull();
    x.processing.setActive(true); await tick(); expect(x.client.status).toHaveBeenCalledTimes(2);
  });
  it('aborts on removal/disposal, never resurrects a removed entry or another owner state', async () => {
    const x = fixture(); const slow = deferred<ProcessingStatus[]>(); x.client.status.mockReturnValueOnce(slow.promise); await tick();
    x.processing.retain([]); expect(x.client.status.mock.calls[0][1].aborted).toBe(true); slow.resolve([row(1, 'SUCCEEDED')]); await tick(); expect(Object.keys(x.processing.state.entries)).toEqual([]);
    x.processing.dispose(); x.processing.retain([id]); x.processing.setVisible(id, true); x.processing.setActive(true); await tick(); expect(x.client.status).toHaveBeenCalledTimes(1);
  });
  it('stops failed batch polling; Retry-After gates explicit refresh without auto loop', async () => {
    const x = fixture(); x.client.status.mockRejectedValueOnce(new ProcessingRequestError('rate_limited', 30000)); await tick();
    x.processing.refresh(id); await vi.advanceTimersByTimeAsync(30000); expect(x.client.status).toHaveBeenCalledTimes(1); expect(x.processing.state.entries[id].error).toBeTruthy();
    x.processing.refresh(id); await tick(); expect(x.client.status).toHaveBeenCalledTimes(2);
  });
  it('stops and clears on unauthorized status', async () => {
    const x = fixture(); x.client.status.mockRejectedValueOnce(new ProcessingRequestError('unauthorized')); await tick(); expect(x.expired).toHaveBeenCalledTimes(1); expect(Object.keys(x.processing.state.entries)).toEqual([]);
  });
});
describe('Independent manual processor retry', () => {
  async function failed() { const x = fixture(); x.client.status.mockResolvedValueOnce([row(1, 'FAILED')]); await tick(); return x; }
  const reply = (state: RetryResult['state'] = 'QUEUED'): RetryResult => ({ fileId: id, processorKey: 'thumbnail', processorVersion: '1.0.0', retryRevision: 1, state });
  it('coalesces double clicks and starts batched observation after the acknowledged new cycle', async () => {
    const x = await failed(); const slow = deferred<RetryResult>(); x.client.retry.mockReturnValueOnce(slow.promise);
    const pending = x.processing.retry(id); await x.processing.retry(id); expect(x.client.retry).toHaveBeenCalledTimes(1); expect(x.processing.state.retryingId).toBe(id);
    slow.resolve(reply()); await pending; expect(x.processing.state.entries[id].status).toMatchObject({ state: 'QUEUED', retryRevision: 1, retryable: false });
    await vi.advanceTimersByTimeAsync(10000); expect(x.client.status).toHaveBeenCalledTimes(2);
  });
  it('replays the SAME expected revision after a lost response, with no automatic mutation retry', async () => {
    const x = await failed(); x.client.retry.mockRejectedValueOnce(Error('private')); await x.processing.retry(id);
    await vi.advanceTimersByTimeAsync(60000); expect(x.client.retry).toHaveBeenCalledTimes(1); expect(x.processing.state.entries[id].retryError).not.toContain('private');
    x.client.retry.mockResolvedValueOnce(reply()); await x.processing.retry(id); expect(x.client.retry.mock.calls.map(call => call[1])).toEqual([0, 0]);
  });
  it.each([row(1, 'SUCCEEDED'), row(1, 'FAILED', { retryable: false }), row(1, 'FAILED', { retryRevision: 2 }), row(1, 'FAILED', { attemptCount: 9 }), row(1, 'RUNNING')])('never regenerates success or bypasses retry bounds %#', async status => {
    const x = fixture(); x.client.status.mockResolvedValueOnce([status]); await tick(); await x.processing.retry(id); expect(x.client.retry).not.toHaveBeenCalled();
  });
  it('handles409 by refreshing status, not repeating the mutation', async () => {
    const x = await failed(); x.client.retry.mockRejectedValueOnce(new ProcessingRequestError('conflict')); await x.processing.retry(id);
    await vi.advanceTimersByTimeAsync(10000); expect(x.client.status).toHaveBeenCalledTimes(2); expect(x.client.retry).toHaveBeenCalledTimes(1);
  });
  it('aborts retry on navigation and ignores its late result', async () => {
    const x = await failed(); const slow = deferred<RetryResult>(); x.client.retry.mockReturnValueOnce(slow.promise); const pending = x.processing.retry(id);
    x.processing.dispose(); expect(x.client.retry.mock.calls[0][2].aborted).toBe(true); slow.resolve(reply()); await pending; expect(Object.keys(x.processing.state.entries)).toEqual([]);
  });
});
