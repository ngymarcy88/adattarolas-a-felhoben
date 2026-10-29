import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../config/app-config';
import { mapStorageError, mapStorageWriteError, StorageError } from './storage-error';
import { assertDerivedKey, assertOriginalKey, assertStorageKey } from './storage-key';
import type { DerivedWriteReceipt, ObjectHead, ObjectStorage, UploadAccess } from './storage.interface';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const OPERATION_TIMEOUT_MS = 10_000;
export const MAX_PREFIX_BYTES = 65_536;
export const MAX_ORIGINAL_BYTES = 32 * 1024 * 1024;
export const MAX_DERIVED_BYTES = 512 * 1024;
type Dependencies = { writeClient?: S3Client; client?: S3Client; signingClient?: S3Client; sign?: typeof getSignedUrl; now?: () => Date };

/** Provider calls stay here. No user authorization, DB state, quotas or image decoding. */
export class S3StorageAdapter implements ObjectStorage {
  readonly writeClosureEvidence = 'unproven' as const;
  private readonly client: S3Client;
  private readonly writeClient: S3Client;
  private readonly signingClient: S3Client;
  private readonly sign: typeof getSignedUrl;
  private readonly now: () => Date;

  constructor(private readonly config: AppConfig, dependencies: Dependencies = {}) {
    const storage = config.storage;
    const options = { region: storage.region, forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
      maxAttempts: 2, followRegionRedirects: false,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const, responseChecksumValidation: 'WHEN_REQUIRED' as const };
    this.client = dependencies.client ?? new S3Client({ ...options, endpoint: storage.endpoint });
    this.writeClient = dependencies.writeClient ?? new S3Client({ ...options, maxAttempts: 1, endpoint: storage.endpoint });
    this.signingClient = dependencies.signingClient ?? new S3Client({ ...options, endpoint: storage.publicEndpoint });
    this.sign = dependencies.sign ?? getSignedUrl;
    this.now = dependencies.now ?? (() => new Date());
  }

  private expiry(expiresAt: Date): { signingDate: Date; expiresIn: number; expiresAt: Date } {
    const now = this.now().getTime();
    const requested = expiresAt instanceof Date ? expiresAt.getTime() : NaN;
    if (!Number.isFinite(requested) || requested <= now || requested > now + this.config.presignedUrlTtlSeconds * 1000) {
      throw new StorageError('INVALID_ARGUMENT');
    }
    const signingDate = new Date(Math.floor(now / 1000) * 1000);
    const expiresIn = Math.floor((requested - signingDate.getTime()) / 1000);
    if (expiresIn < 1 || signingDate.getTime() + expiresIn * 1000 <= now) throw new StorageError('INVALID_ARGUMENT');
    return { signingDate, expiresIn, expiresAt: new Date(signingDate.getTime() + expiresIn * 1000) };
  }

  private assertImage(mimeType: string): void {
    if (!imageTypes.has(mimeType) || !this.config.allowedMimeTypes.includes(mimeType as AppConfig['allowedMimeTypes'][number])) {
      throw new StorageError('INVALID_ARGUMENT');
    }
  }

