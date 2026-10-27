import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, Logger, type ArgumentsHost, type ExecutionContext } from '@nestjs/common';
import { SessionGuard } from '../src/auth/session.guard';
import { ApiError } from '../src/common/errors/api-error';
import { HttpExceptionFilter } from '../src/common/errors/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { FilePreviewService } from '../src/files/file-preview.service';
import { FilePreviewGuard } from '../src/files/file-preview.guard';
import { FileListGuard } from '../src/files/file-list.guard';
import { FileIdPipe } from '../src/files/upload-confirm.guard';
import { FilesController } from '../src/files/files.controller';
import { FilesModule } from '../src/files/files.module';
import type { ObjectStorage } from '../src/storage/storage.interface';
import { StorageError } from '../src/storage/storage-error';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const now = new Date('2026-10-27T12:00:00.123Z');
const url = 'https://storage.invalid/object?synthetic-capability=private';
const row = () => ({ id, ownerId: owner, status: 'ACTIVE', storageKey: `originals/${owner}/${id}`, originalName: 'Árvíz "kép".png',
  mimeType: 'image/png', detectedMimeType: 'image/png' as string | null, sizeBytes: 8n });
function fixture(initial: ReturnType<typeof row> | null = row()) {
  const state = { file: initial };
  const findFirst = jest.fn().mockImplementation(async ({ where, select }) => {
    const file = state.file;
    return file && file.id === where.id && file.ownerId === where.ownerId && file.status === where.status
      ? Object.fromEntries(Object.keys(select).map(key => [key, file[key as keyof typeof file]])) : null;
  });
  const configData = { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'], presignedUrlTtlSeconds: 300 };
  const config = { getOrThrow: () => configData };
  const storage = { head: jest.fn().mockResolvedValue({ sizeBytes: 8, contentType: 'untrusted metadata', etag: '"opaque"' }),
    createReadAccess: jest.fn().mockImplementation(async ({ expiresAt }) => ({ url, expiresAt: new Date(+expiresAt) })) };
  const service = new FilePreviewService({ fileObject: { findFirst } } as unknown as PrismaService, config as unknown as ConfigService, storage as unknown as ObjectStorage);
  return { state, findFirst, storage, configData, service };
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('Private active image preview', () => {
  it('signs a validated original image inline and returns only the URL and actual expiry', async () => {
    const { service, findFirst, storage } = fixture(); const result = await service.create(owner, id);
    expect(result).toEqual({ url, expiresAt: new Date(+now + 300_000).toISOString() });
    expect(Object.keys(result)).toEqual(['url', 'expiresAt']);
    expect(storage.head).toHaveBeenCalledTimes(1); expect(storage.head).toHaveBeenCalledWith(row().storageKey);
    expect(storage.createReadAccess).toHaveBeenCalledTimes(1);
    expect(storage.createReadAccess).toHaveBeenCalledWith({ key: row().storageKey, mimeType: 'image/png', originalName: row().originalName,
      disposition: 'inline', expiresAt: new Date(+now + 300_000) });
    expect(findFirst).toHaveBeenCalledTimes(2);
    for (const [query] of findFirst.mock.calls) expect(query).toEqual({ where: { id, ownerId: owner, status: 'ACTIVE' },
      select: { storageKey: true, originalName: true, mimeType: true, detectedMimeType: true, sizeBytes: true } });
    expect(findFirst.mock.invocationCallOrder[0]).toBeLessThan(storage.head.mock.invocationCallOrder[0]);
    expect(storage.createReadAccess.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[1]);
  });
  it.each(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])('allows confirmed %s, independent of the filename suffix and storage Content-Type', async mime => {
    const file = { ...row(), mimeType: mime, detectedMimeType: mime, originalName: 'misleading.txt' };
    const { service, storage } = fixture(file); await service.create(owner, id);
    expect(storage.createReadAccess.mock.calls[0][0].mimeType).toBe(mime);
  });
  it.each(['missing', 'foreign', 'pending', 'deleted'])('hides %s records with the same 404 before any storage/type lookup', async scenario => {
    const file = row();
    if (scenario === 'foreign') { file.ownerId = other; file.mimeType = 'text/html'; file.detectedMimeType = null; }
    if (scenario === 'pending') file.status = 'PENDING_UPLOAD';
    if (scenario === 'deleted') file.status = 'SOFT_DELETED';
    const { service, storage } = fixture(scenario === 'missing' ? null : file);
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    expect(storage.head).not.toHaveBeenCalled(); expect(storage.createReadAccess).not.toHaveBeenCalled();
  });
  it.each([null, 'video/mp4', 'video/webm', 'image/svg+xml', 'text/html', 'application/xml', 'application/javascript', 'image/unknown'])('rejects detected type %s before storage', async mime => {
    const file = { ...row(), mimeType: mime ?? 'image/png', detectedMimeType: mime }; const { service, storage } = fixture(file);
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'PREVIEW_NOT_ALLOWED' }); expect(storage.head).not.toHaveBeenCalled();
  });
  it('rejects declared/detected mismatch and config-disabled types, not just unsupported extensions', async () => {
    const wrong = fixture({ ...row(), mimeType: 'image/jpeg' });
    await expect(wrong.service.create(owner, id)).rejects.toMatchObject({ code: 'PREVIEW_NOT_ALLOWED' });
    const disabled = fixture(); disabled.configData.allowedMimeTypes = ['image/jpeg'];
    await expect(disabled.service.create(owner, id)).rejects.toMatchObject({ code: 'PREVIEW_NOT_ALLOWED' });
    expect(wrong.storage.head).not.toHaveBeenCalled(); expect(disabled.storage.head).not.toHaveBeenCalled();
  });
  it('treats a proved missing object as 404 and never signs it', async () => {
    const { service, storage } = fixture(); storage.head.mockResolvedValue(null);
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' }); expect(storage.createReadAccess).not.toHaveBeenCalled();
  });
  it.each([0, 7, 9, -1, NaN, Infinity, 8.5, Number.MAX_SAFE_INTEGER + 1])('rejects missing/invalid/mismatched object size %s without issuing a URL', async sizeBytes => {
    const { service, storage } = fixture(); storage.head.mockResolvedValue({ sizeBytes });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' }); expect(storage.createReadAccess).not.toHaveBeenCalled();
  });
  it.each(['head', 'createReadAccess'] as const)('sanitizes %s failures and has no public URL fallback', async method => {
    const { service, storage } = fixture(); storage[method].mockRejectedValue(new Error('private provider URL, credentials and stack'));
    const error = await service.create(owner, id).catch(e => e); expect(error).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(error.message).not.toContain('private'); if (method === 'head') expect(storage.createReadAccess).not.toHaveBeenCalled();
  });
  it('does not confuse a provider/bucket/permission failure with proved object absence', async () => {
    const { service, storage } = fixture(); storage.head.mockRejectedValue(new StorageError('UNAVAILABLE'));
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
  it('sanitizes initial and final database failures', async () => {
    const initial = fixture(); initial.findFirst.mockRejectedValue(new Error('private DB credential'));
    await expect(initial.service.create(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' }); expect(initial.storage.head).not.toHaveBeenCalled();
    const final = fixture(); final.findFirst.mockImplementationOnce(async () => row()).mockRejectedValue(new Error('private DB credential'));
    await expect(final.service.create(owner, id)).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });
  it.each(['removed', 'foreign', 'pending', 'deleted'])('discards the capability if the record becomes %s during signing', async scenario => {
    const { service, state, storage } = fixture(); storage.createReadAccess.mockImplementation(async ({ expiresAt }) => {
      if (scenario === 'removed') state.file = null;
      else if (scenario === 'foreign') state.file!.ownerId = other;
      else state.file!.status = scenario === 'pending' ? 'PENDING_UPLOAD' : 'SOFT_DELETED';
      return { url, expiresAt };
    });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });
  it.each(['storageKey', 'originalName', 'sizeBytes', 'mimeType'] as const)('discards stale preview metadata when %s changes', async field => {
    const { service, state, storage } = fixture(); storage.createReadAccess.mockImplementation(async ({ expiresAt }) => {
      if (field === 'sizeBytes') state.file!.sizeBytes = 9n;
      else if (field === 'mimeType') { state.file!.mimeType = 'image/jpeg'; state.file!.detectedMimeType = 'image/jpeg'; }
      else state.file![field] += '-changed';
      return { url, expiresAt };
    });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
  it('revalidates MIME after provider I/O', async () => {
    const { service, state, storage } = fixture(); storage.head.mockImplementation(async () => {
      state.file!.detectedMimeType = null; return { sizeBytes: 8 };
    });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'PREVIEW_NOT_ALLOWED' });
  });
});

describe('Preview expiry and response boundary', () => {
  it.each([1, 30, 300, 900])('caps configured TTL %i to at most five minutes', async ttl => {
    const { service, storage, configData } = fixture(); configData.presignedUrlTtlSeconds = ttl;
    const result = await service.create(owner, id); const expected = +now + Math.min(300, ttl) * 1000;
    expect(+storage.createReadAccess.mock.calls[0][0].expiresAt).toBe(expected); expect(Date.parse(result.expiresAt)).toBe(expected);
  });
  it('uses the adapter actual shorter expiry and calculates TTL after HEAD', async () => {
    const { service, storage } = fixture(); storage.head.mockImplementation(async () => { jest.setSystemTime(+now + 5000); return { sizeBytes: 8 }; });
    storage.createReadAccess.mockImplementation(async ({ expiresAt }) => ({ url, expiresAt: new Date(+expiresAt - 1000) }));
    expect((await service.create(owner, id)).expiresAt).toBe(new Date(+now + 304_000).toISOString());
  });
  it.each([new Date(NaN), new Date(+now), new Date(+now - 1), new Date(+now + 300_001)])('rejects invalid/expired/extended returned expiry %#', async expiresAt => {
    const { service, storage } = fixture(); storage.createReadAccess.mockResolvedValue({ url, expiresAt });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
  it('keeps an independent deadline if an adapter mutates the supplied Date', async () => {
    const { service, storage } = fixture(); storage.createReadAccess.mockImplementation(async ({ expiresAt }) => {
      expiresAt.setTime(+expiresAt + 1000); return { url, expiresAt };
    });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
  it('does not return a capability that expired during the final DB check', async () => {
    const { service, findFirst } = fixture(); findFirst.mockImplementationOnce(async () => row()).mockImplementationOnce(async () => {
      jest.setSystemTime(+now + 300_000); return row();
    });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
  it.each(['', 'javascript:private', 'https://user:password@storage.invalid/file', 'https://storage.invalid/file#private'])('rejects unusable adapter URL %#', async badUrl => {
    const { service, storage } = fixture(); storage.createReadAccess.mockResolvedValue({ url: badUrl, expiresAt: new Date(+now + 60_000) });
    await expect(service.create(owner, id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
});

function context(user = owner, extra = {}) {
  const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const request = { user: { id: user }, headers: {}, query: {}, requestId: 'preview-test', ...extra };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) };
  return { response, host: host as unknown as ExecutionContext };
}
describe('Preview request, rate and controller boundary', () => {
  it.each(['', '../file', id + '\n', null, [], id + '0'])('rejects invalid file UUID %#', input => {
    expect(() => new FileIdPipe().transform(input)).toThrow(ApiError);
  });
  it('normalizes uppercase UUID and never requires Origin on the safe GET', async () => {
    const mixed = 'ABCDEF00-1234-4567-89AB-1234567890AB'; expect(new FileIdPipe().transform(mixed)).toBe(mixed.toLowerCase());
    const service = { create: jest.fn().mockResolvedValue({ url, expiresAt: new Date(+now + 1000).toISOString() }) };
    const controller = new FilesController(undefined as never, undefined as never, undefined as never, service as unknown as FilePreviewService);
    await controller.previewUrl({ user: { id: owner } } as never, id); expect(service.create).toHaveBeenCalledWith(owner, id);
    expect(Reflect.getMetadata(GUARDS_METADATA, controller.previewUrl)).toEqual([SessionGuard, FilePreviewGuard]);
    expect(Reflect.getMetadata(HEADERS_METADATA, controller.previewUrl)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    expect(Reflect.getMetadata(PATH_METADATA, controller.previewUrl)).toBe(':fileId/preview-url');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.previewUrl)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('providers', FilesModule)).toEqual(expect.arrayContaining([FilePreviewService, FilePreviewGuard]));
  });
  it.each([{ query: { extra: 'x' } }, { query: { limit: '1' } }, { body: {} }, { body: null },
    { headers: { 'content-length': '1' } }, { headers: { 'transfer-encoding': 'chunked' } }])('rejects query/body %#', request => {
    expect(() => new FilePreviewGuard().canActivate(context(owner, request).host)).toThrow(ApiError);
  });
  it('allows 120 requests per user independently from list budgets and returns Retry-After', () => {
    const guard = new FilePreviewGuard(); const { host, response } = context();
    const list = new FileListGuard(); for (let i = 0; i < 60; i++) list.canActivate(host);
    for (let i = 0; i < 120; i++) expect(guard.canActivate(host)).toBe(true);
    expect(() => guard.canActivate(host)).toThrow(ApiError); expect(response.setHeader).toHaveBeenLastCalledWith('Retry-After', '60');
    expect(guard.canActivate(context(other).host)).toBe(true);
    jest.setSystemTime(+now + 59_001); expect(() => guard.canActivate(host)).toThrow(ApiError);
    expect(response.setHeader).toHaveBeenLastCalledWith('Retry-After', '1');
    jest.setSystemTime(+now + 60_000); expect(guard.canActivate(host)).toBe(true);
  });
  it('bounds identities to 4096 live windows and reclaims them after expiry', () => {
    const guard = new FilePreviewGuard(); for (let i = 0; i < 4096; i++) guard.canActivate(context(String(i)).host);
    expect(() => guard.canActivate(context('new').host)).toThrow(ApiError);
    jest.setSystemTime(+now + 60_000); expect(guard.canActivate(context('new').host)).toBe(true);
  });
  it.each(['PREVIEW_NOT_ALLOWED', 'FILE_NOT_FOUND', 'STORAGE_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'AUTH_REQUIRED', 'RATE_LIMITED'] as const)('wraps %s without private URL/key/provider details', code => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, response } = context(); new HttpExceptionFilter().catch(new ApiError(code), host as unknown as ArgumentsHost);
    expect(response.json).toHaveBeenCalledWith({ error: { code, message: expect.any(String), details: {}, requestId: 'preview-test' } });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private');
  });
});
