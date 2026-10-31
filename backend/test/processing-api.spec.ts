import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ObjectStorage } from '../src/storage/storage.interface';
import { ProcessingApiService } from '../src/files/processing-api.service';
import { thumbnailProcessingPolicy as policy } from '../src/processing/thumbnail-processor';
import { processingFixture, processingOwner as owner, processingFile as fileId, processingWorker as worker, candidate } from './helpers/processing-fixture';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => jest.useRealTimers());
async function fixture(kind: 'none' | 'queued' | 'ready' | 'blocked' = 'queued') {
  const f = processingFixture(policy);
  const app = { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], thumbnailPreviewTtlSeconds: 60,
    presignedUrlTtlSeconds: 300, frontendPublicUrl: 'https://app.test' };
  const config = { getOrThrow: () => app } as unknown as ConfigService;
  const storage = { head: jest.fn().mockResolvedValue({ sizeBytes: 200, contentType: 'image/webp', etag: '"output"' }),
    createReadAccess: jest.fn().mockImplementation(async ({ expiresAt }) => ({ url: 'https://storage.test/thumbnail?signature=unit', expiresAt: new Date(+expiresAt) })),
    writeDerived: jest.fn(), deleteObject: jest.fn() };
  const service = new ProcessingApiService(f.db as unknown as PrismaService, config, f.service, storage as unknown as ObjectStorage);
  const job = kind === 'none' ? undefined : await f.service.createJob(owner, fileId);
  if (kind === 'ready' || kind === 'blocked') {
    const claim = (await f.service.claim(owner, fileId, job!.id, worker))!;
    if (kind === 'blocked') f.user.storageLimitBytes = 100n;
    await f.service.reserve(claim, { ...candidate, implementationFingerprint: policy.implementationFingerprint });
    if (kind === 'ready') { await f.service.markStored(claim); await f.service.finalize(claim); }
  }
  return { f, app, storage, service, job };
}
const code = (value: string) => expect.objectContaining({ code: value });

