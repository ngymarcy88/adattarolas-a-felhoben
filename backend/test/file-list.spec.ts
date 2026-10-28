import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, type ArgumentsHost, type ExecutionContext, Logger } from '@nestjs/common';
import { ApiError } from '../src/common/errors/api-error';
import { HttpExceptionFilter } from '../src/common/errors/http-exception.filter';
import { SessionGuard } from '../src/auth/session.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { FileListQuery, FileListQueryPipe, decodeFileCursor, encodeFileCursor } from '../src/files/file-list.query';
import { FileListService } from '../src/files/file-list.service';
import { FileListGuard } from '../src/files/file-list.guard';
import { FilesController } from '../src/files/files.controller';
import { FilesModule } from '../src/files/files.module';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = new Date('2026-10-27T12:00:00.123Z');
const token = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url');
const valid = { v: 1, scope: 'active-images-v1', createdAt: time.toISOString(), id: id(3) };
const pipe = new FileListQueryPipe();
const fail = (fn: () => unknown, code: string) => { try { fn(); throw new Error('Expected rejection'); } catch (error) { expect(error).toBeInstanceOf(ApiError); expect((error as ApiError).code).toBe(code); } };

describe('File list query and cursor validation', () => {
  it('defaults to twenty and round-trips a private-data-free millisecond position', () => {
    expect(pipe.transform({})).toEqual(new FileListQuery(20));
    const cursor = encodeFileCursor({ createdAt: time, id: id(3) });
    expect(decodeFileCursor(cursor)).toEqual({ createdAt: time, id: id(3) });
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).toEqual(valid);
    expect(pipe.transform({ limit: '1', cursor })).toEqual(new FileListQuery(1, { createdAt: time, id: id(3) }));
    expect(pipe.transform({ limit: '100' }).limit).toBe(100);
  });
  it.each([undefined, null, [], 'limit=2', { ownerId: other }, { page: '1' }, { offset: '0' }, { mimeType: 'video/mp4' }, { status: 'ACTIVE' }, { limit: '1', unknown: 'x' }])('rejects non-contract query %#', input => fail(() => pipe.transform(input), 'VALIDATION_ERROR'));
  it.each(['', '0', '101', '-1', '+1', '01', '020', '1.0', '1e1', ' 1', '1 ', '1\n', '1\r\n', 'Infinity', 1, null, undefined, [], ['1', '2'], {}])('rejects non-canonical limit %#', limit => fail(() => pipe.transform({ limit }), 'VALIDATION_ERROR'));
  it.each(['', '=', 'abc=', 'a', 'abc!', 'a'.repeat(513), 1, null, undefined, [], ['x', 'x'], {}])('rejects invalid token envelope %#', cursor => fail(() => pipe.transform({ cursor }), 'CURSOR_INVALID'));
  it.each([null, [], {}, 'text', { ...valid, v: '1' }, { ...valid, v: 2 }, { ...valid, scope: 'trash' },
    { ...valid, ownerId: other }, { ...valid, id: id(3).toUpperCase().replace('10000000', 'ABCDEF00') },
    { ...valid, id: id(3) + '\n' }, { ...valid, id: '../key' }, { ...valid, id: 3 },
    { ...valid, createdAt: '2026-02-30T12:00:00.123Z' }, { ...valid, createdAt: '2026-10-27T12:00:00Z' },
    { ...valid, createdAt: '2026-10-27T14:00:00.123+02:00' }, { ...valid, createdAt: '0000-01-01T00:00:00.000Z' },
    { ...valid, createdAt: '+010000-01-01T00:00:00.000Z' }, { ...valid, createdAt: null }])('rejects invalid token payload %#', data => fail(() => decodeFileCursor(token(data)), 'CURSOR_INVALID'));
  it('rejects invalid UTF-8, bad JSON, padding, whitespace, noncanonical pad bits and missing fields', () => {
    for (const cursor of [Buffer.from([255, 254]).toString('base64url'), Buffer.from('{').toString('base64url'), token(valid) + '=', token(valid) + '\n', 'e31', token({ v: 1, scope: valid.scope, id: valid.id })]) {
      fail(() => decodeFileCursor(cursor), 'CURSOR_INVALID');
    }
  });
  it('allows valid position edits without treating a cursor as authorization', () => {
    expect(decodeFileCursor(token({ ...valid, id: id(9) })).id).toBe(id(9));
  });
});

const row = (n: number, changes: Record<string, unknown> = {}) => ({ id: id(n), ownerId: owner, originalName: 'photo.jpg', mimeType: 'image/jpeg',
  detectedMimeType: 'image/jpeg' as string | null, status: 'ACTIVE', sizeBytes: 17n, createdAt: time,
  storageKey: 'private-key', upload: { url: 'private-url' }, ...changes });
