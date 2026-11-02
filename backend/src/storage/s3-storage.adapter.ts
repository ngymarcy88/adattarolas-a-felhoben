import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, ListPartsCommand, ListMultipartUploadsCommand,
  UploadPartCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../config/app-config';
import { mapStorageError, mapStorageWriteError, mapMultipartError, MultipartMutationError, StorageError } from './storage-error';
import { assertDerivedKey, assertOriginalKey, assertStorageKey } from './storage-key';
import type { DerivedWriteReceipt, MultipartPartReceipt, MultipartSession, MultipartStorage, ObjectHead, ObjectStorage, UploadAccess } from './storage.interface';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const OPERATION_TIMEOUT_MS = 10_000;
export const MAX_PREFIX_BYTES = 65_536;
export const MAX_ORIGINAL_BYTES = 32 * 1024 * 1024;
export const MAX_DERIVED_BYTES = 512 * 1024;
export const MIN_MULTIPART_PART_BYTES = 5 * 1024 * 1024;
export const MAX_MULTIPART_PART_BYTES = 16 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = 100 * 1024 * 1024;
export const MAX_MULTIPART_URL_TTL_SECONDS = 300;
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
    run: (signal: AbortSignal, assertLive: () => void) => Promise<T>, timeoutMs = OPERATION_TIMEOUT_MS): Promise<T> {
    if (callerSignal?.aborted) throw new StorageError('UNAVAILABLE');
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
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
    const timer = setTimeout(abort, timeoutMs);
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
    return this.readComplete(key, expected, maxBytes, Math.min(this.config.maxUploadBytes, MAX_ORIGINAL_BYTES), signal);
  }

  async readDerived(key: string, expected: ObjectHead, signal?: AbortSignal): Promise<Uint8Array> {
    assertDerivedKey(key);
    if (expected?.contentType !== 'image/webp') throw new StorageError('INVALID_ARGUMENT');
    return this.readComplete(key, expected, MAX_DERIVED_BYTES, MAX_DERIVED_BYTES, signal);
  }

  private async readComplete(key: string, expected: ObjectHead, maxBytes: number, cap: number,
    signal?: AbortSignal): Promise<Uint8Array> {
    const size = expected?.sizeBytes; const etag = expected?.etag;
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

  private multipartGeometry(input: { key: string; sizeBytes: number; partSizeBytes: number }) {
    assertOriginalKey(input.key);
    const { key, sizeBytes, partSizeBytes } = input;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > Math.min(this.config.maxUploadBytes, MAX_MULTIPART_BYTES) ||
        !Number.isSafeInteger(partSizeBytes) || partSizeBytes < MIN_MULTIPART_PART_BYTES || partSizeBytes > MAX_MULTIPART_PART_BYTES ||
        partSizeBytes % (1024 * 1024) !== 0) throw new StorageError('INVALID_ARGUMENT');
    return { key, sizeBytes, partSizeBytes, partCount: Math.ceil(sizeBytes / partSizeBytes) };
  }

  async findMultipartUploads(key: string, signal?: AbortSignal): Promise<string[]> {
    assertOriginalKey(key);
    try {
      return await this.boundedOperation(signal, async (abortSignal, assertLive) => {
        const ids = new Set<string>(); const seen = new Set<string>(); let keyMarker: string | undefined; let uploadMarker: string | undefined;
        for (let i = 0; i < 10; i++) {
          const result = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.config.storage.bucket,
            Prefix: key, MaxUploads: 100, KeyMarker: keyMarker, UploadIdMarker: uploadMarker }), { abortSignal });
          assertLive();
          if (result.$metadata?.httpStatusCode !== 200 || result.Bucket !== this.config.storage.bucket ||
              typeof result.IsTruncated !== 'boolean' || (result.Uploads !== undefined && (!Array.isArray(result.Uploads) || result.Uploads.length > 100))) throw new StorageError('INVALID_RESPONSE');
          for (const upload of result.Uploads ?? []) {
            if (typeof upload.Key !== 'string' || upload.Key.length > 1024 || !upload.Key.startsWith(key) || !this.validUploadId(upload.UploadId)) throw new StorageError('INVALID_RESPONSE');
            if (upload.Key === key) {
              if (ids.has(upload.UploadId) || ids.size >= 100) throw new StorageError('INVALID_RESPONSE');
              ids.add(upload.UploadId);
            }
          }
          if (!result.IsTruncated) return [...ids];
          const next = JSON.stringify([result.NextKeyMarker, result.NextUploadIdMarker]);
          if (!result.Uploads?.length || typeof result.NextKeyMarker !== 'string' || !result.NextKeyMarker.startsWith(key) ||
              !this.validUploadId(result.NextUploadIdMarker) || seen.has(next)) throw new StorageError('INVALID_RESPONSE');
          seen.add(next); keyMarker = result.NextKeyMarker; uploadMarker = result.NextUploadIdMarker;
        }
        throw new StorageError('INVALID_RESPONSE');
      });
    } catch (error) { throw mapMultipartError(error); }
  }

  async verifyMultipartObject(input: Parameters<MultipartStorage['verifyMultipartObject']>[0]) {
    const session = this.multipartGeometry(input); const transferId = input.transferId; const expectedEtag = input.etag;
    if (typeof transferId !== 'string' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.exec(transferId)?.[0] !== transferId ||
        (expectedEtag !== undefined && !this.validEtag(expectedEtag))) throw new StorageError('INVALID_ARGUMENT');
    try {
      return await this.boundedOperation(input.signal, async (abortSignal, assertLive) => {
        let body: Readable | undefined; const abortBody = () => body?.destroy();
        abortSignal.addEventListener('abort', abortBody, { once: true });
        try {
          let head;
          try { head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.storage.bucket, Key: session.key }), { abortSignal }); }
          catch (error) {
            if (mapStorageError(error).code !== 'NOT_FOUND') throw error;
            await this.client.send(new HeadBucketCommand({ Bucket: this.config.storage.bucket }), { abortSignal });
            assertLive(); throw new StorageError('NOT_FOUND');
          }
          assertLive();
          if (head.$metadata?.httpStatusCode !== 200 || !this.validEtag(head.ETag)) throw new StorageError('INVALID_RESPONSE');
          if (head.Metadata?.['cloudvault-transfer-id'] !== transferId || head.Metadata?.['cloudvault-size-bytes'] !== String(session.sizeBytes) ||
              head.Metadata?.['cloudvault-part-size-bytes'] !== String(session.partSizeBytes) || (expectedEtag !== undefined && expectedEtag !== head.ETag)) throw new StorageError('OBJECT_CHANGED');
          if (head.ContentLength !== session.sizeBytes) throw new StorageError('CONTENT_MISMATCH');
          const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.storage.bucket, Key: session.key,
            IfMatch: head.ETag, ...(head.VersionId === undefined ? {} : { VersionId: head.VersionId }) }), { abortSignal });
          if (result.Body instanceof Readable) body = result.Body;
          if (abortSignal.aborted) body?.destroy();
          assertLive();
          if (!body || result.$metadata?.httpStatusCode !== 200 || result.ContentLength !== session.sizeBytes || result.ETag !== head.ETag ||
              (head.VersionId !== undefined && result.VersionId !== head.VersionId)) throw new StorageError('INVALID_RESPONSE');
          const hash = createHash('sha256'); const prefix = Buffer.alloc(16); let size = 0;
          for await (const chunk of body) {
            assertLive();
            if (!(chunk instanceof Uint8Array) || chunk.byteLength > session.sizeBytes - size) throw new StorageError('INVALID_RESPONSE');
            if (size < 16) prefix.set(chunk.subarray(0, 16 - size), size);
            hash.update(chunk); size += chunk.byteLength;
          }
          assertLive();
          if (size !== session.sizeBytes) throw new StorageError('INVALID_RESPONSE');
          return { etag: head.ETag, sha256: hash.digest('hex'), prefix: prefix.subarray(0, Math.min(size, 16)) };
        } finally { abortSignal.removeEventListener('abort', abortBody); body?.destroy(); }
      }, 60_000);
    } catch (error) { throw mapStorageError(error); }
  }

  private validUploadId(value: unknown): value is string {
    return typeof value === 'string' && value.length <= 2048 && /^[\x21-\x7e]+$/.exec(value)?.[0] === value;
  }

  private multipartSession(input: MultipartSession) {
    const geometry = this.multipartGeometry(input);
    if (!this.validUploadId(input.uploadId)) throw new StorageError('INVALID_ARGUMENT');
    return { ...geometry, uploadId: input.uploadId };
  }

  private partBytes(session: { sizeBytes: number; partSizeBytes: number; partCount: number }, partNumber: number) {
    if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > session.partCount) throw new StorageError('INVALID_ARGUMENT');
    return Math.min(session.partSizeBytes, session.sizeBytes - (partNumber - 1) * session.partSizeBytes);
  }

  /** Timeout/abort after dispatch cannot attest whether the provider committed. Never retry here. */
  private async multipartMutation<T>(signal: AbortSignal | undefined,
    run: (signal: AbortSignal, assertLive: () => void, dispatch: () => void) => Promise<T>): Promise<T> {
    let dispatched = false;
    try {
      return await this.boundedOperation(signal, (abortSignal, assertLive) =>
        run(abortSignal, assertLive, () => { assertLive(); dispatched = true; }));
    } catch (error) {
      throw new MultipartMutationError(mapMultipartError(error).code, dispatched ? 'unknown' : 'not-started');
    }
  }

  async initiateMultipart(input: Parameters<MultipartStorage['initiateMultipart']>[0]): Promise<{ uploadId: string }> {
    const session = this.multipartGeometry(input); this.assertImage(input.mimeType);
    const transferId = input.transferId;
    if (typeof transferId !== 'string' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.exec(transferId)?.[0] !== transferId) {
      throw new StorageError('INVALID_ARGUMENT');
    }
    const command = new CreateMultipartUploadCommand({ Bucket: this.config.storage.bucket, Key: session.key,
      ContentType: input.mimeType, CacheControl: 'no-store', Metadata: { 'cloudvault-transfer-id': transferId,
        'cloudvault-size-bytes': String(session.sizeBytes), 'cloudvault-part-size-bytes': String(session.partSizeBytes) } });
    return this.multipartMutation(input.signal, async (abortSignal, assertLive, dispatch) => {
      dispatch();
      const result = await this.writeClient.send(command, { abortSignal });
      assertLive();
      if (result.$metadata?.httpStatusCode !== 200 || result.Bucket !== this.config.storage.bucket || result.Key !== session.key ||
          !this.validUploadId(result.UploadId)) throw new StorageError('INVALID_RESPONSE');
      return { uploadId: result.UploadId };
    });
  }

  async createMultipartPartAccess(input: Parameters<MultipartStorage['createMultipartPartAccess']>[0]) {
    const session = this.multipartSession(input); const partNumber = input.partNumber;
    const sizeBytes = this.partBytes(session, partNumber);
    const expiry = this.expiry(input.expiresAt);
    if (expiry.expiresIn > MAX_MULTIPART_URL_TTL_SECONDS) throw new StorageError('INVALID_ARGUMENT');
    try {
      return await this.boundedOperation(input.signal, async (_abortSignal, assertLive) => {
        const url = await this.sign(this.signingClient, new UploadPartCommand({ Bucket: this.config.storage.bucket,
          Key: session.key, UploadId: session.uploadId, PartNumber: partNumber, ContentLength: sizeBytes }),
        { ...expiry, signableHeaders: new Set(['content-length']) });
        assertLive();
        if (this.now().getTime() >= expiry.expiresAt.getTime()) throw new StorageError('UNAVAILABLE');
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error();
        } catch { throw new StorageError('INVALID_RESPONSE'); }
        // Content-Length is signed but browser-forbidden: the browser derives it from the exact Blob.
        return { method: 'PUT' as const, url, expiresAt: expiry.expiresAt, partNumber, sizeBytes, headers: {} as Record<string, string> };
      });
    } catch (error) { throw mapMultipartError(error); }
  }

  async listMultipartParts(input: Parameters<MultipartStorage['listMultipartParts']>[0]): Promise<MultipartPartReceipt[]> {
    const session = this.multipartSession(input);
    try {
      return await this.boundedOperation(input.signal, async (abortSignal, assertLive) => {
        const parts: MultipartPartReceipt[] = []; let marker: string | undefined; let last = 0;
        // At most one page per valid part plus an empty final page; one deadline across ALL pages.
        for (let page = 0; page <= session.partCount; page++) {
          const result = await this.client.send(new ListPartsCommand({ Bucket: this.config.storage.bucket, Key: session.key,
            UploadId: session.uploadId, PartNumberMarker: marker, MaxParts: session.partCount }), { abortSignal });
          assertLive();
          if (result.$metadata?.httpStatusCode !== 200 || result.Bucket !== this.config.storage.bucket || result.Key !== session.key ||
              result.UploadId !== session.uploadId || typeof result.IsTruncated !== 'boolean' ||
              (result.Parts !== undefined && !Array.isArray(result.Parts))) throw new StorageError('INVALID_RESPONSE');
          const current = result.Parts ?? [];
          if (current.length > session.partCount - parts.length) throw new StorageError('INVALID_RESPONSE');
          for (const part of current) {
            const n = part.PartNumber; const size = part.Size;
            if (!Number.isSafeInteger(n) || n! <= last || !Number.isSafeInteger(size) || !this.validEtag(part.ETag)) {
              throw new StorageError('INVALID_RESPONSE');
            }
            if (n! > session.partCount || n! < 1 || size !== this.partBytes(session, n!)) throw new StorageError('PARTS_INVALID');
            parts.push({ partNumber: n!, sizeBytes: size!, etag: part.ETag }); last = n!;
          }
          if (!result.IsTruncated) return parts;
          const next = result.NextPartNumberMarker;
          if (!current.length || next !== String(last) || last >= session.partCount || next === marker) {
            throw new StorageError('INVALID_RESPONSE');
          }
          marker = next;
        }
        throw new StorageError('INVALID_RESPONSE');
      });
    } catch (error) { throw mapMultipartError(error); }
  }

  async completeMultipart(input: Parameters<MultipartStorage['completeMultipart']>[0]) {
    const session = this.multipartSession(input);
    if (!Array.isArray(input.parts) || input.parts.length !== session.partCount) throw new StorageError('INVALID_ARGUMENT');
    // Copy the frozen manifest before the first await, including opaque ETags. Never use ETag as SHA-256.
    const parts = input.parts.map((part, i) => {
      if (!part || part.partNumber !== i + 1 || part.sizeBytes !== this.partBytes(session, i + 1) || !this.validEtag(part.etag)) {
        throw new StorageError('INVALID_ARGUMENT');
      }
      return { PartNumber: part.partNumber, ETag: part.etag };
    });
    const command = new CompleteMultipartUploadCommand({ Bucket: this.config.storage.bucket, Key: session.key,
      UploadId: session.uploadId, IfNoneMatch: '*', MultipartUpload: { Parts: parts } });
    return this.multipartMutation(input.signal, async (abortSignal, assertLive, dispatch) => {
      dispatch();
      const result = await this.writeClient.send(command, { abortSignal });
      assertLive();
      // SDK rejects embedded XML errors even when the HTTP status was 200; no raw HTTP success fallback.
      if (result.$metadata?.httpStatusCode !== 200 || 'Error' in result || result.Bucket !== this.config.storage.bucket ||
          result.Key !== session.key || !this.validEtag(result.ETag) ||
          (result.VersionId !== undefined && (!this.validUploadId(result.VersionId) || result.VersionId.length > 1024))) {
        throw new StorageError('INVALID_RESPONSE');
      }
      return { etag: result.ETag, ...(result.VersionId === undefined ? {} : { versionId: result.VersionId }) };
    });
  }

  async abortMultipart(input: Parameters<MultipartStorage['abortMultipart']>[0]) {
    assertOriginalKey(input.key);
    if (!this.validUploadId(input.uploadId)) throw new StorageError('INVALID_ARGUMENT');
    const command = new AbortMultipartUploadCommand({ Bucket: this.config.storage.bucket, Key: input.key, UploadId: input.uploadId });
    return this.multipartMutation(input.signal, async (abortSignal, assertLive, dispatch) => {
      dispatch();
      const result = await this.writeClient.send(command, { abortSignal });
      assertLive();
      if (result.$metadata?.httpStatusCode !== 204) throw new StorageError('INVALID_RESPONSE');
      return { writeClosureEvidence: 'unproven' as const };
    });
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
