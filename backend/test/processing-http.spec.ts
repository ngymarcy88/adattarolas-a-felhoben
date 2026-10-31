import 'reflect-metadata';
import { type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA, HEADERS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { OriginGuard } from '../src/auth/origin.guard';
import { SessionGuard } from '../src/auth/session.guard';
import { ApiError } from '../src/common/errors/api-error';
import { ProcessingController } from '../src/files/processing.controller';
import { ProcessingApiService } from '../src/files/processing-api.service';
import { ProcessingStatusPipe, ProcessingRetryPipe } from '../src/files/processing.dto';
import { ProcessingStatusGuard, ThumbnailUrlGuard, ProcessingRetryGuard } from '../src/files/processing.guard';
import { FilesModule } from '../src/files/files.module';
import { processingFile as id, processingOwner as owner } from './helpers/processing-fixture';

const status = new ProcessingStatusPipe(); const retry = new ProcessingRetryPipe();
function context(json = true, patch: Record<string, unknown> = {}) {
  const setHeader = jest.fn(); const request = { user: { id: owner }, headers: json ? { 'content-type': 'application/json' } : {},
    query: {}, body: json ? { fileIds: [id] } : undefined, ...patch };
  return { request, setHeader, ctx: { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }) } as unknown as ExecutionContext };
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => jest.useRealTimers());