describe('Processing batch status projection and authorization', () => {
  it('reports legacy NOT_SCHEDULED read-only with exact public fields and no scheduling/storage I/O', async () => {
    const { f, service, storage } = await fixture('none'); const before = f.writes;
    const body = await service.status(owner, [fileId]);
    expect(body).toEqual({ items: [{ fileId, processorKey: 'thumbnail', processorVersion: '1.0.0', state: 'NOT_SCHEDULED',
      retryRevision: 0, attemptCount: 0, nextAttemptAt: null, errorCode: null, retryable: false, result: null, cleanupPending: false }] });
    expect(f.writes).toBe(before); expect(f.jobs).toHaveLength(0); expect(storage.head).not.toHaveBeenCalled();
    expect(f.tx.fileObject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [fileId] }, ownerId: owner, status: 'ACTIVE', deletedAt: null } }));
    expect(f.db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead', timeout: 5000 }));
  });
  it('returns the request order and does not expose job/source/lease/storage fields', async () => {
    const { f, service } = await fixture('ready'); const second = '00000000-0000-4000-8000-000000000111';
    f.store.fileObject.push({ ...f.file, id: second, storageKey: `originals/${owner}/${second}` });
    const body = await service.status(owner, [second, fileId]);
    expect(body.items.map(row => row.fileId)).toEqual([second, fileId]);
    expect(body.items[1]!.result).toEqual({ id: f.results[0]!.id, mimeType: 'image/webp', sizeBytes: 200, width: 32, height: 16,
      createdAt: f.results[0]!.createdAt.toISOString() });
    const text = JSON.stringify(body);
    for (const secret of [f.file.storageKey, f.results[0]!.storageKey, policy.implementationFingerprint, candidate.sourceSha256, owner]) expect(text).not.toContain(secret);
    for (const field of ['storageKey', 'leaseOwner', 'fence', 'sourceFingerprint', 'url', 'sha256', 'ownerId']) expect(text).not.toContain(`"${field}"`);
  });
  it.each(['foreign', 'missing', 'PENDING_UPLOAD', 'SOFT_DELETED'] as const)('fails the WHOLE batch with one 404 for %s', async kind => {
    const { f, service, storage } = await fixture();
    const second = '00000000-0000-4000-8000-000000000112';
    f.store.fileObject.push({ ...f.file, id: second, ownerId: kind === 'foreign' ? worker : owner,
      status: kind === 'missing' ? 'ACTIVE' : kind === 'foreign' ? 'ACTIVE' : kind });
    if (kind === 'missing') f.store.fileObject.pop();
    await expect(service.status(owner, [fileId, second])).rejects.toEqual(code('FILE_NOT_FOUND'));
    await expect(service.thumbnailUrl(owner, second)).rejects.toEqual(code('FILE_NOT_FOUND'));
    await expect(service.retry(owner, second, 0)).rejects.toEqual(code('FILE_NOT_FOUND'));
    expect(f.tx.processingJob.findMany).not.toHaveBeenCalled(); expect(storage.head).not.toHaveBeenCalled();
  });
  it.each(['mime', 'detected', 'config'] as const)('rejects own unsupported image %s with 415 before jobs/storage', async kind => {
    const { f, app, service, storage } = await fixture();
    if (kind === 'mime') f.file.mimeType = 'image/gif';
    if (kind === 'detected') f.file.detectedMimeType = 'video/mp4';
    if (kind === 'config') app.allowedMimeTypes = ['image/gif'];
    await expect(service.status(owner, [fileId])).rejects.toEqual(code('PREVIEW_NOT_ALLOWED'));
    await expect(service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PREVIEW_NOT_ALLOWED'));
    await expect(service.retry(owner, fileId, 0)).rejects.toEqual(code('PREVIEW_NOT_ALLOWED')); expect(storage.head).not.toHaveBeenCalled();
  });
  it('only selects the current processor version; a foreign build in that version is unavailable', async () => {
    const x = await fixture(); x.f.jobs[0]!.processorVersion = '0.9.0';
    expect((await x.service.status(owner, [fileId])).items[0]!.state).toBe('NOT_SCHEDULED');
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('THUMBNAIL_NOT_READY'));
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('PROCESSING_RETRY_NOT_ALLOWED'));
    x.f.jobs[0]!.processorVersion = policy.version; x.f.jobs[0]!.implementationFingerprint = 'f'.repeat(64);
    await expect(x.service.status(owner, [fileId])).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
  });
  it('only publishes READY result metadata for SUCCEEDED and reports outstanding cleanup separately', async () => {
    const x = await fixture('ready');
    x.f.store.processingAttempt.push({ ...x.f.attempts[0], id: worker, phase: 'CLEANUP_BLOCKED', finalizedAt: null, reservationReleasedAt: null });
    const before = x.f.writes;
    expect((await x.service.status(owner, [fileId])).items[0]).toMatchObject({ state: 'SUCCEEDED', cleanupPending: true, result: { sizeBytes: 200 } });
    x.f.jobs[0]!.state = 'RUNNING';
    expect((await x.service.status(owner, [fileId])).items[0]!.result).toBeNull(); expect(x.f.writes).toBe(before);
  });
  it.each(['phase', 'owner', 'hash', 'width', 'source', 'key', 'fence'] as const)('refuses inconsistent published %s metadata', async kind => {
    const x = await fixture('ready');
    if (kind === 'phase') x.f.attempts[0]!.phase = 'STORED';
    if (kind === 'owner') x.f.results[0]!.ownerId = worker;
    if (kind === 'hash') x.f.results[0]!.sha256 = 'f'.repeat(64);
    if (kind === 'width') x.f.results[0]!.width = 511;
    if (kind === 'source') x.f.file.sizeBytes++;
    if (kind === 'key') x.f.results[0]!.storageKey += '.wrong';
    if (kind === 'fence') x.f.results[0]!.publicationFence++;
    if (kind === 'owner') expect((await x.service.status(owner, [fileId])).items[0]!.result).toBeNull();
    else await expect(x.service.status(owner, [fileId])).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
  });
  it('masks unknown job errors and raw database failures', async () => {
    const x = await fixture(); x.f.jobs[0]!.lastErrorCode = 'PRIVATE_PROVIDER_KEY';
    expect((await x.service.status(owner, [fileId])).items[0]!.errorCode).toBe('PROCESSING_UNAVAILABLE');
    x.f.tx.processingJob.findMany.mockRejectedValueOnce(new Error('private SQL credentials'));
    await expect(x.service.status(owner, [fileId])).rejects.toMatchObject({ code: 'PROCESSING_UNAVAILABLE', message: 'A képfeldolgozás átmenetileg nem érhető el.' });
  });
});