type Row = ReturnType<typeof row>;
function fixture(rows: Row[] = [], allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']) {
  const field = { name: 'mimeType' };
  // Small deterministic query double, not SQL/Prisma integration evidence.
  const findMany = jest.fn().mockImplementation(async ({ where, orderBy, take, select }) => {
    expect(where.detectedMimeType).toEqual({ equals: field }); expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    return rows.filter(r => r.ownerId === where.ownerId && r.status === where.status && where.mimeType.in.includes(r.mimeType) && r.detectedMimeType === r.mimeType)
      .filter(r => !where.OR || r.createdAt < where.OR[0].createdAt.lt || (+r.createdAt === +where.OR[1].createdAt && r.id < where.OR[1].id.lt))
      .sort((a, b) => +b.createdAt - +a.createdAt || (a.id < b.id ? 1 : a.id === b.id ? 0 : -1)).slice(0, take)
      .map(r => Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, r[key as keyof Row]])));
  });
  const db = { fileObject: { findMany, fields: { mimeType: field } } };
  const config = { getOrThrow: () => ({ allowedMimeTypes: allowed }) };
  return { rows, findMany, service: new FileListService(db as unknown as PrismaService, config as unknown as ConfigService) };
}
describe('Own active image list', () => {
  it('filters owner/status/image/confirmed type in the DB, not after pagination', async () => {
    const { service, findMany } = fixture([row(1), row(2, { ownerId: other }), row(3, { status: 'PENDING_UPLOAD' }), row(4, { status: 'SOFT_DELETED' }),
      row(5, { mimeType: 'video/mp4', detectedMimeType: 'video/mp4' }), row(6, { detectedMimeType: null }), row(7, { detectedMimeType: 'image/png' }),
      row(8, { mimeType: 'image/png', detectedMimeType: 'image/png' })]);
    const result = await service.list(owner, new FileListQuery(1));
    expect(result.items.map(r => r.id)).toEqual([id(8)]); expect(result.hasNextPage).toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: owner, status: 'ACTIVE',
      mimeType: { in: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] }, detectedMimeType: { equals: { name: 'mimeType' } } }, take: 2 }));
  });
  it('intersects the configured allowlist and never includes videos or unknown content', async () => {
    const { service, findMany } = fixture([row(1), row(2, { mimeType: 'image/png', detectedMimeType: 'image/png' })], ['image/png', 'video/mp4']);
    expect((await service.list(owner, new FileListQuery(20))).items.map(r => r.id)).toEqual([id(2)]);
    expect(findMany.mock.calls[0][0].where.mimeType.in).toEqual(['image/png']);
    expect((await fixture([row(1)], ['video/mp4']).service.list(owner, new FileListQuery(20))).items).toEqual([]);
  });
  it('returns only seven whitelisted fields, numeric bytes and ISO UTC time', async () => {
    const { service, findMany } = fixture([row(1)]); const result = await service.list(owner, new FileListQuery(20));
    expect(result).toEqual({ items: [{ id: id(1), originalName: 'photo.jpg', mimeType: 'image/jpeg', detectedMimeType: 'image/jpeg', sizeBytes: 17, status: 'ACTIVE', createdAt: time.toISOString() }], nextCursor: null, hasNextPage: false });
    expect(Object.keys(findMany.mock.calls[0][0].select).sort()).toEqual(['id', 'originalName', 'mimeType', 'detectedMimeType', 'sizeBytes', 'status', 'createdAt'].sort());
    expect(JSON.stringify(result)).not.toMatch(/ownerId|storageKey|private-|upload|quota|receipt/);
  });
  it.each([1, 20, 100])('walks a static collection without gaps/duplicates with limit %i and tied timestamps', async limit => {
    const rows = Array.from({ length: 105 }, (_, i) => row(i + 1, { createdAt: new Date(+time - Math.floor(i / 25) * 1000) }));
    const { service } = fixture(rows); const expected = [...rows].sort((a, b) => +b.createdAt - +a.createdAt || (a.id < b.id ? 1 : -1)).map(r => r.id);
    const seen: string[] = []; let cursor;
    do {
      const page = await service.list(owner, new FileListQuery(limit, cursor)); seen.push(...page.items.map(r => r.id));
      cursor = page.nextCursor ? decodeFileCursor(page.nextCursor) : undefined;
      expect(page.hasNextPage).toBe(cursor !== undefined);
      if (cursor) expect(cursor.id).toBe(page.items.at(-1)!.id);
    } while (cursor);
    expect(seen).toEqual(expected); expect(new Set(seen).size).toBe(105);
  });
  it('does not spread private fields even if the database double returns more than selected', async () => {
    const { service, findMany } = fixture(); findMany.mockResolvedValueOnce([row(1)]);
    const result = await service.list(owner, new FileListQuery(20));
    expect(Object.keys(result.items[0])).toHaveLength(7); expect(JSON.stringify(result)).not.toMatch(/ownerId|storageKey|private-|upload/);
  });
  it('uses the last returned row, not lookahead; supports changed limit and a deleted anchor', async () => {
    const { service, rows } = fixture([row(1), row(2), row(3), row(4)]);
    const first = await service.list(owner, new FileListQuery(2)); const cursor = decodeFileCursor(first.nextCursor!);
    expect(cursor.id).toBe(id(3)); rows.splice(rows.findIndex(r => r.id === id(3)), 1);
    const next = await service.list(owner, new FileListQuery(1, cursor)); expect(next.items.map(r => r.id)).toEqual([id(2)]);
    expect(decodeFileCursor(next.nextCursor!).id).toBe(id(2));
  });
  it('preserves owner scope even with another user cursor and an arbitrary valid position', async () => {
    const { service, findMany } = fixture([row(1), row(2, { ownerId: other }), row(3, { ownerId: other })]);
    const foreignPage = await service.list(other, new FileListQuery(1));
    const result = await service.list(owner, new FileListQuery(20, decodeFileCursor(foreignPage.nextCursor!)));
    expect(result.items.map(r => r.id)).toEqual([id(1)]); expect(findMany.mock.calls[1][0].where.ownerId).toBe(owner);
  });
  it('returns an empty success for an empty first or beyond-end page; exact limit has no next cursor', async () => {
    expect(await fixture().service.list(owner, new FileListQuery(20))).toEqual({ items: [], nextCursor: null, hasNextPage: false });
    const { service } = fixture([row(1)]);
    expect((await service.list(owner, new FileListQuery(1))).nextCursor).toBeNull();
    expect(await service.list(owner, new FileListQuery(20, { createdAt: new Date(+time - 1), id: id(1) }))).toEqual({ items: [], nextCursor: null, hasNextPage: false });
  });
  it('maps a DB failure to a safe error instead of empty data, and cannot depend on storage', async () => {
    const { service, findMany } = fixture(); findMany.mockRejectedValue(new Error('postgresql://private secret-key'));
    await expect(service.list(owner, new FileListQuery(20))).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    const error = await service.list(owner, new FileListQuery(20)).catch(e => e); expect(error.message).not.toContain('private');
  });
  it.each([0n, -1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])('does not silently round invalid stored bytes %s', async sizeBytes => {
    await expect(fixture([row(1, { sizeBytes })]).service.list(owner, new FileListQuery(20))).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });
});