describe('Strict processing request DTOs', () => {
  it('normalizes IDs, retains order and allows exactly20 distinct IDs', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `abcdef00-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(status.transform({ fileIds: ids.map(value => value.toUpperCase()) })).toEqual({ fileIds: ids });
  });
  it.each([null, [], {}, { fileIds: [] }, { fileIds: [id], ownerId: owner }, { fileIds: [id, id.toUpperCase()] },
    { fileIds: ['../file'] }, { fileIds: [id + '\n'] }, { fileIds: 'not-array' }, { fileIds: [null] },
    { fileIds: Array.from({ length: 21 }, () => id) }, { fileIds: new Array(1) }])('rejects invalid batch %#', input => {
    expect(() => status.transform(input)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
  it.each([0, 1, 2])('accepts revision %s without coercion', revision => { expect(retry.transform({ expectedRetryRevision: revision })).toEqual({ expectedRetryRevision: revision }); });
  it.each([{}, null, [], { expectedRetryRevision: '0' }, { expectedRetryRevision: true }, { expectedRetryRevision: -1 },
    { expectedRetryRevision: 3 }, { expectedRetryRevision: 0.5 }, { expectedRetryRevision: NaN }, { expectedRetryRevision: 0, processorVersion: '2.0.0' }])(
    'rejects invalid retry body %#', input => { expect(() => retry.transform(input)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' })); });
});

describe('Independent authenticated-user processing request budgets', () => {
  it.each([[ProcessingStatusGuard, true, 60], [ThumbnailUrlGuard, false, 60], [ProcessingRetryGuard, true, 10]] as const)(
    'enforces %p budget=%s/%s and Retry-After, then resets', (Guard, json, limit) => {
      const guard = new Guard(); const c = context(json);
      for (let i = 0; i < limit; i++) expect(guard.canActivate(c.ctx)).toBe(true);
      expect(() => guard.canActivate(c.ctx)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
      expect(c.setHeader).toHaveBeenLastCalledWith('Retry-After', '60');
      const other = context(json, { user: { id: 'another-user' } }); expect(guard.canActivate(other.ctx)).toBe(true);
      jest.advanceTimersByTime(60000); expect(guard.canActivate(c.ctx)).toBe(true);
    });
  it('bounds identity-map capacity and evicts expired entries, never silently dropping an active budget', () => {
    const guard = new ProcessingRetryGuard();
    for (let i = 0; i < 4096; i++) guard.canActivate(context(true, { user: { id: String(i) } }).ctx);
    const extra = context(true, { user: { id: 'extra' } });
    expect(() => guard.canActivate(extra.ctx)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' })); expect(extra.setHeader).toHaveBeenCalled();
    jest.advanceTimersByTime(60000); expect(guard.canActivate(extra.ctx)).toBe(true);
  });
  it('does not share retry/status/URL budgets', () => {
    const limited = new ProcessingRetryGuard(); for (let i = 0; i < 10; i++) limited.canActivate(context().ctx);
    expect(() => limited.canActivate(context().ctx)).toThrow();
    expect(new ProcessingStatusGuard().canActivate(context().ctx)).toBe(true); expect(new ThumbnailUrlGuard().canActivate(context(false).ctx)).toBe(true);
  });
  it.each([ProcessingStatusGuard, ProcessingRetryGuard])('requires JSON content type and rejects unknown query for %p', Guard => {
    expect(() => new Guard().canActivate(context(true, { headers: {} }).ctx)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));
    expect(() => new Guard().canActivate(context(true, { query: { version: '2' } }).ctx)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(new Guard().canActivate(context(true, { headers: { 'content-type': 'application/json; charset=UTF-8' } }).ctx)).toBe(true);
  });
  it.each([{ query: { key: 'private' } }, { body: {} }, { headers: { 'content-length': '1' } }, { headers: { 'transfer-encoding': 'chunked' } }])(
    'rejects URL query/body/transfer claims %#', patch => { expect(() => new ThumbnailUrlGuard().canActivate(context(false, patch).ctx)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' })); });
});

describe('Processing controller auth, response and route wiring', () => {
  it('has explicit Origin+session guards for both POSTs and session for GET, no-store for every endpoint', () => {
    const proto = ProcessingController.prototype;
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.status)).toEqual([OriginGuard, SessionGuard, ProcessingStatusGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.retry)).toEqual([OriginGuard, SessionGuard, ProcessingRetryGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.thumbnailUrl)).toEqual([SessionGuard, ThumbnailUrlGuard]);
    for (const method of [proto.status, proto.retry, proto.thumbnailUrl]) expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto.status)).toBe(200);
    expect(Reflect.getMetadata(PATH_METADATA, proto.status)).toBe('processing/status');
    expect(Reflect.getMetadata(PATH_METADATA, proto.thumbnailUrl)).toBe(':fileId/thumbnail-url');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.thumbnailUrl)).toBe(0); // Nest GET
  });
  it('missing session never establishes an authenticated processing principal', async () => {
    const currentUser = jest.fn(); const sessions = { subject: () => { throw new ApiError('AUTH_REQUIRED'); } };
    const guard = new SessionGuard(sessions as never, { currentUser } as never);
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' }); expect(currentUser).not.toHaveBeenCalled();
  });
  it.each([false, true])('returns replay200 or winner202 using the service CAS outcome=%s', async changed => {
    const body = { fileId: id, processorKey: 'thumbnail', processorVersion: '1.0.0', state: 'QUEUED', retryRevision: 1 };
    const service = { retry: jest.fn().mockResolvedValue({ changed, body }) }; const controller = new ProcessingController(service as unknown as ProcessingApiService);
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.retry({ user: { id: owner } } as never, id, { expectedRetryRevision: 0 }, response as never);
    expect(service.retry).toHaveBeenCalledWith(owner, id, 0); expect(response.status).toHaveBeenCalledWith(changed ? 202 : 200); expect(response.json).toHaveBeenCalledWith(body);
  });
  it('passes authenticated identity and validated parameters, not body-selected ownership', async () => {
    const service = { status: jest.fn().mockResolvedValue({ items: [] }), thumbnailUrl: jest.fn().mockResolvedValue({}) };
    const controller = new ProcessingController(service as unknown as ProcessingApiService); const request = { user: { id: owner } } as never;
    await controller.status(request, { fileIds: [id] }); await controller.thumbnailUrl(request, id);
    expect(service.status).toHaveBeenCalledWith(owner, [id]); expect(service.thumbnailUrl).toHaveBeenCalledWith(owner, id);
    expect(Reflect.getMetadata('controllers', FilesModule)).toContain(ProcessingController);
    expect(Reflect.getMetadata('providers', FilesModule)).toContain(ProcessingApiService);
  });
});
