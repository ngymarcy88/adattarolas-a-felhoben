// Isolated PoC adapter. Production storage/accounting is deliberately not imported.
import { S3Client, CreateBucketCommand, CreateMultipartUploadCommand, UploadPartCommand,
  ListPartsCommand, CompleteMultipartUploadCommand, GetObjectCommand, HeadObjectCommand,
  DeleteObjectCommand, AbortMultipartUploadCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import http from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const PART_SIZE = 5 * 1024 * 1024;
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export class PocStorage {
  constructor(options, bucket) {
    this.client = new S3Client({ ...options, forcePathStyle: true, maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    this.bucket = bucket;
    this.sessions = [];
  }
  async create() { await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })); }
  input(session) { return { Bucket: this.bucket, Key: session.key, UploadId: session.uploadId }; }
  async start(key) {
    const result = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: 'image/png' }));
    const session = { key, uploadId: result.UploadId };
    this.sessions.push(session);
    return session;
  }
  async list(session) {
    const parts = [];
    let marker;
    do {
      const page = await this.client.send(new ListPartsCommand({ ...this.input(session), PartNumberMarker: marker }));
      parts.push(...(page.Parts ?? []));
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }
  async sign(session, request) {
    const input = this.input(session);
    const command = request.method === 'GET' ? new ListPartsCommand(input)
      : request.method === 'POST' ? new CompleteMultipartUploadCommand(input)
        : new UploadPartCommand({ ...input, PartNumber: request.partNumber });
    return { url: await getSignedUrl(this.client, command, { expiresIn: 120 }) };
  }
  async put(session, partNumber, bytes) {
    const { url } = await this.sign(session, { method: 'PUT', partNumber });
    const response = await fetch(url, { method: 'PUT', body: bytes, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'initial complete part PUT');
  }
  // Actual incomplete HTTP request, not a simulated failed SDK result. Never call end().
  // Count payload bytes passed through successful request.write callbacks, excluding HTTP/TCP overhead.
  async interrupt(session, partNumber, body, prefixBytes) {
    assert.ok(prefixBytes > 0 && prefixBytes < body.length);
    const { url } = await this.sign(session, { method: 'PUT', partNumber });
    return new Promise((resolve, reject) => {
      let written = 0;
      let deliberatelyAborted = false;
      const request = http.request(url, { method: 'PUT', headers: { 'content-length': body.length } });
      const timer = setTimeout(() => request.destroy(new Error('POC_TIMEOUT')), 15000);
      request.once('response', (response) => {
        response.resume();
        request.destroy(new Error('Unexpected response to incomplete body'));
      });
      request.once('error', (error) => { if (!deliberatelyAborted) reject(new Error('Incomplete PUT transport failed')); });
      request.once('close', () => {
        clearTimeout(timer);
        if (deliberatelyAborted) resolve(written);
      });
      request.write(body.subarray(0, prefixBytes), (error) => {
        if (error) { request.destroy(); reject(new Error('Incomplete PUT write failed')); return; }
        written = prefixBytes;
        setTimeout(() => { deliberatelyAborted = true; request.destroy(); }, 150);
      });
    });
  }
  async verify(session, expected) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: session.key }));
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    assert.equal(bytes.length, expected.length);
    assert.equal(sha256(bytes), sha256(expected));
    return { sizeBytes: bytes.length, sha256: sha256(bytes), mimeType: result.ContentType };
  }
  async assertNotPublished(session) {
    await assert.rejects(this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: session.key })),
      (error) => error.$metadata?.httpStatusCode === 404);
  }
  async cleanup() {
    let failed = false;
    for (const session of this.sessions) {
      try { await this.client.send(new AbortMultipartUploadCommand(this.input(session))); }
      catch (error) { if (error.name !== 'NoSuchUpload') failed = true; }
      try { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: session.key })); }
      catch { failed = true; }
    }
    try { await this.client.send(new DeleteBucketCommand({ Bucket: this.bucket })); }
    catch { failed = true; }
    this.client.destroy();
    if (failed) throw new Error('POC_CLEANUP_FAILED');
  }
}
