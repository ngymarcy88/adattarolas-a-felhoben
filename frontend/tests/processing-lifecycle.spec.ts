import { afterEach, expect, it, vi } from 'vitest';
import { bindPageVisibility } from '../src/gallery/modal';
import { createProcessing } from '../src/gallery/processing';
import type { ProcessingStatus } from '../src/api/processing';
import { processingStatus } from './helpers/processing-fixture';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('page lifecycle adapter pauses hidden work, resumes visibility and detaches its listener; disposal aborts navigation work', async () => {
  vi.useFakeTimers(); const listeners = new Map<string, () => void>();
  const source = { visibilityState: 'visible', addEventListener: vi.fn((name, listener) => listeners.set(name, listener)), removeEventListener: vi.fn((name) => listeners.delete(name)) };
  const resolvers: ((rows: ProcessingStatus[]) => void)[] = [];
  const client = { status: vi.fn((_ids: readonly string[], _signal: AbortSignal) => new Promise<ProcessingStatus[]>(resolve => resolvers.push(resolve))), retry: vi.fn() };
  const processing = createProcessing(client); const id = processingStatus().fileId; processing.retain([id]); processing.setVisible(id, true);
  const cleanup = bindPageVisibility(hidden => processing.setActive(!hidden), source as unknown as Document);
  await vi.advanceTimersByTimeAsync(0); expect(client.status).toHaveBeenCalledTimes(1);
  source.visibilityState = 'hidden'; listeners.get('visibilitychange')!(); expect(client.status.mock.calls[0][1].aborted).toBe(true);
  resolvers[0]([processingStatus(1, 'SUCCEEDED')]); await vi.advanceTimersByTimeAsync(30000); expect(client.status).toHaveBeenCalledTimes(1); expect(processing.state.entries[id].status).toBeNull();
  source.visibilityState = 'visible'; listeners.get('visibilitychange')!(); await vi.advanceTimersByTimeAsync(0); expect(client.status).toHaveBeenCalledTimes(2);
  cleanup(); processing.dispose(); expect(client.status.mock.calls[1][1].aborted).toBe(true); expect(listeners.has('visibilitychange')).toBe(false);
  resolvers[1]([processingStatus()]); await vi.advanceTimersByTimeAsync(30000); expect(Object.keys(processing.state.entries)).toEqual([]); expect(client.status).toHaveBeenCalledTimes(2);
});
