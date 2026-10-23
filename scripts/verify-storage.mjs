// Explicit manual provider probe, outside the unit suite. Only synthetic, random keys are touched.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url), quiet: true });
const { validateEnvironment } = require('./dist/config/environment.js');
const { S3StorageAdapter } = require('./dist/storage/s3-storage.adapter.js');
const config = validateEnvironment(process.env);
const adapter = new S3StorageAdapter(config);
const keys = Array.from({ length: 4 }, () => `originals/${randomUUID()}/${randomUUID()}`);
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const deadline = () => new Date(Date.now() + 60_000);
const check = (name) => console.log(`PASS ${name}`);
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
const put = (access, body = bytes, headers = access.headers) => request(access.url, { method: 'PUT', headers, body: new Blob([body]) });
let failure = false;
try {
  assert.equal(await adapter.head(keys[0]), null); check('missing object in existing bucket');
  const unavailable = new S3StorageAdapter({ ...config, storage: { ...config.storage, bucket: `absent-${randomUUID()}` } });
  try { await assert.rejects(unavailable.head(keys[0]), { code: 'UNAVAILABLE' }); }
  finally { unavailable.onModuleDestroy(); }
  check('missing/inaccessible bucket never reported as object absence');
  const access = await adapter.createUploadAccess({ key: keys[0], mimeType: 'image/png', sizeBytes: bytes.length, expiresAt: deadline() });
  assert.equal((await put(access)).status, 200); check('presigned Blob PUT with automatically supplied Content-Length');
  assert.equal((await put(access, Buffer.alloc(bytes.length))).status, 412); check('replayed PUT cannot overwrite');
  const head = await adapter.head(keys[0]);
  assert.equal(head.sizeBytes, bytes.length);
  assert.deepEqual(Buffer.from(await adapter.readPrefix(keys[0], head, 8)), bytes.subarray(0, 8)); check('HEAD and bounded conditional range read');
  for (const [index, mutation] of [[1, 'size'], [2, 'content-type'], [3, 'if-none-match']]) {
    const signed = await adapter.createUploadAccess({ key: keys[index], mimeType: 'image/png', sizeBytes: bytes.length, expiresAt: deadline() });
    const response = mutation === 'size' ? await put(signed, Buffer.concat([bytes, Buffer.from([0])]))
      : await put(signed, bytes, mutation === 'content-type' ? { ...signed.headers, 'Content-Type': 'image/jpeg' } : { 'Content-Type': 'image/png' });
    assert.ok([400, 403].includes(response.status), `expected signature rejection for ${mutation}, got ${response.status}`); assert.equal(await adapter.head(keys[index]), null); check(`signature rejects changed ${mutation}`);
  }
  const read = await adapter.createReadAccess({ key: keys[0], mimeType: 'image/png', originalName: 'árvíz.png', disposition: 'attachment', expiresAt: deadline() });
  const downloaded = await request(read.url);
  assert.equal(downloaded.status, 200); assert.match(downloaded.headers.get('content-disposition'), /^attachment;.*filename\*=UTF-8''/);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes); check('signed download and safe response headers');
  const anonymous = new URL(read.url); anonymous.search = '';
  assert.equal((await request(anonymous)).status, 403); check('private bucket rejects anonymous read');
  const preflight = await request(access.url, { method: 'OPTIONS', headers: { Origin: config.frontendPublicUrl,
    'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,if-none-match' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), config.frontendPublicUrl);
  assert.ok(preflight.headers.get('access-control-allow-methods')?.split(/,\s*/).includes('PUT'));
  const allowedHeaders = preflight.headers.get('access-control-allow-headers')?.toLowerCase().split(/,\s*/) ?? [];
  assert.ok(allowedHeaders.includes('*') || ['content-type', 'if-none-match'].every((value) => allowedHeaders.includes(value)));
  check('CORS preflight (HTTP probe, not browser evidence)');
  assert.equal(adapter.writeClosureEvidence, 'unproven');
  console.log('OPEN in-flight write closure; no reservation-release proof is claimed.');
} catch { failure = true; console.error('FAIL provider probe; inspect local configuration/service without logging capabilities or credentials.'); }
finally {
  for (const key of keys) {
    try { await adapter.deleteObject(key); await adapter.deleteObject(key); assert.equal(await adapter.head(key), null); }
    catch { failure = true; console.error('FAIL synthetic-object cleanup; rerun probe only after investigating storage.'); }
  }
  adapter.onModuleDestroy();
}
process.exitCode = failure ? 1 : 0;
