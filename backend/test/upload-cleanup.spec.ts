import 'reflect-metadata';
import { UploadCleanupService, CLEANUP_BATCH_SIZE } from '../src/files/upload-cleanup.service';
import { UploadCleanupWorker } from '../src/files/upload-cleanup.worker';
import { owner, id, now, uploadFixture } from './helpers/upload-fixture';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
afterEach(() => jest.useRealTimers());
function rejected(proof = false) {
  const f = uploadFixture();
  Object.assign(f.file.uploadOperation!, { state: 'REJECTED', terminalErrorCode: 'UPLOAD_VALIDATION_FAILED', closedAt: now,
    writesClosedAt: proof ? now : null });
  return f;
}
describe('Upload cleanup proof gate and retry', () => {
  it('expires overdue OPEN but retains object/quota without write-closure proof', async () => {
    const { cleanup, file, storage, tx } = uploadFixture(); jest.setSystemTime(file.confirmBy);
    expect(await cleanup.clean(owner, id)).toBe('blocked');
    expect(file.uploadOperation!.state).toBe('EXPIRED'); expect(file.uploadOperation!.terminalErrorCode).toBe('UPLOAD_EXPIRED');
    expect(file.uploadOperation!.writesClosedAt).toBeNull(); expect(file.cleanupLastErrorCode).toBe('WRITE_CLOSURE_UNPROVEN');
    expect(file.cleanupAttemptCount).toBe(1); expect(+file.cleanupRetryAfter!).toBe(+file.confirmBy + 60000);
    expect(storage.head).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('does not reinterpret REJECTED as EXPIRED when time passes', async () => {
    const { cleanup, file } = rejected(); jest.setSystemTime(+now + 86400000);
    expect(await cleanup.clean(owner, id)).toBe('blocked'); expect(file.uploadOperation!.terminalErrorCode).toBe('UPLOAD_VALIDATION_FAILED');
  });
  it('does not accept a future proof timestamp as current write closure', async () => {
    const { cleanup, file, storage, tx } = rejected(true); file.uploadOperation!.writesClosedAt = new Date(+now + 60000);
    expect(await cleanup.clean(owner, id)).toBe('blocked'); expect(storage.head).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('even a missing object is not queried or released without proof', async () => {
    const { cleanup, storage, tx } = rejected(); storage.head.mockResolvedValue(null as never);
    expect(await cleanup.clean(owner, id)).toBe('blocked'); expect(storage.head).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('waits for retry time and uses capped exponential backoff', async () => {
    const { cleanup, file, tx } = rejected();
    expect(await cleanup.clean(owner, id)).toBe('blocked'); expect(await cleanup.clean(owner, id)).toBe('skip');
    expect(tx.fileObject.update).toHaveBeenCalledTimes(1);
    jest.setSystemTime(+now + 60000); expect(await cleanup.clean(owner, id)).toBe('blocked');
    expect(+file.cleanupRetryAfter!).toBe(+now + 60000 + 120000);
    file.cleanupAttemptCount = 2147483647; file.cleanupRetryAfter = null;
    await cleanup.clean(owner, id); expect(file.cleanupAttemptCount).toBe(2147483647); expect(+file.cleanupRetryAfter!).toBe(+now + 60000 + 3600000);
  });
  it.each(['ACTIVE', 'SOFT_DELETED'] as const)('never deletes a %s file', async (status) => {
    const { cleanup, file, storage, tx } = rejected(true); file.status = status;
    expect(await cleanup.clean(owner, id)).toBe('skip'); expect(storage.head).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('does not expire a valid OPEN', async () => {
    const { cleanup, tx, storage } = uploadFixture(); expect(await cleanup.clean(owner, id)).toBe('skip');
    expect(tx.uploadOperation.update).not.toHaveBeenCalled(); expect(storage.head).not.toHaveBeenCalled();
  });
  it('does not touch FINALIZED or already released operations', async () => {
    const a = rejected(true); a.file.uploadOperation!.state = 'FINALIZED'; expect(await a.cleanup.clean(owner, id)).toBe('skip');
    const b = rejected(true); b.file.uploadOperation!.reservationReleasedAt = now; expect(await b.cleanup.clean(owner, id)).toBe('skip');
    expect(a.storage.head).not.toHaveBeenCalled(); expect(b.storage.head).not.toHaveBeenCalled();
  });
  it('given a synthetic trusted proof, deletes then verifies absence and releases once', async () => {
    // Proof is a controlled fixture; the current provider cannot generate it in production.
    const { cleanup, file, storage, tx } = rejected(true);
    storage.head.mockResolvedValueOnce({ sizeBytes: 68, contentType: 'image/png', etag: '"identity"' }).mockResolvedValueOnce(null as never);
    expect(await cleanup.clean(owner, id)).toBe('released');
    expect(storage.deleteObject).toHaveBeenCalledWith(file.storageKey);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: owner }, data: { reservedStorageBytes: { decrement: file.sizeBytes } } });
    expect(file.uploadOperation!.reservationReleasedAt).toEqual(now); expect(file.uploadOperation!.terminalErrorCode).toBe('UPLOAD_VALIDATION_FAILED');
    expect(await cleanup.clean(owner, id)).toBe('skip'); expect(tx.user.update).toHaveBeenCalledTimes(1);
  });
  it('proof plus verified absence needs no DELETE', async () => {
    const { cleanup, storage, tx } = rejected(true); storage.head.mockResolvedValue(null as never);
    expect(await cleanup.clean(owner, id)).toBe('released'); expect(storage.deleteObject).not.toHaveBeenCalled(); expect(tx.user.update).toHaveBeenCalledTimes(1);
  });
  it.each(['head', 'deleteObject'] as const)('retains quota on %s failure and schedules retry', async (method) => {
    const { cleanup, file, storage, tx } = rejected(true); storage[method].mockRejectedValueOnce(new Error('private URL'));
    expect(await cleanup.clean(owner, id)).toBe('retry'); expect(tx.user.update).not.toHaveBeenCalled(); expect(file.cleanupLastErrorCode).toBe('STORAGE_UNAVAILABLE');
    expect(file.uploadOperation!.reservationReleasedAt).toBeNull();
  });
  it('retains quota if delete returns success but object remains', async () => {
    const { cleanup, tx, file } = rejected(true); expect(await cleanup.clean(owner, id)).toBe('retry');
    expect(tx.user.update).not.toHaveBeenCalled(); expect(file.uploadOperation!.reservationReleasedAt).toBeNull();
  });
  it('can retry after storage deletion and a DB release failure', async () => {
    const { cleanup, file, storage, tx } = rejected(true); storage.head.mockResolvedValue(null as never);
    tx.user.update.mockRejectedValueOnce(new Error('connection lost'));
    await expect(cleanup.clean(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(file.uploadOperation!.reservationReleasedAt).toBeNull();
    expect(await cleanup.clean(owner, id)).toBe('released');
  });
  it('fails closed when reserved bytes cannot cover release', async () => {
    const { cleanup, user, storage, tx } = rejected(true); user.reservedStorageBytes = 0n; storage.head.mockResolvedValue(null as never);
    await expect(cleanup.clean(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' }); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('does not release if storage identity/proof changes during cleanup', async () => {
    const { cleanup, file, storage, tx } = rejected(true);
    storage.head.mockImplementationOnce(async () => { file.storageKey += '-changed'; return null as never; }).mockResolvedValueOnce(null as never);
    expect(await cleanup.clean(owner, id)).toBe('blocked'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('two cleanup deliveries cannot release twice', async () => {
    const { cleanup, storage, tx } = rejected(true); storage.head.mockResolvedValue(null as never);
    const results = await Promise.all([cleanup.clean(owner, id), cleanup.clean(owner, id)]);
    expect(results.sort()).toEqual(['released', 'skip']); expect(tx.user.update).toHaveBeenCalledTimes(1);
  });
});

describe('Bounded cleanup batch and worker lifecycle', () => {
  it('selects a bounded due batch with per-file failure isolation', async () => {
    const { cleanup, db } = rejected();
    db.fileObject.findMany.mockResolvedValue([{ id, ownerId: owner }, { id: 'second', ownerId: owner }]);
    jest.spyOn(cleanup, 'clean').mockRejectedValueOnce(new Error('private DB')).mockResolvedValueOnce('blocked');
    const summary = await cleanup.runBatch(); expect(summary).toMatchObject({ selected: 2, blocked: 1, failed: 1, released: 0 });
    expect(db.fileObject.findMany.mock.calls[0][0]).toMatchObject({ take: CLEANUP_BATCH_SIZE, where: { status: 'PENDING_UPLOAD' } });
  });
  it('does not overlap manual batches and resets after DB failure', async () => {
    const { cleanup, db } = rejected(); let release!: (value: never[]) => void;
    db.fileObject.findMany.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = cleanup.runBatch(); expect((await cleanup.runBatch()).selected).toBe(0); release([]); await first;
    db.fileObject.findMany.mockRejectedValueOnce(new Error('private'));
    await expect(cleanup.runBatch()).rejects.toThrow();
    expect((await cleanup.runBatch()).selected).toBe(1);
  });
  it('shutdown aborts the remainder of the batch after the current file', async () => {
    const { cleanup, db } = rejected();
    db.fileObject.findMany.mockResolvedValue([{ id, ownerId: owner }, { id: 'next', ownerId: owner }]);
    let done!: (value: 'blocked') => void;
    const clean = jest.spyOn(cleanup, 'clean').mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const signal = new AbortController(); const batch = cleanup.runBatch(signal.signal);
    await Promise.resolve(); signal.abort(); done('blocked');
    const result = await batch; expect(clean).toHaveBeenCalledTimes(1); expect(result.blocked).toBe(1);
  });
  it('runs at most one tick and waits/clears on shutdown', async () => {
    let finish!: () => void; const service = { runBatch: jest.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; })) };
    const worker = new UploadCleanupWorker(service as unknown as UploadCleanupService); worker.onModuleInit();
    jest.advanceTimersByTime(60000); expect(service.runBatch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60000); expect(service.runBatch).toHaveBeenCalledTimes(1);
    const stopped = worker.onModuleDestroy(); finish(); await stopped;
    jest.advanceTimersByTime(120000); expect(service.runBatch).toHaveBeenCalledTimes(1);
  });
});
