import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiError } from '../src/common/errors/api-error';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadInitDto, UploadInitValidationPipe, uploadKey } from '../src/files/upload-init.dto';
import { UploadInitService, uploadFingerprint } from '../src/files/upload-init.service';
import { UploadInitGuard } from '../src/files/upload-init.guard';
import { FilesController } from '../src/files/files.controller';
import { OriginGuard } from '../src/auth/origin.guard';
import { SessionGuard } from '../src/auth/session.guard';
import type { ObjectStorage } from '../src/storage/storage.interface';

const owner = '00000000-0000-4000-8000-000000000001';
const fileId = '00000000-0000-4000-8000-000000000002';
const key = '00000000-0000-4000-8000-000000000003';
const now = new Date('2026-10-24T12:00:00.000Z');
const input = new UploadInitDto('photo.png', 'image/png', 100);
const appConfig = { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], maxUploadBytes: 104857600, presignedUrlTtlSeconds: 300 };
const config = { getOrThrow: () => appConfig } as unknown as ConfigService;
const file = () => ({ id: fileId, ownerId: owner, status: 'PENDING_UPLOAD', originalName: input.originalName, mimeType: input.mimeType,
  detectedMimeType: null, sizeBytes: 100n, storageKey: `originals/${owner}/${fileId}`, uploadUrlExpiresAt: new Date(+now + 300_000),
  confirmBy: new Date(+now + 900_000), createdAt: now });
const receipt = () => ({ id: '00000000-0000-4000-8000-000000000004', ownerId: owner, fileObjectId: fileId, state: 'OPEN',
  requestFingerprint: uploadFingerprint(input), terminalErrorCode: null as string | null, fileObject: file() });
function fixture(prior: ReturnType<typeof receipt> | null = null) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockImplementation((sql: TemplateStringsArray) => Promise.resolve(sql.join('').includes('FROM "User"') ?
      [{ id: owner, usedStorageBytes: 200n, reservedStorageBytes: 100n, storageLimitBytes: 1000n }] : [{ id: fileId }])),
    user: { update: jest.fn().mockResolvedValue({}) },
    fileObject: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...file(), ...data })) },
    uploadOperation: { findUnique: jest.fn().mockImplementation(() => Promise.resolve(prior)), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
  };
  const db = { uploadOperation: { findUnique: jest.fn().mockImplementation(() => Promise.resolve(prior)) },
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)) };
  const storage = { createUploadAccess: jest.fn().mockImplementation(({ expiresAt }) => Promise.resolve({ method: 'PUT', url: 'https://storage.invalid/synthetic', expiresAt,
    headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } })) };
  const service = new UploadInitService(db as unknown as PrismaService, config, storage as unknown as ObjectStorage);
  return { service, db, tx, storage };
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
afterEach(() => jest.useRealTimers());

