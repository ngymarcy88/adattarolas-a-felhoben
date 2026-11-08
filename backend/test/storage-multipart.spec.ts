import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, ListPartsCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateEnvironment } from '../src/config/environment';
import { S3StorageAdapter } from '../src/storage/s3-storage.adapter';
import { MultipartMutationError } from '../src/storage/storage-error';
import { originalStorageKey } from '../src/storage/storage-key';
import type { MultipartPartReceipt } from '../src/storage/storage.interface';

const now = new Date('2026-11-02T10:00:00Z');
const id = 'abcdef00-0000-4000-8000-000000000001';
const key = originalStorageKey(id, id);
const mib = 1024 * 1024;
const session = { key, uploadId: 'synthetic-upload/opaque+id=', sizeBytes: 10 * mib + 1, partSizeBytes: 5 * mib };
const initial = { key, transferId: id, mimeType: 'image/png', sizeBytes: session.sizeBytes, partSizeBytes: session.partSizeBytes };
const parts: MultipartPartReceipt[] = [1, 2, 3].map(n => ({ partNumber: n, sizeBytes: n === 3 ? 1 : 5 * mib, etag: `"opaque-${n}"` }));
const config = validateEnvironment({ DATABASE_URL: 'postgresql://unit:unit@localhost/db',
  JWT_SECRET: 'unit-test-only-with-at-least-32-characters', FRONTEND_PUBLIC_URL: 'http://localhost:5173',
  BACKEND_PUBLIC_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1', S3_BUCKET: 'unit-bucket', S3_ACCESS_KEY_ID: 'unit-access', S3_SECRET_ACCESS_KEY: 'unit-secret' });
function fixture(ttl = config.presignedUrlTtlSeconds) {
  const read = jest.fn(); const write = jest.fn();
  const client = { send: read, destroy: jest.fn() } as unknown as S3Client;
  const writeClient = { send: write, destroy: jest.fn() } as unknown as S3Client;
  const sign = jest.fn().mockResolvedValue('https://storage.invalid/synthetic') as jest.MockedFunction<typeof getSignedUrl>;
  const adapter = new S3StorageAdapter({ ...config, presignedUrlTtlSeconds: ttl }, { client, writeClient, signingClient: client, sign, now: () => now });
  return { adapter, read, write, sign };
}
const identity = { Bucket: config.storage.bucket, Key: key, UploadId: session.uploadId, $metadata: { httpStatusCode: 200 } };
const page = (items: MultipartPartReceipt[] = [], truncated = false, next?: string) => ({ ...identity, IsTruncated: truncated,
  Parts: items.map(p => ({ PartNumber: p.partNumber, Size: p.sizeBytes, ETag: p.etag })), NextPartNumberMarker: next });
const created = () => ({ ...identity });
const completed = () => ({ ...identity, ETag: '"not-a-full-file-hash-3"', VersionId: 'opaque-version' });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const mutations = ['create', 'complete', 'abort'] as const;
function mutate(f: ReturnType<typeof fixture>, kind: typeof mutations[number], signal?: AbortSignal) {
  if (kind === 'create') return f.adapter.initiateMultipart({ ...initial, signal });
  if (kind === 'complete') return f.adapter.completeMultipart({ ...session, parts, signal });
  return f.adapter.abortMultipart({ ...session, signal });
}

describe('multipart authority and limits', () => {
  it('creates an image session with server identity, not a client filename/key', async () => {
    const f = fixture(); f.write.mockResolvedValue(created());
    await expect(f.adapter.initiateMultipart(initial)).resolves.toEqual({ uploadId: session.uploadId });
    expect(f.write.mock.calls[0][0]).toBeInstanceOf(CreateMultipartUploadCommand);
    expect(f.write.mock.calls[0][0].input).toEqual({ Bucket: config.storage.bucket, Key: key, ContentType: 'image/png', CacheControl: 'no-store',
      Metadata: { 'cloudvault-transfer-id': id, 'cloudvault-size-bytes': String(session.sizeBytes), 'cloudvault-part-size-bytes': String(5 * mib) } });
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each([
    { key: key + '\n' }, { key: '../original.png' }, { key: `derived/${id}/${id}/${id}/${id}.webp` },
    { sizeBytes: 0 }, { sizeBytes: 100 * mib + 1 }, { sizeBytes: NaN }, { sizeBytes: 1.5 },
    { partSizeBytes: 5 * mib - 1 }, { partSizeBytes: 17 * mib }, { partSizeBytes: 5 * mib + 1 },
    { mimeType: 'image/svg+xml' }, { mimeType: 'video/mp4' }, { transferId: id + '\n' },
  ])('rejects invalid create input before any SDK call %#', async patch => {
    const f = fixture();
    await expect(f.adapter.initiateMultipart({ ...initial, ...patch })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.write).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled();
  });
  it('honors a smaller configured file cap', async () => {
    const adapter = new S3StorageAdapter({ ...config, maxUploadBytes: 1 });
    try { await expect(adapter.initiateMultipart(initial)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' }); }
    finally { adapter.onModuleDestroy(); }
  });
  it.each([1, 100 * mib])('accepts boundary size %s', async sizeBytes => {
    const f = fixture(); f.write.mockResolvedValue(created());
    await expect(f.adapter.initiateMultipart({ ...initial, sizeBytes })).resolves.toBeDefined();
  });
  it.each([{ ...created(), UploadId: undefined }, { ...created(), UploadId: '' }, { ...created(), UploadId: 'bad\n' },
    { ...created(), Bucket: 'foreign' }, { ...created(), Key: 'foreign' }, { ...created(), $metadata: { httpStatusCode: 201 } }])('bad create success remains unknown, with no compensating delete %#', async result => {
    const f = fixture(); f.write.mockResolvedValue(result);
    await expect(f.adapter.initiateMultipart(initial)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', outcome: 'unknown' });
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.read).not.toHaveBeenCalled();
  });
  it('does not pretend explicit repeated create is idempotent; caller must persist/guard the intent', async () => {
    const f = fixture(); f.write.mockResolvedValueOnce(created()).mockResolvedValueOnce({ ...created(), UploadId: 'another-explicit-session' });
    const first = await f.adapter.initiateMultipart(initial); const second = await f.adapter.initiateMultipart(initial);
    expect(first.uploadId).not.toBe(second.uploadId); expect(f.write).toHaveBeenCalledTimes(2);
  });
  it('uses a one-attempt write client (no hidden create/complete/abort retry)', async () => {
    const adapter = new S3StorageAdapter(config);
    try { await expect((adapter as unknown as { writeClient: S3Client }).writeClient.config.maxAttempts()).resolves.toBe(1); }
    finally { adapter.onModuleDestroy(); }
  });
});

describe('short-lived exact part grants', () => {
  it('signs the last exact byte with browser-generated Content-Length', async () => {
    const f = fixture();
    const result = await f.adapter.createMultipartPartAccess({ ...session, partNumber: 3, expiresAt: new Date(+now + 120000) });
    expect(result).toMatchObject({ method: 'PUT', partNumber: 3, sizeBytes: 1, headers: {}, expiresAt: new Date(+now + 120000) });
    const [_, command, options] = f.sign.mock.calls[0];
    expect(command).toBeInstanceOf(UploadPartCommand);
    expect(command.input).toEqual({ Bucket: config.storage.bucket, Key: key, UploadId: session.uploadId, PartNumber: 3, ContentLength: 1 });
    expect(options).toMatchObject({ expiresIn: 120, signableHeaders: new Set(['content-length']) });
    expect(f.write).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it('the real local presigner binds length, identity and part number without network access', async () => {
    const adapter = new S3StorageAdapter(config, { now: () => now });
    try {
      const access = await adapter.createMultipartPartAccess({ ...session, partNumber: 1, expiresAt: new Date(+now + 120000) });
      const url = new URL(access.url);
      expect(url.origin).toBe(config.storage.publicEndpoint);
      expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain('content-length');
      expect(url.searchParams.get('partNumber')).toBe('1'); expect(url.searchParams.get('uploadId')).toBe(session.uploadId);
    } finally { adapter.onModuleDestroy(); }
  });
  it.each([0, -1, 4, 1.5, NaN])('rejects part number %s', async partNumber => {
    const f = fixture();
    await expect(f.adapter.createMultipartPartAccess({ ...session, partNumber, expiresAt: new Date(+now + 120000) })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.sign).not.toHaveBeenCalled();
  });
  it.each(['', 'with space', 'id\n', 'x'.repeat(2049)])('rejects malformed opaque upload identity %#', async uploadId => {
    const f = fixture(); await expect(f.adapter.abortMultipart({ key, uploadId })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it.each([0, -1, 301000, NaN])('rejects expired/overlong/nonfinite TTL %s', async millis => {
    const f = fixture(600);
    await expect(f.adapter.createMultipartPartAccess({ ...session, partNumber: 1, expiresAt: new Date(+now + millis) })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('rejects an already expired grant returned by a delayed signer', async () => {
    let clock = now; const f = fixture();
    const adapter = new S3StorageAdapter(config, { sign: f.sign, now: () => clock });
    try {
      f.sign.mockImplementationOnce(async () => { clock = new Date(+now + 121000); return 'https://storage.invalid/synthetic'; });
      await expect(adapter.createMultipartPartAccess({ ...session, partNumber: 1, expiresAt: new Date(+now + 120000) })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    } finally { adapter.onModuleDestroy(); }
  });
});

describe('authoritative bounded paged part listing', () => {
  it('follows string markers and returns complete observed receipts including holes', async () => {
    const f = fixture(); f.read.mockResolvedValueOnce(page([parts[0]], true, '1')).mockResolvedValueOnce(page([parts[2]]));
    await expect(f.adapter.listMultipartParts(session)).resolves.toEqual([parts[0], parts[2]]);
    expect(f.read.mock.calls[0][0]).toBeInstanceOf(ListPartsCommand);
    expect(f.read.mock.calls[1][0].input).toMatchObject({ PartNumberMarker: '1', MaxParts: 3, Key: key, UploadId: session.uploadId });
    expect(f.write).not.toHaveBeenCalled();
  });
  it('allows an empty finished list, not a completed upload claim', async () => {
    const f = fixture(); f.read.mockResolvedValue(page());
    expect(await f.adapter.listMultipartParts(session)).toEqual([]); expect(f.adapter.writeClosureEvidence).toBe('unproven');
  });
  it.each([
    page([parts[0]], true), page([], true, '1'), page([parts[0]], true, '2'),
    { ...page(), IsTruncated: undefined }, { ...page(), UploadId: 'foreign' }, { ...page(), Key: 'foreign' },
    { ...page(), Bucket: 'foreign' }, { ...page(), Parts: {} }, { ...page(), $metadata: { httpStatusCode: 206 } },
    page([parts[1], parts[0]]), page([parts[0], parts[0]]), page([{ ...parts[0], etag: 'unquoted' }]),
  ])('rejects malformed/non-progressing/inconsistent listing %#', async response => {
    const f = fixture(); f.read.mockResolvedValue(response);
    await expect(f.adapter.listMultipartParts(session)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it.each([[{ ...parts[2], sizeBytes: 2 }], [{ ...parts[2], partNumber: 4 }]].map(items => ({ items })))('rejects unauthorized storage geometry %#', async ({ items }) => {
    const f = fixture(); f.read.mockResolvedValue(page(items));
    await expect(f.adapter.listMultipartParts(session)).rejects.toMatchObject({ code: 'PARTS_INVALID' });
  });
  it('rejects a repeated part across pages without returning partial data', async () => {
    const f = fixture(); f.read.mockResolvedValueOnce(page([parts[0]], true, '1')).mockResolvedValueOnce(page([parts[0]]));
    await expect(f.adapter.listMultipartParts(session)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it.each([['NoSuchUpload', 'UPLOAD_NOT_FOUND'], ['NoSuchBucket', 'UNAVAILABLE'], ['NotFound', 'UNAVAILABLE']])('maps missing %s without claiming object absence', async (name, code) => {
    const f = fixture(); f.read.mockRejectedValue({ name, $metadata: { httpStatusCode: 404 } });
    await expect(f.adapter.listMultipartParts(session)).rejects.toMatchObject({ code });
  });
});

describe('immutable create-only complete and conservative abort', () => {
  it('copies the exact ordered manifest and returns opaque identity, never a SHA', async () => {
    const f = fixture(); let resolve!: (r: unknown) => void; f.write.mockReturnValue(new Promise(r => { resolve = r; }));
    const mutable = parts.map(p => ({ ...p }));
    const pending = f.adapter.completeMultipart({ ...session, parts: mutable }); mutable[0].etag = '"changed"'; mutable.reverse();
    expect(f.write.mock.calls[0][0]).toBeInstanceOf(CompleteMultipartUploadCommand);
    expect(f.write.mock.calls[0][0].input).toEqual({ Bucket: config.storage.bucket, Key: key, UploadId: session.uploadId, IfNoneMatch: '*',
      MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) } });
    resolve(completed());
    await expect(pending).resolves.toEqual({ etag: completed().ETag, versionId: 'opaque-version' });
    expect(f.write).toHaveBeenCalledTimes(1);
  });
  it.each([[], parts.slice(0, 2), [parts[1], parts[0], parts[2]], [parts[0], parts[0], parts[2]],
    parts.map((p, i) => i === 2 ? { ...p, sizeBytes: 2 } : p), parts.map((p, i) => i === 1 ? { ...p, etag: '"bad\n"' } : p)].map(manifest => ({ manifest })))('rejects invalid manifest before dispatch %#', async ({ manifest }) => {
    const f = fixture();
    await expect(f.adapter.completeMultipart({ ...session, parts: manifest })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it.each([{ ...completed(), ETag: undefined }, { ...completed(), Key: 'foreign' }, { ...completed(), Bucket: 'foreign' },
    { ...completed(), Error: { Code: 'InternalError' } }, { ...completed(), VersionId: 'bad\n' }])('malformed complete success remains unknown %#', async result => {
    const f = fixture(); f.write.mockResolvedValue(result);
    await expect(f.adapter.completeMultipart({ ...session, parts })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', outcome: 'unknown' });
  });
  it('abort ACK never returns positive write-closure evidence', async () => {
    const f = fixture(); f.write.mockResolvedValue({ $metadata: { httpStatusCode: 204 } });
    await expect(f.adapter.abortMultipart(session)).resolves.toEqual({ writeClosureEvidence: 'unproven' });
    expect(f.write.mock.calls[0][0]).toBeInstanceOf(AbortMultipartUploadCommand);
    expect(f.adapter.writeClosureEvidence).toBe('unproven'); expect(f.read).not.toHaveBeenCalled();
  });
  it.each([
    ['PreconditionFailed', 412, 'OBJECT_EXISTS'], ['ConditionalRequestConflict', 409, 'WRITE_CONFLICT'],
    ['InvalidPart', 400, 'PARTS_INVALID'], ['InvalidPartOrder', 400, 'PARTS_INVALID'], ['EntityTooSmall', 400, 'PARTS_INVALID'],
    ['NoSuchUpload', 404, 'UPLOAD_NOT_FOUND'], ['InternalError', 200, 'UNAVAILABLE'], ['AccessDenied', 403, 'UNAVAILABLE'],
  ])('maps %s without provider details, retry, delete or accounting', async (name, status, code) => {
    const f = fixture(); f.write.mockRejectedValue({ name, $metadata: { httpStatusCode: status }, message: 'private-provider-url-and-credential' });
    const error = await f.adapter.completeMultipart({ ...session, parts }).catch(e => e);
    expect(error).toBeInstanceOf(MultipartMutationError);
    expect(error).toMatchObject({ code, outcome: 'unknown', message: 'Object storage operation failed.' });
    expect(JSON.stringify(error)).not.toContain('private-provider'); expect(error).not.toHaveProperty('cause');
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['complete', 'abort'] as const)('repeated %s never starts a replacement upload or infers closure from NoSuchUpload', async kind => {
    const f = fixture(); f.write.mockResolvedValueOnce(kind === 'complete' ? completed() : { $metadata: { httpStatusCode: 204 } })
      .mockRejectedValueOnce({ name: 'NoSuchUpload', $metadata: { httpStatusCode: 404 } });
    await mutate(f, kind);
    await expect(mutate(f, kind)).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', outcome: 'unknown' });
    expect(f.write).toHaveBeenCalledTimes(2); expect(f.read).not.toHaveBeenCalled(); expect(f.adapter.writeClosureEvidence).toBe('unproven');
  });
});

describe('one whole-operation deadline and cancellation', () => {
  it.each(mutations)('pre-aborted %s never dispatches', async kind => {
    const f = fixture(); const controller = new AbortController(); controller.abort();
    await expect(mutate(f, kind, controller.signal)).rejects.toMatchObject({ code: 'UNAVAILABLE', outcome: 'not-started' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it.each(mutations)('abort after %s dispatch discards a late successful response', async kind => {
    const f = fixture(); const controller = new AbortController(); let resolve!: (r: unknown) => void;
    f.write.mockReturnValue(new Promise(r => { resolve = r; }));
    const pending = mutate(f, kind, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE', outcome: 'unknown' });
    controller.abort(); await assertion;
    expect(f.write.mock.calls[0][1].abortSignal.aborted).toBe(true);
    resolve(kind === 'create' ? created() : kind === 'complete' ? completed() : { $metadata: { httpStatusCode: 204 } }); await flush();
    expect(f.write).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'complete', 'abort', 'sign', 'list'] as const)('times out non-cooperative %s within the shared 10s deadline', async kind => {
    jest.useFakeTimers();
    try {
      const f = fixture(); f.write.mockReturnValue(new Promise(() => {})); f.read.mockReturnValue(new Promise(() => {})); f.sign.mockReturnValue(new Promise(() => {}));
      const pending = kind === 'sign' ? f.adapter.createMultipartPartAccess({ ...session, partNumber: 1, expiresAt: new Date(+now + 120000) })
        : kind === 'list' ? f.adapter.listMultipartParts(session) : mutate(f, kind);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE', ...(['create', 'complete', 'abort'].includes(kind) ? { outcome: 'unknown' } : {}) });
      await jest.advanceTimersByTimeAsync(10000); await assertion;
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
  it('pagination does not restart the total deadline', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture(); f.read.mockImplementationOnce(() => new Promise(resolve => { setTimeout(() => resolve(page([parts[0]], true, '1')), 9000); }))
        .mockReturnValueOnce(new Promise(() => {}));
      const pending = f.adapter.listMultipartParts(session); const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await jest.advanceTimersByTimeAsync(9000); expect(f.read).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1000); await assertion;
    } finally { jest.useRealTimers(); }
  });
});
