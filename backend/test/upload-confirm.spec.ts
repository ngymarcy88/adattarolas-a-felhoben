import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { detectImageMime, IMAGE_PREFIX_BYTES } from '../src/files/image-signature';
import { FileIdPipe, UploadConfirmGuard } from '../src/files/upload-confirm.guard';
import { FilesController } from '../src/files/files.controller';
import { UploadConfirmService } from '../src/files/upload-confirm.service';
import type { FileObject } from '../src/generated/prisma/client';
import { FilesModule } from '../src/files/files.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProcessingStateService } from '../src/processing/processing-state.service';
import { ThumbnailProcessor, thumbnailProcessingPolicy } from '../src/processing/thumbnail-processor';
import { OriginGuard } from '../src/auth/origin.guard';
import { SessionGuard } from '../src/auth/session.guard';
import { owner, id, now, png, uploadFixture } from './helpers/upload-fixture';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
afterEach(() => jest.useRealTimers());

describe('Bounded image signature classification', () => {
  it.each([
    [png, 'image/png'], [Buffer.from([255, 216, 255, 224, 0, 16]), 'image/jpeg'],
    [Buffer.from('GIF87a'), 'image/gif'], [Buffer.from('GIF89a'), 'image/gif'],
    ...['VP8 ', 'VP8L', 'VP8X'].map(chunk => [Buffer.from('RIFF\0\0\0\0WEBP' + chunk), 'image/webp']),
  ])('classifies supported signatures %#', (bytes, mime) => { expect(detectImageMime(bytes as Uint8Array)).toBe(mime); });
  it.each([Buffer.alloc(0), png.subarray(0, 7), Buffer.from([255, 216]), Buffer.from('GIF89'),
    Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.from('RIFF\0\0\0\0WEBPBAD!'), Buffer.from('<svg>'), Buffer.from('<html>'), Buffer.alloc(16)])
    ('rejects incomplete/unknown/unsafe signatures %#', (bytes) => { expect(detectImageMime(bytes)).toBeNull(); });
});

