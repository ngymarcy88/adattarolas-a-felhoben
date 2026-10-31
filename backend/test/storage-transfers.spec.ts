import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { validateEnvironment } from '../src/config/environment';
import { MAX_DERIVED_BYTES, MAX_ORIGINAL_BYTES, S3StorageAdapter } from '../src/storage/s3-storage.adapter';
import { assertDerivedKey, derivedStorageKey, originalStorageKey } from '../src/storage/storage-key';

const ids = [1, 2, 3, 4].map((id) => `abcdef00-0000-4000-8000-00000000000${id}`);
const original = originalStorageKey(ids[0], ids[1]);
const derived = derivedStorageKey(ids[0], ids[1], ids[2], ids[3]);
const expected = { sizeBytes: 4, contentType: 'image/png', etag: '"identity"' };
const config = validateEnvironment({ DATABASE_URL: 'postgresql://unit:unit@localhost/db',
  JWT_SECRET: 'unit-test-only-with-at-least-32-characters', FRONTEND_PUBLIC_URL: 'http://localhost:5173',
  BACKEND_PUBLIC_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1', S3_BUCKET: 'unit-bucket', S3_ACCESS_KEY_ID: 'unit-access', S3_SECRET_ACCESS_KEY: 'unit-secret' });
function fixture(maxUploadBytes = config.maxUploadBytes) {
  const send = jest.fn(); const write = jest.fn(); const destroy = jest.fn(); const destroyWrite = jest.fn();
  const client = { send, destroy } as unknown as S3Client;
  const writeClient = { send: write, destroy: destroyWrite } as unknown as S3Client;
  const sign = jest.fn().mockResolvedValue('https://invalid.test/synthetic') as jest.MockedFunction<typeof getSignedUrl>;
  const now = new Date('2026-10-29T00:00:00Z');
  const adapter = new S3StorageAdapter({ ...config, maxUploadBytes }, { client, signingClient: client, writeClient, sign, now: () => now });
  return { adapter, send, write, destroy, destroyWrite, sign, client, writeClient, now };
}
function range(body: Readable = Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4])])) {
  return { Body: body, ContentLength: 4, ContentRange: 'bytes 0-3/4', ETag: expected.etag, $metadata: { httpStatusCode: 206 } };
}
const written = () => ({ ETag: '"derived-identity"', $metadata: { httpStatusCode: 200 } });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('canonical derived keys and permissions', () => {
  it('uses owner/file/job/attempt identity and lowercase UUIDs only', () => {
    expect(derived).toBe(`derived/${ids.join('/')}.webp`);
    expect(() => assertDerivedKey(derived)).not.toThrow();
    expect(() => derivedStorageKey(ids[0].toUpperCase(), ids[1], ids[2], ids[3])).toThrow();
    expect(() => derivedStorageKey('../owner', ids[1], ids[2], ids[3])).toThrow();
  });
  it.each(['\n', '\u2028'])('rejects trailing line separators in the original key builder too: %j', async separator => {
    expect(() => originalStorageKey(ids[0] + separator, ids[1])).toThrow();
    expect(() => originalStorageKey(ids[0], ids[1] + separator)).toThrow();
  });
  it.each([derived.toUpperCase(), derived + '?x=1', derived + '/file', derived.replace('.webp', '.png'),
    derived.replace(ids[3], '..'), 'derived/photo.webp', original, `/${derived}`, derived + '\n', derived + '\u2028'])('rejects unsafe derived keys before write I/O %#', async (key) => {
    const f = fixture();
    await expect(f.adapter.writeDerived({ key, bytes: Buffer.from([1]) })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it('allows derived HEAD/delete/read URL, but not browser PUT, prefix or original read', async () => {
    const f = fixture(); f.send.mockResolvedValue({ ContentLength: 4, ETag: expected.etag, ContentType: 'image/webp' });
    expect(await f.adapter.head(derived)).toMatchObject({ sizeBytes: 4 });
    await f.adapter.deleteObject(derived);
    await f.adapter.createReadAccess({ key: derived, mimeType: 'image/webp', originalName: 'preview.webp', disposition: 'inline', expiresAt: new Date(+f.now + 300000) });
    expect(f.sign.mock.calls[0][1].input).toMatchObject({ Key: derived, ResponseContentType: 'image/webp' });
    f.send.mockClear(); f.sign.mockClear();
    await expect(f.adapter.createReadAccess({ key: derived, mimeType: 'image/png', originalName: 'preview.png', disposition: 'inline', expiresAt: new Date(+f.now + 300000) })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(f.adapter.createUploadAccess({ key: derived, mimeType: 'image/webp', sizeBytes: 4, expiresAt: new Date(+f.now + 300000) })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(f.adapter.readPrefix(derived, expected, 4)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(f.adapter.readOriginal(derived, expected, 4)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.send).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled();
    expect(f.adapter.writeClosureEvidence).toBe('unproven');
  });
  it('keeps derived WebP delivery independent of the original upload MIME allowlist', async () => {
    const f = fixture();
    const adapter = new S3StorageAdapter({ ...config, allowedMimeTypes: ['image/jpeg'] }, {
      client: f.client, signingClient: f.client, writeClient: f.writeClient, sign: f.sign, now: () => f.now,
    });
    const access = { mimeType: 'image/webp', originalName: 'thumbnail.webp', disposition: 'inline' as const, expiresAt: new Date(+f.now + 60000) };
    await expect(adapter.createReadAccess({ ...access, key: derived })).resolves.toHaveProperty('url');
    await expect(adapter.createReadAccess({ ...access, key: original })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.sign).toHaveBeenCalledTimes(1);
    adapter.onModuleDestroy();
  });
  it.each([derived + '?x=1', derived.toUpperCase(), derived.replace(ids[3], '..'), derived + '\n', original + '\n'])('rejects malformed general keys before all I/O %#', async (key) => {
    const f = fixture();
    await expect(f.adapter.head(key)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(f.adapter.deleteObject(key)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.send).not.toHaveBeenCalled();
  });
});

describe('bounded original read', () => {
  it('reads a complete conditional range into a bounded binary buffer and closes the stream', async () => {
    const f = fixture(); const result = range(); f.send.mockResolvedValue(result);
    expect(await f.adapter.readOriginal(original, expected, 4)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(f.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(f.send.mock.calls[0][0].input).toMatchObject({ Key: original, Range: 'bytes=0-3', IfMatch: expected.etag });
    expect(result.Body.destroyed).toBe(true);
  });
  it.each([0, -1, NaN, 1.5, MAX_ORIGINAL_BYTES + 1])('rejects invalid caps %s before I/O', async (maxBytes) => {
    const f = fixture();
    await expect(f.adapter.readOriginal(original, expected, maxBytes)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each([{ ...expected, sizeBytes: 0 }, { ...expected, sizeBytes: 5 }, { ...expected, sizeBytes: NaN },
    { ...expected, sizeBytes: 1.1 }, { ...expected, etag: 'unsafe' }, { ...expected, etag: '"newline\r\n"' }])('rejects invalid expected identity/size %#', async (head) => {
    const f = fixture();
    await expect(f.adapter.readOriginal(original, head, 4)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('enforces the smaller configured upload cap', async () => {
    const f = fixture(3);
    await expect(f.adapter.readOriginal(original, expected, 4)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('accepts the exact 32 MiB limit without concatenating chunks', async () => {
    const f = fixture(); const bytes = Buffer.alloc(MAX_ORIGINAL_BYTES, 7);
    f.send.mockResolvedValue({ ...range(Readable.from([bytes])), ContentLength: bytes.length, ContentRange: `bytes 0-${bytes.length - 1}/${bytes.length}` });
    const result = await f.adapter.readOriginal(original, { ...expected, sizeBytes: bytes.length }, MAX_ORIGINAL_BYTES);
    expect(result.byteLength).toBe(bytes.length); expect(result[bytes.length - 1]).toBe(7);
  });
  it.each(['status', 'range', 'length', 'etag', 'missingBody', 'short', 'long', 'string', 'object'])('rejects malformed response: %s', async (kind) => {
    const f = fixture(); const response: any = range();
    if (kind === 'status') response.$metadata.httpStatusCode = 200;
    if (kind === 'range') response.ContentRange = 'bytes 0-3/8';
    if (kind === 'length') response.ContentLength = '4';
    if (kind === 'etag') response.ETag = '"changed"';
    if (kind === 'missingBody') response.Body = undefined;
    if (kind === 'short') response.Body = Readable.from([Buffer.alloc(3)]);
    if (kind === 'long') response.Body = Readable.from([Buffer.alloc(5)]);
    if (kind === 'string') response.Body = Readable.from(['abcd'], { objectMode: true });
    if (kind === 'object') response.Body = Readable.from([{}]);
    f.send.mockResolvedValue(response);
    await expect(f.adapter.readOriginal(original, expected, 4)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    if (response.Body) expect(response.Body.destroyed).toBe(true);
  });
  it('snapshots expected identity before transport awaits', async () => {
    const f = fixture(); const head = { ...expected }; let resolve!: (value: unknown) => void;
    f.send.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = f.adapter.readOriginal(original, head, 4); head.sizeBytes = 100; head.etag = '"mutated"'; resolve(range());
    expect((await pending).byteLength).toBe(4);
  });
  it.each([412, 416, 503])('maps conditional/transport errors safely: %s', async (status) => {
    const f = fixture(); f.send.mockRejectedValue({ $metadata: { httpStatusCode: status }, message: 'secret provider URL' });
    await expect(f.adapter.readOriginal(original, expected, 4)).rejects.toMatchObject({ code: status === 503 ? 'UNAVAILABLE' : 'OBJECT_CHANGED', message: 'Object storage operation failed.' });
  });
  it('pre-abort makes no transport call', async () => {
    const f = fixture(); const caller = new AbortController(); caller.abort('secret');
    await expect(f.adapter.readOriginal(original, expected, 4, caller.signal)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(f.send).not.toHaveBeenCalled();
  });
  it('caller abort settles an ignored send and destroys its late body', async () => {
    const f = fixture(); const caller = new AbortController(); let resolve!: (value: unknown) => void;
    f.send.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = f.adapter.readOriginal(original, expected, 4, caller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' }); caller.abort(); await assertion;
    const body = range(); resolve(body); await flush(); expect(body.Body.destroyed).toBe(true);
  });
  it('caller abort destroys an already returned stalled stream', async () => {
    const f = fixture(); const caller = new AbortController(); const body = new Readable({ read() {} }); f.send.mockResolvedValue(range(body));
    const pending = f.adapter.readOriginal(original, expected, 4, caller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' }); await flush(); caller.abort(); await assertion;
    expect(body.destroyed).toBe(true);
  });
  it.each(['send', 'stream'])('10 second deadline settles stalled %s', async (mode) => {
    jest.useFakeTimers();
    try {
      const f = fixture(); const body = new Readable({ read() {} });
      if (mode === 'send') f.send.mockReturnValue(new Promise(() => undefined));
      else f.send.mockResolvedValue(range(body));
      const pending = f.adapter.readOriginal(original, expected, 4);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await flush(); await jest.advanceTimersByTimeAsync(10000); await assertion;
      if (mode === 'stream') expect(body.destroyed).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
  it('handles a deadline already exhausted before send without an unhandled cancellation', async () => {
    const clock = jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(10001);
    try {
      const f = fixture();
      await expect(f.adapter.readOriginal(original, expected, 4)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(f.send).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it('checks monotonic elapsed time per chunk even before a timer callback can run', async () => {
    const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
    try {
      const f = fixture(); const body = Readable.from((async function* () {
        yield Buffer.from([1, 2]); clock.mockReturnValue(10001); yield Buffer.from([3, 4]);
      })()); f.send.mockResolvedValue(range(body));
      await expect(f.adapter.readOriginal(original, expected, 4)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(body.destroyed).toBe(true);
    } finally { clock.mockRestore(); }
  });
});

describe('single-attempt derived writes', () => {
  it('sends exact-size, create-only WebP/no-store with input snapshot and SHA-256', async () => {
    const f = fixture(); const bytes = Buffer.from([1, 2, 3, 4]); const snapshot = Buffer.from(bytes);
    let resolve!: (value: unknown) => void; f.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = f.adapter.writeDerived({ key: derived, bytes }); bytes.fill(99);
    const command = f.write.mock.calls[0][0] as PutObjectCommand;
    const digest = createHash('sha256').update(snapshot).digest();
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Key: derived, ContentType: 'image/webp', CacheControl: 'no-store', ContentLength: 4,
      IfNoneMatch: '*', ChecksumSHA256: digest.toString('base64'), Body: snapshot });
    resolve({ ...written(), ChecksumSHA256: digest.toString('base64') });
    expect(await pending).toEqual({ sizeBytes: 4, contentType: 'image/webp', etag: '"derived-identity"', sha256: digest.toString('hex') });
    expect(f.send).not.toHaveBeenCalled(); expect(f.write).toHaveBeenCalledTimes(1);
  });
  it.each([0, MAX_DERIVED_BYTES + 1])('rejects invalid output size %s before I/O', async (size) => {
    const f = fixture(); await expect(f.adapter.writeDerived({ key: derived, bytes: new Uint8Array(size) })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it('rejects a nonbinary body without I/O', async () => {
    const f = fixture(); await expect(f.adapter.writeDerived({ key: derived, bytes: 'webp' as unknown as Uint8Array })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it('accepts exactly 512 KiB and an optional absent response checksum', async () => {
    const f = fixture(); f.write.mockResolvedValue(written());
    expect(await f.adapter.writeDerived({ key: derived, bytes: Buffer.alloc(MAX_DERIVED_BYTES) })).toMatchObject({ sizeBytes: MAX_DERIVED_BYTES });
  });
  it.each(['status', 'etag', 'missingEtag', 'checksum'])('rejects invalid PUT success metadata: %s', async (kind) => {
    const f = fixture(); const result: any = written();
    if (kind === 'status') result.$metadata.httpStatusCode = 204;
    if (kind === 'etag') result.ETag = 'invalid';
    if (kind === 'missingEtag') delete result.ETag;
    if (kind === 'checksum') result.ChecksumSHA256 = 'incorrect';
    f.write.mockResolvedValue(result);
    await expect(f.adapter.writeDerived({ key: derived, bytes: Buffer.from([1]) })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.send).not.toHaveBeenCalled();
  });
  it.each([[412, 'OBJECT_EXISTS'], [409, 'WRITE_CONFLICT'], [503, 'UNAVAILABLE'], [403, 'UNAVAILABLE']])('maps PUT%s safely without retry/delete: %s', async (status, code) => {
    const f = fixture(); f.write.mockRejectedValue({ $metadata: { httpStatusCode: status }, message: 'secret provider credential' });
    await expect(f.adapter.writeDerived({ key: derived, bytes: Buffer.from([1]) })).rejects.toMatchObject({ code, message: 'Object storage operation failed.' });
    expect(f.write).toHaveBeenCalledTimes(1); expect(f.send).not.toHaveBeenCalled();
  });
  it('pre-abort makes no PUT attempt', async () => {
    const f = fixture(); const caller = new AbortController(); caller.abort();
    await expect(f.adapter.writeDerived({ key: derived, bytes: Buffer.from([1]), signal: caller.signal })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(f.write).not.toHaveBeenCalled();
  });
  it('caller abort returns unknown outcome even if transport later reports success', async () => {
    const f = fixture(); const caller = new AbortController(); let resolve!: (value: unknown) => void;
    f.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = f.adapter.writeDerived({ key: derived, bytes: Buffer.from([1]), signal: caller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' }); caller.abort(); await assertion;
    resolve(written()); await flush(); expect(f.write).toHaveBeenCalledTimes(1); expect(f.send).not.toHaveBeenCalled();
  });
  it('deadline settles an ignored PUT without retry or delete', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture(); f.write.mockReturnValue(new Promise(() => undefined));
      const pending = f.adapter.writeDerived({ key: derived, bytes: Buffer.from([1]) });
      const assertion = expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await jest.advanceTimersByTimeAsync(10000); await assertion;
      expect(f.write).toHaveBeenCalledTimes(1); expect(f.send).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
  it('configures writes without SDK retries, while reads retain two attempts', async () => {
    const adapter = new S3StorageAdapter(config);
    const internals = adapter as unknown as { client: S3Client; writeClient: S3Client };
    try {
      expect(await internals.client.config.maxAttempts()).toBe(2);
      expect(await internals.writeClient.config.maxAttempts()).toBe(1);
    } finally { adapter.onModuleDestroy(); }
  });
  it('destroys each distinct client once across repeated shutdown', () => {
    const f = fixture(); f.adapter.onModuleDestroy(); f.adapter.onModuleDestroy();
    expect(f.destroy).toHaveBeenCalledTimes(1); expect(f.destroyWrite).toHaveBeenCalledTimes(1);
    const destroy = jest.fn(); const shared = { send: jest.fn(), destroy } as unknown as S3Client;
    const adapter = new S3StorageAdapter(config, { client: shared, signingClient: shared, writeClient: shared });
    adapter.onModuleDestroy(); adapter.onModuleDestroy(); expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('Recovery candidate full read', () => {
  it('conditionally reads a complete derived WebP independently of the original upload cap', async () => {
    const f = fixture(1); const body = Readable.from([Buffer.from([1, 2, 3, 4])]); f.send.mockResolvedValue(range(body));
    const bytes = await f.adapter.readDerived(derived, { ...expected, contentType: 'image/webp' });
    expect(Buffer.from(bytes)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(f.send.mock.calls[0][0].input).toMatchObject({ Key: derived, Range: 'bytes=0-3', IfMatch: expected.etag });
    expect(body.destroyed).toBe(true); expect(f.adapter.writeClosureEvidence).toBe('unproven');
  });
  it.each([0, 524289, NaN, Infinity])('rejects invalid candidate size %s before I/O', async sizeBytes => {
    const f = fixture(); await expect(f.adapter.readDerived(derived, { ...expected, sizeBytes, contentType: 'image/webp' }))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' }); expect(f.send).not.toHaveBeenCalled();
  });
  it('rejects original keys, non-WebP metadata, truncated data and pre-abort', async () => {
    const f = fixture();
    await expect(f.adapter.readDerived(original, { ...expected, contentType: 'image/webp' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(f.adapter.readDerived(derived, expected)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    const abort = new AbortController(); abort.abort();
    await expect(f.adapter.readDerived(derived, { ...expected, contentType: 'image/webp' }, abort.signal)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(f.send).not.toHaveBeenCalled(); f.send.mockResolvedValue(range(Readable.from([Buffer.from([1])])));
    await expect(f.adapter.readDerived(derived, { ...expected, contentType: 'image/webp' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
