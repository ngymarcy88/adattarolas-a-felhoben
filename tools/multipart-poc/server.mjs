// Opt-in local experiment. Never imported by Nest, Vue app, Compose or CI.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer as createViteServer } from 'vite';
import { PocStorage, PART_SIZE, sha256 } from './storage.mjs';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sharp = require('sharp');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf('=');
  if (!arg.startsWith('--') || index < 0) throw new Error('Use --name=value arguments');
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
if (!args['minio-binary']) throw new Error('Pass --minio-binary=/absolute/path/to/minio; isolated instance only');
const root = fileURLToPath(new URL('.', import.meta.url));
const origin = 'http://127.0.0.1:5180';
const endpoint = 'http://127.0.0.1:19000';
const dataDir = await mkdtemp(join(tmpdir(), 'cloudvault-multipart-'));
const credentials = { accessKeyId: randomBytes(16).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') };
const child = spawn(args['minio-binary'], ['server', dataDir, '--address', '127.0.0.1:19000', '--console-address', '127.0.0.1:19001'], {
  env: { ...process.env, MINIO_ROOT_USER: credentials.accessKeyId, MINIO_ROOT_PASSWORD: credentials.secretAccessKey,
    MINIO_API_CORS_ALLOW_ORIGIN: origin, MINIO_BROWSER: 'off' }, stdio: 'ignore',
});
let childError = false;
child.once('error', () => { childError = true; });
const storage = new PocStorage({ endpoint, region: 'us-east-1', credentials }, `poc-${randomUUID()}`);
let vite, server, finishing = false;
const cases = new Map();
const report = { date: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: { node: process.version, minio: execFileSync(args['minio-binary'], ['--version'], { encoding: 'utf8' }).trim(),
    minioBinarySha256: sha256(await readFile(args['minio-binary'])),
    platform: 'WSL Linux; isolated native MinIO, no Docker/application DB',
    uppyCore: '6.3.0', uppyAwsS3: '6.3.0', partSizeBytes: PART_SIZE },
  measurement: 'Application payload bytes: interrupted Node HTTP request.write callbacks plus successful browser PUT Blob sizes. Not TCP traffic or MinIO partial-byte telemetry.', cases: [],
  open: ['Small-file intra-part resume', 'Production auth/quota/expiry/cleanup integration', 'Backend/MinIO restart and actual page-refresh recovery', '10/50-image comparative measurements'],
};
report.sourceSha256 = Object.fromEntries(await Promise.all(['server.mjs', 'storage.mjs', 'client.mjs', 'index.html']
  .map(async (name) => [name, sha256(await readFile(join(root, name)))])));
report.dependencyLockSha256 = sha256(await readFile(new URL('../../package-lock.json', import.meta.url)));
async function finish(success) {
  if (finishing) return;
  finishing = true;
  try { await storage.cleanup(); report.cleanup = 'PASS: synthetic multipart sessions, objects and dedicated bucket removed'; }
  catch { success = false; report.cleanup = 'FAIL: investigate isolated data directory; not quota-release evidence'; }
  await vite?.close();
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  child.kill('SIGTERM');
  await new Promise((resolve) => { if (child.exitCode !== null || childError) resolve(); else child.once('exit', resolve); });
  if (success) await rm(dataDir, { recursive: true, force: true });
  report.status = success ? 'PASS' : 'FAIL';
  if (args.report) await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = success ? 0 : 1;
}
process.once('SIGINT', () => void finish(false));
process.once('SIGTERM', () => void finish(false));
const timeout = setTimeout(() => void finish(false), 10 * 60 * 1000);
timeout.unref();
async function png(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 123456789;
  for (let i = 0; i < pixels.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
}
async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 32768) throw new Error('Body limit'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function reply(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
try {
  let healthy = false;
  for (let i = 0; i < 100 && !childError && child.exitCode === null; i++) {
    try { healthy = (await fetch(`${endpoint}/minio/health/live`)).ok; } catch {}
    if (healthy) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(healthy, 'isolated MinIO startup failed (port collision or invalid binary)');
  await storage.create();
  for (const [name, width, prefix] of [['small', 256, 65536], ['large', 2200, 1048576]]) {
    const bytes = await png(width, width);
    const session = await storage.start(`synthetic/${name}.png`);
    const retainedCount = bytes.length > PART_SIZE ? 1 : 0;
    if (retainedCount) await storage.put(session, 1, bytes.subarray(0, PART_SIZE));
    const interruptedPart = retainedCount + 1;
    const interrupted = await storage.interrupt(session, interruptedPart,
      bytes.subarray(retainedCount * PART_SIZE, (retainedCount + 1) * PART_SIZE), prefix);
    const parts = await storage.list(session);
    assert.equal(parts.length, retainedCount);
    if (retainedCount) assert.equal(parts[0].Size, PART_SIZE);
    await storage.assertNotPublished(session);
    cases.set(name, { name, session, bytes, retainedCount, interruptedPart, interrupted, before: parts });
    console.log(`PREPARED ${name}: ${bytes.length} bytes; completed parts=${parts.length}; incomplete payload=${interrupted}`);
  }
  vite = await createViteServer({ root, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, fs: { strict: true } }, appType: 'custom' });
  server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== '127.0.0.1:5180') return reply(response, 403, { code: 'LOCAL_ONLY' });
      if (request.method === 'POST' && request.headers.origin !== origin) return reply(response, 403, { code: 'ORIGIN_REQUIRED' });
      const path = new URL(request.url, origin).pathname;
      if (path === '/poc/inputs' && request.method === 'GET') return reply(response, 200,
        [...cases.values()].map((c) => ({ name: c.name, ...c.session, partSize: PART_SIZE })));
      if (path.startsWith('/poc/image/') && request.method === 'GET') {
        const c = cases.get(path.slice('/poc/image/'.length));
        if (!c) return reply(response, 404, {});
        response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); return response.end(c.bytes);
      }
      if (path === '/poc/sign' && request.method === 'POST') {
        const { name, request: signing } = await body(request);
        const c = cases.get(name);
        if (!c || signing?.key !== c.session.key || signing.uploadId !== c.session.uploadId ||
          !['GET', 'PUT', 'POST'].includes(signing.method) ||
          (signing.method === 'PUT' && (!Number.isInteger(signing.partNumber) || signing.partNumber < 1 || signing.partNumber > Math.ceil(c.bytes.length / PART_SIZE)))) {
          return reply(response, 403, { code: 'OUTSIDE_POC_SESSION' });
        }
        if (signing.method === 'POST') {
          c.finalParts = await storage.list(c.session);
          assert.equal(c.finalParts.length, Math.ceil(c.bytes.length / PART_SIZE));
          if (c.retainedCount) assert.equal(c.finalParts[0].ETag, c.before[0].ETag);
        }
        return reply(response, 200, await storage.sign(c.session, signing));
      }
      if (path === '/poc/result' && request.method === 'POST') {
        const result = await body(request);
        report.observedBrowserRequests = result.results.map((r) => ({ name: r.name,
          attempts: r.attempts.map((a) => ({ method: a.method, partNumber: a.partNumber, sizeBytes: a.sizeBytes, status: a.status })) }));
        assert.equal(result.results.length, cases.size);
        for (const c of cases.values()) {
          const observed = result.results.filter((r) => r.name === c.name);
          assert.equal(observed.length, 1);
          const attempts = observed[0].attempts;
          const puts = attempts.filter((a) => a.method === 'PUT');
          const expectedNumbers = Array.from({ length: Math.ceil(c.bytes.length / PART_SIZE) - c.retainedCount }, (_, i) => i + 1 + c.retainedCount);
          assert.deepEqual(puts.map((a) => a.partNumber), expectedNumbers);
          assert.ok(attempts.some((a) => a.method === 'GET' && a.status === 200));
          assert.ok(attempts.some((a) => a.method === 'POST' && a.status === 200));
          assert.ok(puts.every((a) => a.status === 200));
          const resumedBytes = puts.reduce((sum, a) => sum + a.sizeBytes, 0);
          assert.equal(resumedBytes, c.bytes.length - c.retainedCount * PART_SIZE);
          const verified = await storage.verify(c.session, c.bytes);
          const metadata = await sharp(c.bytes).metadata();
          report.cases.push({ name: c.name, width: metadata.width, height: metadata.height, ...verified,
            interruptedPart: c.interruptedPart, completedPartsBeforeResume: c.before.map((p) => ({ partNumber: p.PartNumber, sizeBytes: p.Size })),
            incompletePartAbsent: true, objectAbsentBeforeComplete: true, retainedETagUnchanged: c.retainedCount ? true : null,
            initialCompletedPayloadBytes: c.retainedCount * PART_SIZE, interruptedPayloadBytes: c.interrupted,
            browserResumedPayloadBytes: resumedBytes, totalPayloadBytes: c.bytes.length + c.interrupted,
            redundantPayloadBytes: c.interrupted, browserAttempts: attempts,
            finalHashMatches: true, completedPartsNotResent: true });
        }
        delete report.observedBrowserRequests;
        report.environment.browser = typeof result.userAgent === 'string' ? result.userAgent.slice(0, 250) : 'unknown';
        reply(response, 200, { status: 'PASS', cases: report.cases.map((c) => ({ name: c.name, sha256: c.sha256, redundantPayloadBytes: c.redundantPayloadBytes })) });
        setTimeout(() => void finish(true), 300);
        return;
      }
      if (path === '/poc/failure' && request.method === 'POST') {
        reply(response, 200, { status: 'FAIL' }); setTimeout(() => void finish(false), 300); return;
      }
      if (request.method === 'GET' && path === '/') {
        const html = await vite.transformIndexHtml('/', await readFile(join(root, 'index.html'), 'utf8'));
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end(html); return;
      }
      vite.middlewares(request, response, () => reply(response, 404, {}));
    } catch { reply(response, 500, { code: 'POC_CHECK_FAILED' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5180, '127.0.0.1', resolve); });
  console.log(`READY ${origin}/?auto=1 (10-minute deadline; do not use real files/accounts)`);
} catch { console.error('FAIL PoC setup; no credentials, raw provider errors or access URLs logged.'); await finish(false); }