describe('Upload confirm state and accounting', () => {
  it('checks object identity outside locks and atomically finalizes with exactly one safe audit', async () => {
    const { confirmation, tx, storage, file } = uploadFixture();
    const result = await confirmation.confirm(owner, id, 'safe-request');
    expect(result.file).toMatchObject({ id, status: 'ACTIVE', detectedMimeType: 'image/png', sizeBytes: png.length });
    expect(result.file).not.toHaveProperty('storageKey'); expect(result.file).not.toHaveProperty('uploadOperation');
    expect(storage.readPrefix).toHaveBeenCalledWith(file.storageKey, { sizeBytes: png.length, contentType: 'text/html', etag: '"identity"' }, IMAGE_PREFIX_BYTES);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: owner }, data: { reservedStorageBytes: { decrement: BigInt(png.length) }, usedStorageBytes: { increment: BigInt(png.length) } } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'UPLOAD_CONFIRMED', requestId: 'safe-request', metadata: { sizeBytes: String(png.length), mimeType: 'image/png' } }) });
    expect(file.uploadOperation!.state).toBe('FINALIZED'); expect(file.uploadOperation!.writesClosedAt).toBeNull();
    const queries = tx.$queryRaw.mock.calls.map(([parts]) => parts.join(''));
    expect(queries.slice(0, 3)).toEqual([expect.stringContaining('FROM "User"'), expect.stringContaining('FROM "FileObject"'), expect.stringContaining('FROM "UploadOperation"')]);
  });
  it('two concurrent confirms perform one accounting/audit action', async () => {
    const { confirmation, tx } = uploadFixture();
    const results = await Promise.all([confirmation.confirm(owner, id), confirmation.confirm(owner, id)]);
    expect(results.map(x => x.file.status)).toEqual(['ACTIVE', 'ACTIVE']);
    expect(tx.user.update).toHaveBeenCalledTimes(1); expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });
  it('active replay needs no receipt, deadline or storage access', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); file.status = 'ACTIVE'; file.detectedMimeType = 'image/png'; file.uploadOperation = null;
    jest.setSystemTime(+now + 86400000);
    expect((await confirmation.confirm(owner, id)).file.status).toBe('ACTIVE'); expect(storage.head).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('soft delete is not undone by confirm', async () => {
    const { confirmation, file, storage } = uploadFixture(); file.status = 'SOFT_DELETED';
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' }); expect(storage.head).not.toHaveBeenCalled();
  });
  it.each(['FILE_TOO_LARGE', 'UPLOAD_VALIDATION_FAILED', 'UPLOAD_EXPIRED'] as const)('preserves a terminal reason after the deadline: %s', async (terminalErrorCode) => {
    const { confirmation, file, storage, tx } = uploadFixture(); Object.assign(file.uploadOperation!, { state: terminalErrorCode === 'UPLOAD_EXPIRED' ? 'EXPIRED' : 'REJECTED', terminalErrorCode });
    jest.setSystemTime(+now + 86400000);
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: terminalErrorCode }); expect(storage.head).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('closes expired OPEN persistently, with reservation untouched', async () => {
    const { confirmation, file, tx, storage } = uploadFixture(); jest.setSystemTime(file.confirmBy);
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(file.uploadOperation!.state).toBe('EXPIRED'); expect(tx.user.update).not.toHaveBeenCalled(); expect(storage.head).not.toHaveBeenCalled();
  });
  it.each([[0, 'UPLOAD_VALIDATION_FAILED'], [1, 'UPLOAD_VALIDATION_FAILED'], [104857601, 'FILE_TOO_LARGE']])('rejects actual size %s and retains quota', async (sizeBytes, error) => {
    const { confirmation, file, tx, storage } = uploadFixture(); storage.head.mockResolvedValueOnce({ sizeBytes: Number(sizeBytes), contentType: 'image/png', etag: '"identity"' });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: error });
    expect(file.uploadOperation!.state).toBe('REJECTED'); expect(tx.user.update).not.toHaveBeenCalled(); expect(storage.readPrefix).not.toHaveBeenCalled();
  });
  it.each([Buffer.from('<html>not an image'), Buffer.from('GIF89a')])('rejects unknown or MIME-mismatched content %#', async (prefix) => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.readPrefix.mockResolvedValueOnce(prefix);
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_VALIDATION_FAILED' }); expect(file.uploadOperation!.state).toBe('REJECTED'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('leaves a missing object OPEN and returns not-ready', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.head.mockResolvedValueOnce(null as never);
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_NOT_READY' }); expect(file.uploadOperation!.state).toBe('OPEN'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it.each(['head', 'readPrefix'] as const)('transient %s failure does not reject content', async (method) => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage[method].mockRejectedValueOnce(new Error('private provider URL'));
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_VERIFICATION_UNAVAILABLE', message: expect.not.stringContaining('private') });
    expect(file.uploadOperation!.state).toBe('OPEN'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('deadline reached during provider I/O wins over a validation result', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.readPrefix.mockImplementationOnce(async () => { jest.setSystemTime(file.confirmBy); return Buffer.alloc(16); });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' }); expect(file.uploadOperation!.state).toBe('EXPIRED'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('deadline reached during transient failure still persists expiry', async () => {
    const { confirmation, file, storage } = uploadFixture(); storage.head.mockImplementationOnce(async () => { jest.setSystemTime(file.confirmBy); throw new Error('provider'); });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' }); expect(file.uploadOperation!.state).toBe('EXPIRED');
  });
  it('rolls back a rejection that crosses the deadline and persists EXPIRED instead', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.readPrefix.mockResolvedValueOnce(Buffer.alloc(16));
    tx.uploadOperation.update.mockImplementationOnce(async ({ data }) => {
      Object.assign(file.uploadOperation!, data); jest.setSystemTime(file.confirmBy); return structuredClone(file.uploadOperation);
    });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(file.uploadOperation!.state).toBe('EXPIRED'); expect(file.uploadOperation!.terminalErrorCode).toBe('UPLOAD_EXPIRED');
    expect(file.status).toBe('PENDING_UPLOAD'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('rolls back successful writes if the last DB step crosses the deadline', async () => {
    const { confirmation, file, tx } = uploadFixture();
    tx.auditEvent.create.mockImplementationOnce(async () => { jest.setSystemTime(file.confirmBy); return {}; });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(file.status).toBe('PENDING_UPLOAD'); expect(file.uploadOperation!.state).toBe('EXPIRED');
  });
  it('a concurrent terminal winner cannot be reactivated', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.readPrefix.mockImplementationOnce(async () => {
      Object.assign(file.uploadOperation!, { state: 'EXPIRED', terminalErrorCode: 'UPLOAD_EXPIRED', closedAt: now }); return png.subarray(0, 16);
    });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' }); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('a concurrent ACTIVE winner overrides a stale provider error', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.head.mockImplementationOnce(async () => { file.status = 'ACTIVE'; file.detectedMimeType = 'image/png'; throw new Error('stale'); });
    expect((await confirmation.confirm(owner, id)).file.status).toBe('ACTIVE'); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('different owner and absent file both return 404 before provider access', async () => {
    const a = uploadFixture(); a.file.ownerId = 'another-owner';
    await expect(a.confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' }); expect(a.storage.head).not.toHaveBeenCalled();
    const b = uploadFixture(); b.tx.$queryRaw.mockResolvedValueOnce([{ reservedStorageBytes: 100n }]).mockResolvedValueOnce([]);
    await expect(b.confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' }); expect(b.storage.head).not.toHaveBeenCalled();
  });
  it('refuses inconsistent accounting instead of negative reservation', async () => {
    const { confirmation, user, tx } = uploadFixture(); user.reservedStorageBytes = 0n;
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' }); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('fails closed if immutable metadata changed during verification', async () => {
    const { confirmation, file, storage, tx } = uploadFixture(); storage.readPrefix.mockImplementationOnce(async () => { file.sizeBytes++; return png.subarray(0, 16); });
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' }); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('maps DB write/audit errors safely', async () => {
    const { confirmation, tx } = uploadFixture(); tx.auditEvent.create.mockRejectedValueOnce(new Error('private SQL'));
    await expect(confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });
});

describe('Confirm request boundary', () => {
  const context = (headers: Record<string, unknown> = {}, body?: unknown, userId = owner) => ({ switchToHttp: () => ({ getRequest: () => ({ headers, body, user: { id: userId } }) }) }) as unknown as ExecutionContext;
  it('validates UUID syntax independently from resource existence', () => {
    const pipe = new FileIdPipe(); expect(pipe.transform(id.toUpperCase())).toBe(id);
    for (const value of [null, '../secret', '', [id], id+' ']) expect(() => pipe.transform(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
  it('requires Origin and current session guards first', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FilesController.prototype.confirm)).toEqual([OriginGuard, SessionGuard, UploadConfirmGuard]);
  });
  it('accepts bodyless POST with or without JSON content-type', () => {
    expect(new UploadConfirmGuard().canActivate(context())).toBe(true);
    expect(new UploadConfirmGuard().canActivate(context({ 'content-length': '0', 'content-type': 'application/json' }))).toBe(true);
  });
  it.each([[{ 'content-length': '2' }, undefined], [{}, {}], [{ 'transfer-encoding': 'chunked' }, undefined]])('rejects body claims %#', (headers, body) => {
    expect(() => new UploadConfirmGuard().canActivate(context(headers as Record<string, unknown>, body))).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
  it('bounds authenticated confirmation attempts and limiter memory', () => {
    const guard = new UploadConfirmGuard(); for (let i=0;i<60;i++) guard.canActivate(context());
    expect(() => guard.canActivate(context())).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    for (let i=0;i<4095;i++) guard.canActivate(context({}, undefined, String(i)));
    expect(() => guard.canActivate(context({}, undefined, 'overflow'))).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    jest.setSystemTime(+now+60000); expect(guard.canActivate(context({}, undefined, 'fresh'))).toBe(true);
  });
  it('returns explicit 200 with public result and authenticated owner', async () => {
    const service = { confirm: jest.fn().mockResolvedValue({ file: { id, status: 'ACTIVE' } }) };
    const response = { status: jest.fn(), json: jest.fn() }; response.status.mockReturnValue(response);
    await new FilesController(undefined as never, service as unknown as UploadConfirmService, undefined as never, undefined as never).confirm({ user: { id: owner }, requestId: 'request' } as never, id, response as never);
    expect(service.confirm).toHaveBeenCalledWith(owner, id, 'request'); expect(response.status).toHaveBeenCalledWith(200); expect(response.json).toHaveBeenCalledWith({ file: { id, status: 'ACTIVE' } });
  });
});


describe('Atomic upload confirmation and durable thumbnail scheduling', () => {
  it('commits ACTIVE, original accounting, one audit and one QUEUED versioned job together without a nested transaction', async () => {
    const f = uploadFixture(); const decode = jest.spyOn(ThumbnailProcessor.prototype, 'process');
    try {
      const result = await f.confirmation.confirm(owner, id);
      expect(result.file.status).toBe('ACTIVE');
      expect(f.jobs).toHaveLength(1);
      expect(f.jobs[0]).toMatchObject({ ownerId: owner, fileObjectId: id, processorKey: 'thumbnail', processorVersion: '1.0.0',
        state: 'QUEUED', implementationFingerprint: thumbnailProcessingPolicy.implementationFingerprint, totalAttemptCount: 0, fence: 0n });
      expect(f.jobs[0]!.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(f.user).toEqual({ reservedStorageBytes: 0n, usedStorageBytes: BigInt(png.length) });
      expect(f.audits).toHaveLength(1); expect(f.db.$transaction).toHaveBeenCalledTimes(2); // initial view + atomic finalization
      expect(decode).not.toHaveBeenCalled(); expect(result).not.toHaveProperty('job');
      const order = [f.tx.fileObject.update, f.tx.user.update, f.tx.processingJob.create, f.tx.auditEvent.create].map(fn => fn.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    } finally { decode.mockRestore(); }
  });
  it.each(['file', 'operation', 'accounting', 'job', 'audit'] as const)('rolls back the entire confirmation on a %s persistence failure and permits healthy retry', async (step) => {
    const f = uploadFixture();
    const method = { file: f.tx.fileObject.update, operation: f.tx.uploadOperation.update, accounting: f.tx.user.update,
      job: f.tx.processingJob.create, audit: f.tx.auditEvent.create }[step];
    method.mockRejectedValueOnce(new Error('private SQL/provider details'));
    await expect(f.confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(f.file.status).toBe('PENDING_UPLOAD'); expect(f.file.detectedMimeType).toBeNull();
    expect(f.file.uploadOperation!.state).toBe('OPEN'); expect(f.jobs).toHaveLength(0); expect(f.audits).toHaveLength(0);
    expect(f.user).toEqual({ reservedStorageBytes: BigInt(png.length), usedStorageBytes: 0n });
    await f.confirmation.confirm(owner, id);
    expect(f.file.status).toBe('ACTIVE'); expect(f.jobs).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.user).toEqual({ reservedStorageBytes: 0n, usedStorageBytes: BigInt(png.length) });
  });
  it('deadline crossed after enqueue rolls back the job together with activation/accounting/audit', async () => {
    const f = uploadFixture(); const write = f.tx.processingJob.create.getMockImplementation()!;
    f.tx.processingJob.create.mockImplementationOnce(async args => { const job = await write(args); jest.setSystemTime(f.file.confirmBy); return job; });
    await expect(f.confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(f.file.status).toBe('PENDING_UPLOAD'); expect(f.jobs).toHaveLength(0); expect(f.audits).toHaveLength(0);
    expect(f.user).toEqual({ reservedStorageBytes: BigInt(png.length), usedStorageBytes: 0n });
  });
  it('parallel and repeated confirms keep one logical job and one original charge/audit', async () => {
    const f = uploadFixture();
    const outcomes = await Promise.all([f.confirmation.confirm(owner, id), f.confirmation.confirm(owner, id), f.confirmation.confirm(owner, id)]);
    await f.confirmation.confirm(owner, id);
    expect(outcomes.every(outcome => outcome.file.status === 'ACTIVE')).toBe(true);
    expect(f.jobs).toHaveLength(1); expect(f.tx.processingJob.create).toHaveBeenCalledTimes(1);
    expect(f.audits).toHaveLength(1); expect(f.tx.user.update).toHaveBeenCalledTimes(1);
  });
  it('a committed activation with a lost response retains its job across a fresh confirm-service instance', async () => {
    const f = uploadFixture(); const write = f.tx.auditEvent.create.getMockImplementation()!;
    f.tx.auditEvent.create.mockImplementationOnce(async args => { const result = await write(args); f.behavior.loseNextCommitResponse = true; return result; });
    await expect(f.confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(f.file.status).toBe('ACTIVE'); expect(f.jobs).toHaveLength(1);
    const jobId = f.jobs[0]!.id;
    const fresh = new UploadConfirmService(f.state, f.config, f.storage as never, f.processing);
    f.storage.head.mockClear(); await fresh.confirm(owner, id);
    expect(f.jobs.map(job => job.id)).toEqual([jobId]); expect(f.storage.head).not.toHaveBeenCalled();
    expect(f.tx.user.update).toHaveBeenCalledTimes(1); expect(f.audits).toHaveLength(1);
  });
  it('a failed processor job leaves ACTIVE original and confirm replay usable without resetting the failure', async () => {
    const f = uploadFixture(); await f.confirmation.confirm(owner, id);
    Object.assign(f.jobs[0]!, { state: 'FAILED', lastErrorCode: 'PROCESSOR_INPUT_INVALID', finishedAt: new Date() });
    const decode = jest.spyOn(ThumbnailProcessor.prototype, 'process').mockRejectedValue(new Error('decoder failure'));
    try {
      const result = await f.confirmation.confirm(owner, id);
      expect(result.file.status).toBe('ACTIVE'); expect(f.jobs[0]!.state).toBe('FAILED');
      expect(f.jobs).toHaveLength(1); expect(f.user.usedStorageBytes).toBe(BigInt(png.length)); expect(decode).not.toHaveBeenCalled();
    } finally { decode.mockRestore(); }
  });
  it('ACTIVE legacy replay without receipt/job does not backfill even after the old deadline', async () => {
    const f = uploadFixture(); f.file.status = 'ACTIVE'; f.file.detectedMimeType = 'image/png'; f.file.uploadOperation = null;
    f.user.reservedStorageBytes = 0n; f.user.usedStorageBytes = BigInt(png.length); jest.setSystemTime(+now + 86400000);
    await f.confirmation.confirm(owner, id);
    expect(f.jobs).toHaveLength(0); expect(f.tx.processingJob.findFirst).not.toHaveBeenCalled(); expect(f.storage.head).not.toHaveBeenCalled();
  });
  it.each(['SOFT_DELETED', 'EXPIRED', 'REJECTED', 'MISSING_OBJECT', 'INVALID_CONTENT'])(
    'does not enqueue for excluded confirm outcome %s', async reason => {
      const f = uploadFixture();
      if (reason === 'SOFT_DELETED') f.file.status = 'SOFT_DELETED';
      if (reason === 'EXPIRED') jest.setSystemTime(f.file.confirmBy);
      if (reason === 'REJECTED') Object.assign(f.file.uploadOperation!, { state: 'REJECTED', terminalErrorCode: 'UPLOAD_VALIDATION_FAILED' });
      if (reason === 'MISSING_OBJECT') f.storage.head.mockResolvedValueOnce(null as never);
      if (reason === 'INVALID_CONTENT') f.storage.readPrefix.mockResolvedValueOnce(Buffer.alloc(16));
      await expect(f.confirmation.confirm(owner, id)).rejects.toThrow();
      expect(f.jobs).toHaveLength(0); expect(f.tx.processingJob.create).not.toHaveBeenCalled();
      expect(f.user.usedStorageBytes).toBe(0n); expect(f.user.reservedStorageBytes).toBe(BigInt(png.length));
    });
  it.each([
    ['image/jpeg', Buffer.from([255, 216, 255, 224])], ['image/gif', Buffer.from('GIF89a')],
    ['image/webp', Buffer.from('RIFF\0\0\0\0WEBPVP8 ')],
  ] as const)('queues the supported confirmed image type %s', async (mimeType, prefix) => {
    const f = uploadFixture(); f.file.mimeType = mimeType; f.storage.readPrefix.mockResolvedValueOnce(Buffer.from(prefix));
    await f.confirmation.confirm(owner, id);
    expect(f.jobs).toHaveLength(1); expect(f.jobs[0]!.state).toBe('QUEUED'); expect(f.file.detectedMimeType).toBe(mimeType);
  });
  it('queues an upload larger than decoder input limit without rejecting its original or reserving derived bytes', async () => {
    const f = uploadFixture(); f.file.sizeBytes = 40n * 1024n * 1024n; f.user.reservedStorageBytes = f.file.sizeBytes;
    f.storage.head.mockResolvedValueOnce({ sizeBytes: Number(f.file.sizeBytes), contentType: 'image/png', etag: '"identity"' });
    expect((await f.confirmation.confirm(owner, id)).file.status).toBe('ACTIVE');
    expect(f.jobs).toHaveLength(1); expect(f.user.usedStorageBytes).toBe(f.file.sizeBytes); expect(f.user.reservedStorageBytes).toBe(0n);
  });
  it('enqueue helper reuses an existing logical job without resetting state or starting another transaction', async () => {
    const f = uploadFixture(); await f.confirmation.confirm(owner, id); const jobId = f.jobs[0]!.id;
    const result = await f.db.$transaction((tx: never) => f.processing.enqueueConfirmedFile(tx, f.file));
    expect(result!.id).toBe(jobId); expect(f.jobs).toHaveLength(1); expect(f.tx.processingJob.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: 'PENDING_UPLOAD' }, { status: 'SOFT_DELETED' }, { deletedAt: new Date(now) },
    { mimeType: 'video/mp4', detectedMimeType: 'video/mp4' }, { detectedMimeType: null }, { mimeType: 'image/gif', detectedMimeType: 'image/png' },
  ])('enqueue helper skips ineligible state/type metadata %o', async patch => {
    const f = uploadFixture(); const active = { ...f.file, status: 'ACTIVE', detectedMimeType: 'image/png', ...patch } as FileObject;
    expect(await f.processing.enqueueConfirmedFile(f.tx as never, active)).toBeNull(); expect(f.jobs).toHaveLength(0);
  });
  it('only registers a state-service factory using the same thumbnail build descriptor, with no worker provider', () => {
    const providers = Reflect.getMetadata('providers', FilesModule) as Array<{ provide?: unknown; inject?: unknown[]; useFactory?: Function }>;
    const factory = providers.find(provider => provider.provide === ProcessingStateService)!;
    expect(factory.inject).toEqual([PrismaService, ConfigService]); const f = uploadFixture();
    expect(factory.useFactory!(f.db, f.config)).toBeInstanceOf(ProcessingStateService);
    expect(Reflect.getMetadata('design:paramtypes', UploadConfirmService)).toContain(ProcessingStateService);
    expect(providers).not.toContain(ThumbnailProcessor);
  });
});
