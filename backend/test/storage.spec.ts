import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateEnvironment } from '../src/config/environment';
import { S3StorageAdapter } from '../src/storage/s3-storage.adapter';
import { StorageError, mapStorageError } from '../src/storage/storage-error';
import { originalStorageKey } from '../src/storage/storage-key';

const owner = '00000000-0000-4000-8000-000000000001';
const file = '00000000-0000-4000-8000-000000000002';
const key = originalStorageKey(owner, file);
const now = new Date('2026-10-23T12:00:00.000Z');
const expiresAt = new Date(now.getTime() + 300_000);
const config = validateEnvironment({ DATABASE_URL: 'postgresql://unit:unit@localhost/db',
  JWT_SECRET: 'unit-test-only-with-at-least-32-characters', FRONTEND_PUBLIC_URL: 'http://localhost:5173',
  BACKEND_PUBLIC_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1', S3_BUCKET: 'unit-bucket', S3_ACCESS_KEY_ID: 'unit-access', S3_SECRET_ACCESS_KEY: 'unit-secret' });
const expected = { sizeBytes: 8, contentType: 'image/png', etag: '"opaque-version"' };
function fixture() {
  const send = jest.fn(); const destroy = jest.fn();
  const client = { send, destroy } as unknown as S3Client;
  const sign = jest.fn().mockResolvedValue('https://storage.invalid/synthetic-capability') as jest.MockedFunction<typeof getSignedUrl>;
  const adapter = new S3StorageAdapter(config, { client, signingClient: client, sign, now: () => now });
  return { adapter, send, destroy, sign };
}
const error = (name: string, status: number) => ({ name, $metadata: { httpStatusCode: status }, message: 'private credential/provider URL' });

describe('S3 storage adapter', () => {
  it('constructs opaque, owner-separated keys without using original filenames', () => {
    expect(key).toBe(`originals/${owner}/${file}`);
    expect(originalStorageKey(owner.toUpperCase(), file.toUpperCase())).toBe(key);
    expect(originalStorageKey(file, owner)).not.toBe(key);
    expect(() => originalStorageKey('../user', file)).toThrow(StorageError);
  });
  it.each(['../secret', '/bucket/object', 'originals/owner/file', key + '?x=1', key + '/extra'])('rejects unsafe keys before I/O: %s', async (value) => {
    const { adapter, send } = fixture();
    await expect(adapter.head(value)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' }); expect(send).not.toHaveBeenCalled();
  });
  it('signs an exact-size create-only image PUT without browser-forbidden Content-Length in returned headers', async () => {
    const { adapter, sign, send } = fixture();
    const result = await adapter.createUploadAccess({ key, mimeType: 'image/png', sizeBytes: 8, expiresAt });
    const [, command, options] = sign.mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: config.storage.bucket, Key: key, ContentType: 'image/png', ContentLength: 8, IfNoneMatch: '*' });
    expect(options).toMatchObject({ expiresIn: 300, signingDate: now });
    expect(options?.signableHeaders).toEqual(new Set(['content-type', 'content-length', 'if-none-match']));
    expect(result.headers).toEqual({ 'Content-Type': 'image/png', 'If-None-Match': '*' }); expect(send).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, 104857601])('rejects invalid upload size %s', async (sizeBytes) => {
    const { adapter, sign } = fixture();
    await expect(adapter.createUploadAccess({ key, mimeType: 'image/png', sizeBytes, expiresAt })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(sign).not.toHaveBeenCalled();
  });
  it.each(['image/svg+xml', 'text/html', 'video/mp4', 'image/png; charset=utf-8'])('rejects unsafe/out-of-slice MIME %s', async (mimeType) => {
    await expect(fixture().adapter.createUploadAccess({ key, mimeType, sizeBytes: 8, expiresAt })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
  it.each([new Date(now.getTime()), new Date(now.getTime() - 1), new Date(now.getTime() + 300001), new Date(NaN)])
    ('rejects expired, invalid or overlong absolute deadlines %#', async (deadline) => {
      await expect(fixture().adapter.createUploadAccess({ key, mimeType: 'image/png', sizeBytes: 8, expiresAt: deadline }))
        .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  it('never extends the requested deadline when rounding signing precision', async () => {
    const { adapter, sign } = fixture(); const deadline = new Date(now.getTime() + 101500);
    const result = await adapter.createUploadAccess({ key, mimeType: 'image/png', sizeBytes: 8, expiresAt: deadline });
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(deadline.getTime()); expect(sign.mock.calls[0][2]?.expiresIn).toBe(101);
  });
  it('generates real offline SigV4 with all required headers bound and the public hostname', async () => {
    const adapter = new S3StorageAdapter(config, { now: () => now });
    try {
      const result = await adapter.createUploadAccess({ key, mimeType: 'image/png', sizeBytes: 8, expiresAt });
      const url = new URL(result.url);
      expect(url.origin).toBe(config.storage.publicEndpoint); expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
      for (const header of ['content-length', 'content-type', 'host', 'if-none-match']) {
        expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(header);
      }
      expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    } finally { adapter.onModuleDestroy(); }
  });
  it('returns validated HEAD metadata and binds the configured bucket', async () => {
    const { adapter, send } = fixture(); send.mockResolvedValue({ ContentLength: 8, ContentType: 'image/png', ETag: expected.etag });
    expect(await adapter.head(key)).toEqual(expected); expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: config.storage.bucket, Key: key });
    expect(send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
  });
  it.each([error('NotFound', 404), error('NoSuchKey', 404)])('maps only explicit missing-object responses to null %#', async (failure) => {
    const { adapter, send } = fixture(); send.mockRejectedValueOnce(failure).mockResolvedValueOnce({}); expect(await adapter.head(key)).toBeNull();
    expect(send.mock.calls[1][0]).toBeInstanceOf(HeadBucketCommand);
  });
  it.each([error('AccessDenied', 403), error('NoSuchBucket', 404), error('InternalError', 500), new Error('secret'), { name: 'AbortError' }])
    ('does not treat denied/bucket/transport failure as absence %#', async (failure) => {
      const { adapter, send } = fixture(); send.mockRejectedValue(failure);
      await expect(adapter.head(key)).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'Object storage operation failed.' });
    });
  it.each([{ ContentLength: -1, ETag: '"ok"' }, { ContentLength: 8 }, { ContentLength: 8, ETag: 'bad\r\nheader' }, { ContentLength: 1.5, ETag: '"ok"' }])
    ('rejects malformed HEAD metadata %#', async (result) => {
      const { adapter, send } = fixture(); send.mockResolvedValue(result);
      await expect(adapter.head(key)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  function range(body: Readable = Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4])])) {
    return { Body: body, ContentLength: 4, ContentRange: 'bytes 0-3/8', ETag: expected.etag, $metadata: { httpStatusCode: 206 } };
  }
  it('reads only a bounded prefix with If-Match identity and destroys the stream', async () => {
    const { adapter, send } = fixture(); const result = range(); send.mockResolvedValue(result);
    expect(await adapter.readPrefix(key, expected, 4)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(send.mock.calls[0][0].input).toMatchObject({ Range: 'bytes=0-3', IfMatch: expected.etag }); expect(result.Body.destroyed).toBe(true);
  });
  it.each([0, -1, 65537, 1.5])('rejects unbounded/invalid prefix request %s', async (maxBytes) => {
    const { adapter, send } = fixture();
    await expect(adapter.readPrefix(key, expected, maxBytes)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' }); expect(send).not.toHaveBeenCalled();
  });
  it.each(['status', 'range', 'length', 'etag', 'oversize', 'truncated'])('rejects wrong/ignored/unbounded range responses: %s', async (kind) => {
    const { adapter, send } = fixture(); const response = range();
    if (kind === 'status') response.$metadata.httpStatusCode = 200;
    if (kind === 'range') response.ContentRange = 'bytes 1-4/8';
    if (kind === 'length') response.ContentLength = 8;
    if (kind === 'etag') response.ETag = '"changed"';
    if (kind === 'oversize') response.Body = Readable.from([Buffer.alloc(5)]);
    if (kind === 'truncated') response.Body = Readable.from([Buffer.alloc(3)]);
    send.mockResolvedValue(response);
    await expect(adapter.readPrefix(key, expected, 4)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(response.Body.destroyed).toBe(true);
  });
  it('aborts and destroys a stalled range stream without leaving a pending read', async () => {
    const { adapter, send } = fixture(); const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    const body = new Readable({ read() {} }); send.mockResolvedValue(range(body));
    try {
      const pending = adapter.readPrefix(key, expected, 4);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await Promise.resolve(); controller.abort(); await assertion;
      expect(body.destroyed).toBe(true);
    } finally { timeout.mockRestore(); }
  });
  it('treats an ambiguous object 404 with an unavailable bucket as storage failure', async () => {
    const { adapter, send } = fixture(); send.mockRejectedValueOnce(error('NotFound', 404)).mockRejectedValueOnce(error('NotFound', 404));
    await expect(adapter.head(key)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('maps conditional-read races without leaking provider errors', async () => {
    const { adapter, send } = fixture(); send.mockRejectedValue(error('PreconditionFailed', 412));
    await expect(adapter.readPrefix(key, expected, 4)).rejects.toMatchObject({ code: 'OBJECT_CHANGED' });
    expect(JSON.stringify(mapStorageError(error('PreconditionFailed', 412)))).not.toContain('private');
  });
  it('sends a physical delete but never manufactures a write-closure proof', async () => {
    const { adapter, send } = fixture(); send.mockResolvedValue({}); await adapter.deleteObject(key);
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand); expect(adapter.writeClosureEvidence).toBe('unproven');
  });
  it('signs safe download disposition and content type without embedding raw filenames as headers', async () => {
    const { adapter, sign } = fixture();
    await adapter.createReadAccess({ key, mimeType: 'image/png', originalName: 'Árvíz "kép".png', disposition: 'attachment', expiresAt });
    const command = sign.mock.calls[0][1]; expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({ ResponseContentType: 'image/png', ResponseCacheControl: 'no-store' });
    expect((command as GetObjectCommand).input.ResponseContentDisposition).toBe('attachment; filename="download"; filename*=UTF-8\'\'%C3%81rv%C3%ADz%20%22k%C3%A9p%22.png');
  });
  it('signs an inline preview with validated MIME, no-store and escaped UTF-8 filename', async () => {
    const { adapter, sign } = fixture();
    const result = await adapter.createReadAccess({ key, mimeType: 'image/png', originalName: 'Árvíz "kép".png', disposition: 'inline', expiresAt });
    const command = sign.mock.calls[0][1] as GetObjectCommand;
    expect(command.input).toMatchObject({ Bucket: 'unit-bucket', Key: key, ResponseContentType: 'image/png', ResponseCacheControl: 'no-store',
      ResponseContentDisposition: 'inline; filename="download"; filename*=UTF-8\'\'%C3%81rv%C3%ADz%20%22k%C3%A9p%22.png' });
    expect(result.expiresAt).toEqual(expiresAt);
  });
  it.each(['', '.', ' .. ', '../image.png', 'bad\r\nname.png', 'bad\ud800', 'name\u202e.png'])('rejects unsafe read filename %#', async (originalName) => {
    const { adapter, sign } = fixture();
    await expect(adapter.createReadAccess({ key, mimeType: 'image/png', originalName, disposition: 'inline', expiresAt })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(sign).not.toHaveBeenCalled();
  });
  it('sanitizes presigner failures and closes shared SDK clients exactly once', async () => {
    const { adapter, sign, destroy } = fixture(); sign.mockRejectedValue(new Error('private credentials'));
    await expect(adapter.createUploadAccess({ key, mimeType: 'image/png', sizeBytes: 8, expiresAt })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    adapter.onModuleDestroy(); expect(destroy).toHaveBeenCalledTimes(1);
  });
});