describe('Ready thumbnail capabilities', () => {
  it('returns exactly a safe URL and real expiry, fixed inline name/MIME, max default60s; original counters unchanged', async () => {
    const x = await fixture('ready'); const used = x.f.user.usedStorageBytes; const reserved = x.f.user.reservedStorageBytes; const writes = x.f.writes;
    const body = await x.service.thumbnailUrl(owner, fileId);
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'url']); expect(+new Date(body.expiresAt) - Date.now()).toBe(60000);
    expect(x.storage.createReadAccess).toHaveBeenCalledWith({ key: x.f.results[0]!.storageKey, mimeType: 'image/webp', originalName: 'thumbnail.webp',
      disposition: 'inline', expiresAt: new Date(Date.now() + 60000) });
    expect(x.f.writes).toBe(writes); expect(x.f.user).toMatchObject({ usedStorageBytes: used, reservedStorageBytes: reserved });
  });
  it.each([[30, 300, 30], [300, 300, 300], [300, 40, 40], [60, 1, 1]])('caps thumbnail %s / shared %s to %ss', async (thumbnail, shared, actual) => {
    const x = await fixture('ready'); x.app.thumbnailPreviewTtlSeconds = thumbnail; x.app.presignedUrlTtlSeconds = shared;
    expect(+new Date((await x.service.thumbnailUrl(owner, fileId)).expiresAt) - Date.now()).toBe(actual * 1000);
  });
  it.each(['none', 'queued', 'blocked'] as const)('returns 409 without storage for %s', async kind => {
    const x = await fixture(kind); await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('THUMBNAIL_NOT_READY'));
    expect(x.storage.head).not.toHaveBeenCalled(); expect(x.storage.createReadAccess).not.toHaveBeenCalled();
  });
  it.each([null, { sizeBytes: 201, contentType: 'image/webp' }, { sizeBytes: 200, contentType: 'text/html' }])('rejects missing/inconsistent storage HEAD %#', async head => {
    const x = await fixture('ready'); x.storage.head.mockResolvedValueOnce(head);
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PROCESSING_UNAVAILABLE')); expect(x.storage.createReadAccess).not.toHaveBeenCalled();
  });
  it.each(['head', 'createReadAccess'] as const)('masks %s provider failure without falling back to original', async method => {
    const x = await fixture('ready'); x.storage[method].mockRejectedValueOnce(new Error('private signed URL credentials'));
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PROCESSING_UNAVAILABLE')); expect(x.storage.writeDerived).not.toHaveBeenCalled();
  });
  it.each(['expired', 'overlong', 'invalidDate', 'javascript', 'userinfo', 'fragment', 'frontend'] as const)('discards unsafe access %s', async kind => {
    const x = await fixture('ready'); x.storage.createReadAccess.mockImplementationOnce(async ({ expiresAt }) => ({
      url: kind === 'javascript' ? 'javascript:alert(1)' : kind === 'userinfo' ? 'https://user:secret@storage.test/x'
        : kind === 'fragment' ? 'https://storage.test/x#secret' : kind === 'frontend' ? 'https://app.test/x' : 'https://storage.test/x',
      expiresAt: kind === 'expired' ? new Date(Date.now()) : kind === 'overlong' ? new Date(+expiresAt + 1000) : kind === 'invalidDate' ? new Date(NaN) : expiresAt,
    }));
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
  });
  it('rejects late signing/read completion even when the returned expiry initially matched', async () => {
    const x = await fixture('ready'); const sign = x.storage.createReadAccess.getMockImplementation()!;
    x.storage.createReadAccess.mockImplementationOnce(async args => { const result = await sign(args); jest.setSystemTime(+args.expiresAt + 1); return result; });
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
  });
  it('does not accept an adapter-mutated requested deadline', async () => {
    const x = await fixture('ready'); x.storage.createReadAccess.mockImplementationOnce(async ({ expiresAt }) => {
      expiresAt.setTime(+expiresAt + 600000); return { url: 'https://storage.test/x', expiresAt };
    });
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toEqual(code('PROCESSING_UNAVAILABLE'));
  });
  it.each(['owner', 'deleted', 'mime', 'retired', 'changed'] as const)('rechecks %s after signing and discards stale URL', async kind => {
    const x = await fixture('ready'); const sign = x.storage.createReadAccess.getMockImplementation()!;
    x.storage.createReadAccess.mockImplementationOnce(async args => {
      const result = await sign(args);
      if (kind === 'owner') x.f.file.ownerId = worker;
      if (kind === 'deleted') x.f.file.status = 'SOFT_DELETED';
      if (kind === 'mime') x.app.allowedMimeTypes = ['image/gif'];
      if (kind === 'retired') x.f.results[0]!.state = 'RETIRED';
      if (kind === 'changed') x.f.results[0]!.sha256 = 'f'.repeat(64);
      return result;
    });
    await expect(x.service.thumbnailUrl(owner, fileId)).rejects.toThrow();
  });
});