describe('Upload init validation', () => {
  const pipe = new UploadInitValidationPipe(config);
  it('normalizes NFC, trims display whitespace and lowercases UUIDv4 only', () => {
    expect(pipe.transform({ ...input, originalName: '  a\u0301.png  ' }).originalName).toBe('á.png');
    expect(uploadKey(key.toUpperCase())).toBe(key);
    expect(pipe.transform({ ...input, originalName: '😀'.repeat(255) }).originalName).toHaveLength(510);
  });
  it.each([null, [], {}, { ...input, ownerId: owner }, { ...input, sizeBytes: '100' }, { ...input, sizeBytes: 0 },
    { ...input, sizeBytes: -1 }, { ...input, sizeBytes: 1.5 }, { ...input, sizeBytes: NaN }, { ...input, sizeBytes: Infinity },
    { ...input, sizeBytes: Number.MAX_SAFE_INTEGER + 1 }, { ...input, originalName: 5 }, { ...input, mimeType: null }])('rejects invalid shape %#', (value) => {
    expect(() => pipe.transform(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
  it.each(['', ' ', '.', '..', '../x', 'a\\b', 'a\0b', '\nname', 'a\u0085', 'a\u202e', 'a\u2066', '\ud800', '😀'.repeat(256)])('rejects unsafe name %#', (originalName) => {
    expect(() => pipe.transform({ ...input, originalName })).toThrow(expect.objectContaining({ code: 'INVALID_FILE_NAME' }));
  });
  it.each(['image/svg+xml', 'text/html', 'video/mp4', 'IMAGE/PNG', 'image/png; charset=utf-8'])('rejects out-of-slice MIME %s', (mimeType) => {
    expect(() => pipe.transform({ ...input, mimeType })).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
  });
  it('accepts exact size limit, rejects larger and respects configured subsets', () => {
    expect(pipe.transform({ ...input, sizeBytes: 104857600 }).sizeBytes).toBe(104857600);
    expect(() => pipe.transform({ ...input, sizeBytes: 104857601 })).toThrow(expect.objectContaining({ code: 'FILE_TOO_LARGE' }));
    const smaller = new UploadInitValidationPipe({ getOrThrow: () => ({ ...appConfig, maxUploadBytes: 50, allowedMimeTypes: ['image/jpeg'] }) } as unknown as ConfigService);
    expect(() => smaller.transform(input)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
    expect(() => smaller.transform({ ...input, mimeType: 'image/jpeg' })).toThrow(expect.objectContaining({ code: 'FILE_TOO_LARGE' }));
  });
  it.each([undefined, [], key + ', ' + key, '00000000-0000-1000-8000-000000000003', '00000000-0000-4000-7000-000000000003'])('rejects invalid operation key %#', (value) => {
    expect(() => uploadKey(value)).toThrow(ApiError);
  });
  it('uses the exact versioned canonical fingerprint format', () => {
    // SHA-256 fixture calculated independently with Python hashlib.
    expect(uploadFingerprint(input)).toBe('v1:00562923f7868f19e3ad9df9ec1b08b5ca90b5a9be07a29cdc7b474f078109d9');
    expect(uploadFingerprint({ ...input, sizeBytes: 101 })).not.toBe(uploadFingerprint(input));
    expect(uploadFingerprint({ ...input, originalName: 'other.png' })).not.toBe(uploadFingerprint(input));
  });
});

describe('Upload init transaction and replay', () => {
  it('creates one receipt/file/reservation with fixed deadlines and returns only public fields after commit', async () => {
    const { service, tx, db, storage } = fixture();
    const result = await service.initiate(owner, key, input);
    expect(result.created).toBe(true); expect(result.body.file.sizeBytes).toBe(100);
    expect(Object.keys(result.body.file)).toEqual(['id', 'status', 'originalName', 'mimeType', 'detectedMimeType', 'sizeBytes', 'confirmBy']);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: owner }, data: { reservedStorageBytes: { increment: 100n } } });
    expect(tx.uploadOperation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerId: owner, idempotencyKey: key,
      requestFingerprint: uploadFingerprint(input), createdAt: now, replayUntil: new Date(+now + 86400000) }) });
    expect(tx.fileObject.create.mock.calls[0][0].data).toMatchObject({ confirmBy: new Date(+now + 900000), uploadUrlExpiresAt: new Date(+now + 300000) });
    expect(storage.createUploadAccess.mock.invocationCallOrder[0]).toBeLessThan(db.$transaction.mock.invocationCallOrder[0]);
    expect(tx.$executeRaw.mock.calls.map(([parts]) => parts.join(''))).toEqual(["SET LOCAL lock_timeout = '3s'", "SET LOCAL statement_timeout = '4s'"]);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE'); expect(tx.$queryRaw.mock.calls[0][1]).toBe(owner);
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });
  });
  it('uses the adapter actual rounded expiry', async () => {
    const { service, tx, storage } = fixture(); storage.createUploadAccess.mockImplementationOnce(async ({ expiresAt }) => ({ method: 'PUT', url: 'synthetic', expiresAt: new Date(+expiresAt - 1000), headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } }));
    await service.initiate(owner, key, input); expect(tx.fileObject.create.mock.calls[0][0].data.uploadUrlExpiresAt).toEqual(new Date(+now + 299000));
  });
  it('replays without writes and signs only to original expiry under the correct lock order', async () => {
    const { service, tx, storage } = fixture(receipt());
    const result = await service.initiate(owner, key, input); expect(result.created).toBe(false); expect(result.body.file.id).toBe(fileId);
    expect(tx.fileObject.create).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled(); expect(tx.uploadOperation.update).not.toHaveBeenCalled();
    expect(storage.createUploadAccess.mock.calls[0][0].expiresAt).toEqual(file().uploadUrlExpiresAt);
    expect(tx.$queryRaw.mock.calls.map(([parts]) => parts.join(''))).toEqual([
      expect.stringContaining('FROM "User"'), expect.stringContaining('FROM "FileObject"'), expect.stringContaining('FROM "UploadOperation"')]);
  });
  it('resolves a concurrent winning init instead of returning the discarded candidate capability', async () => {
    const { service, tx, db, storage } = fixture(receipt()); db.uploadOperation.findUnique.mockResolvedValueOnce(null);
    const result = await service.initiate(owner, key, input);
    expect(result.body.file.id).toBe(fileId); expect(storage.createUploadAccess).toHaveBeenCalledTimes(2);
    expect(storage.createUploadAccess.mock.calls[1][0].key).toBe(file().storageKey);
    expect(tx.fileObject.create).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled(); expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('does not issue a URL when status changes during presigning', async () => {
    const prior = receipt(); const { service, storage } = fixture(prior);
    storage.createUploadAccess.mockImplementationOnce(async ({ expiresAt }) => {
      prior.state = 'FINALIZED'; prior.fileObject.status = 'ACTIVE';
      return { method: 'PUT', url: 'synthetic', expiresAt, headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } };
    });
    expect((await service.initiate(owner, key, input)).body.upload).toBeNull();
  });
  it('rechecks terminal state after the race-winner signing fails', async () => {
    const prior = receipt(); const { service, db, storage } = fixture(prior);
    db.uploadOperation.findUnique.mockResolvedValueOnce(null);
    storage.createUploadAccess.mockImplementationOnce(async ({ expiresAt }) => ({ method: 'PUT', url: 'discarded', expiresAt, headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } }));
    storage.createUploadAccess.mockImplementationOnce(async () => { prior.state = 'FINALIZED'; prior.fileObject.status = 'ACTIVE'; throw new Error('provider'); });
    expect((await service.initiate(owner, key, input)).body.upload).toBeNull();
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('rejects a new capability expired while waiting for the lock without creating rows', async () => {
    const { service, tx, storage } = fixture();
    storage.createUploadAccess.mockImplementationOnce(async ({ expiresAt }) => {
      jest.setSystemTime(expiresAt);
      return { method: 'PUT', url: 'expired', expiresAt, headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } };
    });
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(tx.fileObject.create).not.toHaveBeenCalled();
  });
  it('rejects expiry before the write transaction commits', async () => {
    const { service, tx } = fixture();
    tx.user.update.mockImplementationOnce(async () => { jest.setSystemTime(+now + 300000); return {}; });
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
  it('uses BigInt and permits exact quota equality', async () => {
    const { service, tx } = fixture(); tx.$queryRaw.mockResolvedValueOnce([{ id: owner, usedStorageBytes: 9007199254740993n, reservedStorageBytes: 100n, storageLimitBytes: 9007199254741193n }]);
    expect((await service.initiate(owner, key, input)).created).toBe(true);
  });
  it('rejects quota overflow without any writes', async () => {
    const { service, tx } = fixture(); tx.$queryRaw.mockResolvedValueOnce([{ id: owner, usedStorageBytes: 901n, reservedStorageBytes: 0n, storageLimitBytes: 1000n }]);
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(tx.fileObject.create).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('returns conflict before state and without storage calls for a different fingerprint', async () => {
    const prior = receipt(); prior.requestFingerprint = 'different'; prior.state = 'EXPIRED';
    const { service, storage, tx } = fixture(prior);
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(storage.createUploadAccess).not.toHaveBeenCalled(); expect(tx.user.update).not.toHaveBeenCalled();
  });
  it.each([['FINALIZED', 'ACTIVE', null, null], ['FINALIZED', 'SOFT_DELETED', null, 'RESOURCE_STATE_CONFLICT'],
    ['REJECTED', 'PENDING_UPLOAD', 'FILE_TOO_LARGE', 'FILE_TOO_LARGE'], ['REJECTED', 'PENDING_UPLOAD', 'UPLOAD_VALIDATION_FAILED', 'UPLOAD_VALIDATION_FAILED'],
    ['EXPIRED', 'PENDING_UPLOAD', 'UPLOAD_EXPIRED', 'UPLOAD_EXPIRED']])('preserves terminal/active replay %#', async (state, status, terminalErrorCode, error) => {
      const prior = receipt(); Object.assign(prior, { state, terminalErrorCode }); prior.fileObject.status = status!;
      const { service, tx, storage } = fixture(prior);
      if (error) await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: error });
      else expect((await service.initiate(owner, key, input)).body.upload).toBeNull();
      expect(tx.user.update).not.toHaveBeenCalled(); expect(storage.createUploadAccess).not.toHaveBeenCalled();
    });
  it('returns upload:null at original PUT expiry without extending deadlines', async () => {
    const prior = receipt(); jest.setSystemTime(prior.fileObject.uploadUrlExpiresAt);
    const { service, tx, storage } = fixture(prior); expect((await service.initiate(owner, key, input)).body.upload).toBeNull();
    expect(tx.uploadOperation.update).not.toHaveBeenCalled(); expect(storage.createUploadAccess).not.toHaveBeenCalled();
  });
  it('commits EXPIRED at confirm deadline then returns 410 without quota release', async () => {
    const prior = receipt(); jest.setSystemTime(prior.fileObject.confirmBy);
    const { service, tx } = fixture(prior); await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(tx.uploadOperation.update).toHaveBeenCalledWith({ where: { id: prior.id }, data: { state: 'EXPIRED', terminalErrorCode: 'UPLOAD_EXPIRED', closedAt: prior.fileObject.confirmBy } });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('handles a deadline crossing during signing by returning no capability', async () => {
    const prior = receipt(); const { service, storage } = fixture(prior);
    storage.createUploadAccess.mockImplementationOnce(async () => { jest.setSystemTime(prior.fileObject.uploadUrlExpiresAt); throw new Error('provider'); });
    expect((await service.initiate(owner, key, input)).body.upload).toBeNull();
  });
  it('does not reserve anything on presign failure for a new init', async () => {
    const { service, db, storage } = fixture(); storage.createUploadAccess.mockRejectedValueOnce(new Error('private URL'));
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' }); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each(['read', 'file', 'operation', 'counter', 'commit'])('masks DB failure at %s without returning an uncommitted capability', async (stage) => {
    const { service, db, tx } = fixture(); const error = new Error('private SQL/credential');
    if (stage === 'read') db.uploadOperation.findUnique.mockRejectedValueOnce(error);
    if (stage === 'file') tx.fileObject.create.mockRejectedValueOnce(error);
    if (stage === 'operation') tx.uploadOperation.create.mockRejectedValueOnce(error);
    if (stage === 'counter') tx.user.update.mockRejectedValueOnce(error);
    if (stage === 'commit') db.$transaction.mockImplementationOnce(async (callback) => { await callback(tx); throw error; });
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE', message: expect.not.stringContaining('private') });
  });
  it('rejects a deleted authenticated user on the locked DB read', async () => {
    const { service, tx } = fixture(); tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.initiate(owner, key, input)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(tx.fileObject.create).not.toHaveBeenCalled();
  });
});

describe('Upload init guard and controller', () => {
  const context = (id = owner, headers: Record<string, unknown> = {}) => ({ switchToHttp: () => ({ getRequest: () => ({
    user: { id }, headers: { 'content-type': 'application/json', 'idempotency-key': key, ...headers },
  }) }) }) as unknown as ExecutionContext;
  it('runs Origin/current-session checks before upload guard and DTO', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FilesController.prototype.initiate)).toEqual([OriginGuard, SessionGuard, UploadInitGuard]);
  });
  it('limits new requests and replays per current user without trusting headers', () => {
    const guard = new UploadInitGuard(); for (let i = 0; i < 30; i++) expect(guard.canActivate(context())).toBe(true);
    expect(() => guard.canActivate(context())).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    expect(guard.canActivate(context(fileId))).toBe(true); jest.setSystemTime(+now + 60000); expect(guard.canActivate(context())).toBe(true);
  });
  it.each([undefined, 'text/plain', 'application/json; charset=latin1', ['application/json']])('requires JSON content type %#', (type) => {
    expect(() => new UploadInitGuard().canActivate(context(owner, { 'content-type': type }))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
  });
  it('bounds rate-limit state and prunes expired entries', () => {
    const guard = new UploadInitGuard(); for (let i = 0; i < 4096; i++) guard.canActivate(context(String(i)));
    expect(() => guard.canActivate(context('full'))).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    jest.setSystemTime(+now + 60000); expect(guard.canActivate(context('new'))).toBe(true);
  });
  it.each([true, false])('returns 201 only for new operations: %s', async (created) => {
    const result = { created, body: { file: { id: fileId }, upload: null } }; const service = { initiate: jest.fn().mockResolvedValue(result) };
    const response = { status: jest.fn(), json: jest.fn() }; response.status.mockReturnValue(response); const request = { user: { id: owner } };
    await new FilesController(service as unknown as UploadInitService, undefined as never, undefined as never).initiate(request as never, key, input, response as never);
    expect(service.initiate).toHaveBeenCalledWith(owner, key, input); expect(response.status).toHaveBeenCalledWith(created ? 201 : 200); expect(response.json).toHaveBeenCalledWith(result.body);
  });
});