  async createUploadAccess(input: { key: string; mimeType: string; sizeBytes: number; expiresAt: Date }): Promise<UploadAccess> {
    assertOriginalKey(input.key); this.assertImage(input.mimeType);
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > this.config.maxUploadBytes) {
      throw new StorageError('INVALID_ARGUMENT');
    }
    const expiry = this.expiry(input.expiresAt);
    try {
      const url = await this.sign(this.signingClient, new PutObjectCommand({ Bucket: this.config.storage.bucket,
        Key: input.key, ContentType: input.mimeType, ContentLength: input.sizeBytes, IfNoneMatch: '*' }), {
        ...expiry, signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']),
      });
      return { method: 'PUT', url, expiresAt: expiry.expiresAt, headers: { 'Content-Type': input.mimeType, 'If-None-Match': '*' } };
    } catch (error) { throw mapStorageError(error); }
  }

  async head(key: string): Promise<ObjectHead | null> {
    assertStorageKey(key);
    const signal = AbortSignal.timeout(OPERATION_TIMEOUT_MS);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.storage.bucket, Key: key }),
        { abortSignal: signal });
      if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength! < 0 || !this.validEtag(result.ETag)) {
        throw new StorageError('INVALID_RESPONSE');
      }
      return { sizeBytes: result.ContentLength!, contentType: result.ContentType ?? null, etag: result.ETag! };
    } catch (error) {
      const safe = mapStorageError(error);
      if (safe.code === 'NOT_FOUND') {
        // HEAD 404 can hide a missing/inaccessible bucket. Verify the bucket before reporting absence.
        try {
          await this.client.send(new HeadBucketCommand({ Bucket: this.config.storage.bucket }), { abortSignal: signal });
        } catch { throw new StorageError('UNAVAILABLE'); }
        return null;
      }
      throw safe;
    }
  }

  private validEtag(value: unknown): value is string {
    return typeof value === 'string' && /^"[^"\x00-\x20\x7f]{1,254}"$/.test(value);
  }

  async readPrefix(key: string, expected: ObjectHead, maxBytes: number): Promise<Uint8Array> {
    assertOriginalKey(key);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PREFIX_BYTES ||
        !Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes < 1 || !this.validEtag(expected.etag)) {
      throw new StorageError('INVALID_ARGUMENT');
    }
    const count = Math.min(expected.sizeBytes, maxBytes);
    const signal = AbortSignal.timeout(OPERATION_TIMEOUT_MS);
    let body: Readable | undefined;
    const abort = () => body?.destroy(new StorageError('UNAVAILABLE'));
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.storage.bucket, Key: key,
        Range: `bytes=0-${count - 1}`, IfMatch: expected.etag }), { abortSignal: signal });
      if (!(result.Body instanceof Readable)) throw new StorageError('INVALID_RESPONSE');
      body = result.Body;
      if (result.$metadata.httpStatusCode !== 206 || result.ContentRange !== `bytes 0-${count - 1}/${expected.sizeBytes}` ||
          result.ContentLength !== count || result.ETag !== expected.etag) throw new StorageError('INVALID_RESPONSE');
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) throw new StorageError('UNAVAILABLE');
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array) || (length += chunk.byteLength) > count) throw new StorageError('INVALID_RESPONSE');
        chunks.push(Buffer.from(chunk));
      }
      if (length !== count) throw new StorageError('INVALID_RESPONSE');
      return Buffer.concat(chunks, count);
    } catch (error) { throw mapStorageError(error); }
    finally { signal.removeEventListener('abort', abort); body?.destroy(); }
  }

  /** Deadline includes send and stream consumption, even for a non-cooperative transport. */
  private async boundedOperation<T>(callerSignal: AbortSignal | undefined,
    run: (signal: AbortSignal, assertLive: () => void) => Promise<T>): Promise<T> {
    if (callerSignal?.aborted) throw new StorageError('UNAVAILABLE');
    const controller = new AbortController();
    const deadline = performance.now() + OPERATION_TIMEOUT_MS;
    const abort = () => controller.abort();
    const assertLive = () => {
      if (controller.signal.aborted || callerSignal?.aborted || performance.now() >= deadline) {
        abort(); throw new StorageError('UNAVAILABLE');
      }
    };
    let rejectAbort!: (error: StorageError) => void;
    const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
    controller.signal.addEventListener('abort', () => rejectAbort(new StorageError('UNAVAILABLE')), { once: true });
    callerSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, OPERATION_TIMEOUT_MS);
    try {
      // Start synchronously so the caller cannot mutate inputs before they are snapshotted.
      // Wrap the initial deadline check too: a long scheduler/GC pause must not leave
      // the cancellation rejection unobserved before Promise.race is attached.
      const operation = (async () => { assertLive(); return run(controller.signal, assertLive); })();
      return await Promise.race([operation, cancelled]);
    } finally {
      clearTimeout(timer); callerSignal?.removeEventListener('abort', abort); abort();
    }
  }

  async readOriginal(key: string, expected: ObjectHead, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
    assertOriginalKey(key);
    const size = expected?.sizeBytes; const etag = expected?.etag;
    const cap = Math.min(this.config.maxUploadBytes, MAX_ORIGINAL_BYTES);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > cap ||
        !Number.isSafeInteger(size) || size < 1 || size > maxBytes || !this.validEtag(etag)) {
      throw new StorageError('INVALID_ARGUMENT');
    }
    try {
      return await this.boundedOperation(signal, async (abortSignal, assertLive) => {
        let body: Readable | undefined;
        const abortBody = () => body?.destroy();
        abortSignal.addEventListener('abort', abortBody, { once: true });
        try {
          const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.storage.bucket,
            Key: key, Range: `bytes=0-${size - 1}`, IfMatch: etag }), { abortSignal });
          if (result.Body instanceof Readable) body = result.Body;
          // A late transport response must not leave its stream open after timeout/abort.
          if (abortSignal.aborted) body?.destroy();
          assertLive();
          if (!body || result.$metadata?.httpStatusCode !== 206 ||
              result.ContentRange !== `bytes 0-${size - 1}/${size}` || result.ContentLength !== size || result.ETag !== etag) {
            throw new StorageError('INVALID_RESPONSE');
          }
          const bytes = Buffer.alloc(size); let offset = 0;
          for await (const chunk of body) {
            assertLive();
            if (!(chunk instanceof Uint8Array) || chunk.byteLength > size - offset) throw new StorageError('INVALID_RESPONSE');
            bytes.set(chunk, offset); offset += chunk.byteLength;
          }
          assertLive();
          if (offset !== size) throw new StorageError('INVALID_RESPONSE');
          return bytes;
        } catch (error) {
          assertLive(); throw error;
        } finally {
          abortSignal.removeEventListener('abort', abortBody); body?.destroy();
        }
      });
    } catch (error) { throw mapStorageError(error); }
  }

  async writeDerived(input: { key: string; bytes: Uint8Array; signal?: AbortSignal }): Promise<DerivedWriteReceipt> {
    assertDerivedKey(input.key);
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_DERIVED_BYTES) {
      throw new StorageError('INVALID_ARGUMENT');
    }
    if (input.signal?.aborted) throw new StorageError('UNAVAILABLE');
    const key = input.key;
    // Snapshot before any await: checksums and PUT body describe the same immutable attempt.
    const bytes = Buffer.from(input.bytes);
    const digest = createHash('sha256').update(bytes).digest();
    const checksum = digest.toString('base64');
    try {
      return await this.boundedOperation(input.signal, async (abortSignal, assertLive) => {
        const result = await this.writeClient.send(new PutObjectCommand({ Bucket: this.config.storage.bucket,
          Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: 'image/webp', CacheControl: 'no-store',
          IfNoneMatch: '*', ChecksumSHA256: checksum }), { abortSignal });
        assertLive();
        if (result.$metadata?.httpStatusCode !== 200 || !this.validEtag(result.ETag) ||
            (result.ChecksumSHA256 !== undefined && result.ChecksumSHA256 !== checksum)) {
          throw new StorageError('INVALID_RESPONSE');
        }
        return { sizeBytes: bytes.byteLength, contentType: 'image/webp', etag: result.ETag, sha256: digest.toString('hex') };
      });
    } catch (error) { throw mapStorageWriteError(error); }
  }

  async deleteObject(key: string): Promise<void> {
    assertStorageKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.storage.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(OPERATION_TIMEOUT_MS) });
    } catch (error) { throw mapStorageError(error); }
  }

  async createReadAccess(input: { key: string; mimeType: string; originalName: string;
    disposition: 'inline' | 'attachment'; expiresAt: Date }): Promise<{ url: string; expiresAt: Date }> {
    const kind = assertStorageKey(input.key);
    if (kind === 'derived') {
      if (input.mimeType !== 'image/webp') throw new StorageError('INVALID_ARGUMENT');
    } else this.assertImage(input.mimeType);
    const name = input.originalName;
    if (!['inline', 'attachment'].includes(input.disposition) || typeof name !== 'string' || !name.trim() ||
        ['.', '..'].includes(name.trim().normalize('NFC')) || Array.from(name).length > 255 || /[\x00-\x1f\x7f-\x9f/\\\u202a-\u202e\u2066-\u2069]/u.test(name) ||
        Buffer.from(name, 'utf8').toString('utf8') !== name) throw new StorageError('INVALID_ARGUMENT');
    const encoded = encodeURIComponent(name.trim().normalize('NFC')).replace(/[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const expiry = this.expiry(input.expiresAt);
    try {
      const url = await this.sign(this.signingClient, new GetObjectCommand({ Bucket: this.config.storage.bucket,
        Key: input.key, ResponseContentType: input.mimeType, ResponseCacheControl: 'no-store',
        ResponseContentDisposition: `${input.disposition}; filename="download"; filename*=UTF-8''${encoded}` }), expiry);
      return { url, expiresAt: expiry.expiresAt };
    } catch (error) { throw mapStorageError(error); }
  }

  private readonly destroyedClients = new Set<S3Client>();
  onModuleDestroy(): void {
    for (const client of [this.client, this.signingClient, this.writeClient]) {
      if (!this.destroyedClients.has(client)) { this.destroyedClients.add(client); client.destroy(); }
    }
  }
}