describe('Idempotent bounded HTTP retry uses the durable CAS outcome', () => {
  it('two concurrent expected0 requests produce one winner and one replay, retaining old accounting', async () => {
    const x = await fixture('blocked'); const before = { ...x.f.user };
    const results = await Promise.all([x.service.retry(owner, fileId, 0), x.service.retry(owner, fileId, 0)]);
    expect(results.map(result => result.changed).sort()).toEqual([false, true]);
    expect(results.every(result => result.body.retryRevision === 1)).toBe(true); expect(x.f.jobs[0]!.totalAttemptCount).toBe(1);
    expect(x.f.user).toEqual(before); expect(x.storage.writeDerived).not.toHaveBeenCalled();
  });
  it('lost retry commit acknowledgement is a safe replay with no extra cycle', async () => {
    const x = await fixture('blocked'); x.f.onWrite = operation => { if (operation === 'processingJob.update') x.f.loseCommitResponse = true; };
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('PROCESSING_UNAVAILABLE')); x.f.onWrite = undefined;
    const response = await x.service.retry(owner, fileId, 0); expect(response.changed).toBe(false); expect(response.body.retryRevision).toBe(1);
    expect(x.f.jobs[0]!.totalAttemptCount).toBe(1);
  });
  it('success no-op never regenerates, but FUTURE revision is still rejected first', async () => {
    const x = await fixture('ready'); const writes = x.f.writes;
    expect((await x.service.retry(owner, fileId, 0)).changed).toBe(false);
    await expect(x.service.retry(owner, fileId, 1)).rejects.toEqual(code('PROCESSING_RETRY_NOT_ALLOWED'));
    expect(x.f.writes).toBe(writes); expect(x.f.results).toHaveLength(1); expect(x.storage.writeDerived).not.toHaveBeenCalled();
  });
  it.each(['none', 'queued'] as const)('does not backfill/reset %s', async kind => {
    const x = await fixture(kind); const before = x.f.writes;
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('PROCESSING_RETRY_NOT_ALLOWED')); expect(x.f.writes).toBe(before);
  });
  it('rejects nonretryable input failure and exhausted manual cycles', async () => {
    const x = await fixture(); const claim = (await x.f.service.claim(owner, fileId, x.job!.id, worker))!;
    await x.f.service.fail(claim, 'PROCESSOR_INPUT_INVALID');
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('PROCESSING_RETRY_NOT_ALLOWED'));
    Object.assign(x.f.jobs[0]!, { retryRevision: 2, totalAttemptCount: 9, cycleAttemptCount: 3, retryable: false });
    await expect(x.service.retry(owner, fileId, 2)).rejects.toEqual(code('PROCESSING_RETRY_NOT_ALLOWED'));
  });
  it('rechecks owner/ACTIVE in the mutation transaction when the source changes after API lookup', async () => {
    const x = await fixture('blocked'); const retry = x.f.service.retryWithOutcome.bind(x.f.service);
    jest.spyOn(x.f.service, 'retryWithOutcome').mockImplementationOnce(async (...args) => { x.f.file.status = 'SOFT_DELETED'; return retry(...args); });
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('FILE_NOT_FOUND'));
    expect(x.f.jobs[0]!.retryRevision).toBe(0);
  });
  it('allows CANCELLED retry only after the parent is restored ACTIVE', async () => {
    const x = await fixture(); x.f.file.status = 'SOFT_DELETED'; x.f.file.deletedAt = new Date(x.f.now);
    await x.f.service.cancel(owner, fileId, x.job!.id);
    await expect(x.service.retry(owner, fileId, 0)).rejects.toEqual(code('FILE_NOT_FOUND'));
    x.f.file.status = 'ACTIVE'; x.f.file.deletedAt = null;
    expect((await x.service.retry(owner, fileId, 0)).changed).toBe(true);
  });
});