function guardContext(user = owner) {
  const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = { switchToHttp: () => ({ getRequest: () => ({ user: { id: user }, requestId: 'list-test' }), getResponse: () => response }) };
  return { response, host: host as unknown as ExecutionContext };
}
describe('File list guard, controller and error boundary', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  it('uses the authenticated user only; GET has no unsafe OriginGuard and is no-store', async () => {
    const service = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null, hasNextPage: false }) };
    const controller = new FilesController(undefined as never, undefined as never, service as unknown as FileListService, undefined as never);
    const query = new FileListQuery(20); const result = await controller.list({ user: { id: owner }, query: { ownerId: other } } as never, query);
    expect(service.list).toHaveBeenCalledWith(owner, query); expect(result.items).toEqual([]);
    expect(Reflect.getMetadata(GUARDS_METADATA, controller.list)).toEqual([SessionGuard, FileListGuard]);
    expect(Reflect.getMetadata(HEADERS_METADATA, controller.list)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    expect(Reflect.getMetadata(METHOD_METADATA, controller.list)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, controller.list)).toBe('/');
    const providers = Reflect.getMetadata('providers', FilesModule); expect(providers).toEqual(expect.arrayContaining([FileListService, FileListGuard, FileListQueryPipe]));
  });
  it('allows sixty per-user requests, rounds retry seconds up and resets at the exact boundary', () => {
    jest.useFakeTimers(); jest.setSystemTime(time); const guard = new FileListGuard(); const { host, response } = guardContext();
    for (let i = 0; i < 60; i++) expect(guard.canActivate(host)).toBe(true);
    fail(() => guard.canActivate(host), 'RATE_LIMITED'); expect(response.setHeader).toHaveBeenLastCalledWith('Retry-After', '60');
    jest.setSystemTime(+time + 59_001); fail(() => guard.canActivate(host), 'RATE_LIMITED'); expect(response.setHeader).toHaveBeenLastCalledWith('Retry-After', '1');
    expect(guard.canActivate(guardContext(other).host)).toBe(true);
    jest.setSystemTime(+time + 60_000); expect(guard.canActivate(host)).toBe(true);
  });
  it('bounds distinct-user state and reclaims expired windows', () => {
    jest.useFakeTimers(); jest.setSystemTime(time); const guard = new FileListGuard();
    for (let i = 1; i <= 4096; i++) guard.canActivate(guardContext(id(i)).host);
    fail(() => guard.canActivate(guardContext(id(4097)).host), 'RATE_LIMITED');
    jest.setSystemTime(+time + 60_000); expect(guard.canActivate(guardContext(id(4097)).host)).toBe(true);
  });
  it.each(['CURSOR_INVALID', 'DATABASE_UNAVAILABLE', 'RATE_LIMITED'] as const)('serializes %s safely and preserves Retry-After', code => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, response } = guardContext(); response.setHeader('Retry-After', '12');
    new HttpExceptionFilter().catch(new ApiError(code), host as unknown as ArgumentsHost);
    expect(response.json).toHaveBeenCalledWith({ error: { code, message: expect.any(String), details: {}, requestId: 'list-test' } });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader.mock.calls).toContainEqual(['Retry-After', '12']);
  });
});
