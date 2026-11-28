import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { crc32 } from 'node:zlib';
import pg from 'pg';

const [mode, scenario, fixture, output] = process.argv.slice(2);
assert(['restart', 'tus'].includes(mode) && ['normal', 'interrupted'].includes(scenario) && fixture && output,
  'Usage: node scripts/benchmark-upload-ten.mjs restart|tus normal|interrupted source.png result.json');
const origin = 'http://127.0.0.1:5173';
const minio = 'http://127.0.0.1:9000';
const apiBase = origin + '/api/v1';
const interruptedPrefix = 96 * 1024;
const chunkSize = 16 * 1024;
const chunkDelayMs = 10;
const outageDelayMs = 1000;
const socketDrainMs = 120;
const processingPollMs = 1500;
const processingDeadlineMs = 150_000;
const processors = new Set(['SUCCEEDED', 'FAILED']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

const source = await readFile(fixture);
const iend = source.length - 12;
assert(source.subarray(iend + 4, iend + 8).equals(Buffer.from('IEND')) && source.length > interruptedPrefix && source.length < 5 * 1024 * 1024 - 64);
const inputs = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;
  const text = Buffer.from('test\0fixture-' + number);
  const data = Buffer.concat([Buffer.from('tEXt'), text]);
  const chunk = Buffer.alloc(data.length + 8);
  chunk.writeUInt32BE(text.length);
  data.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(data), chunk.length - 4);
  const damaged = number === 10;
  const bytes = damaged ? source.subarray(0, 48) : Buffer.concat([source.subarray(0, iend), chunk, source.subarray(iend)]);
  return { number, name: 'benchmark-' + String(number).padStart(2, '0') + '.png', bytes,
    sha256: digest(bytes), expectedProcessing: damaged ? 'FAILED' : 'SUCCEEDED' };
});

const accountName = 'Upload benchmark ' + randomUUID();
const credentials = { email: 'bench-' + randomUUID() + '@example.test', password: 'Bench!' + randomUUID() };
let cookie;
async function api(path, { method = 'GET', body, key, statuses = [200], headers = {} } = {}) {
  const response = await fetch(apiBase + path, { method, headers: {
    Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(key ? { 'Idempotency-Key': key } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers,
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' });
  const data = method === 'HEAD' ? null : await response.json().catch(() => null);
  assert(statuses.includes(response.status), 'Unexpected ' + method + ' response: ' + response.status + ' ' + (data?.error?.code ?? ''));
  return { response, data };
}

async function authenticate(path, body, expected) {
  const first = await api(path, { method: 'POST', body, statuses: [expected, 429] });
  if (first.response.status === expected) return first.response;
  const retry = Number(first.response.headers.get('retry-after'));
  await delay((retry > 0 && retry <= 60 ? retry : 60) * 1000);
  return (await api(path, { method: 'POST', body, statuses: [expected] })).response;
}

function send(address, method, headers, bytes, from, stopAt) {
  const url = new URL(address);
  assert.equal(url.origin, method === 'PUT' ? minio : origin);
  return new Promise((resolve, reject) => {
    let interrupting = false;
    const req = request(url, { method, headers: { ...headers, 'Content-Length': bytes.length - from } }, response => {
      response.resume();
      response.once('end', () => {
        const expected = method === 'PUT' ? 200 : 204;
        if (stopAt !== bytes.length || response.statusCode !== expected) reject(Error('Unexpected binary HTTP ' + response.statusCode));
        else resolve();
      });
      response.once('error', () => reject(Error('Binary response failed')));
    });
    req.on('error', () => interrupting ? resolve() : reject(Error('Binary upload failed')));
    req.setTimeout(15000, () => req.destroy(Error('Binary upload timed out')));
    void (async () => {
      for (let offset = from; offset < stopAt; offset += chunkSize) {
        const block = bytes.subarray(offset, Math.min(stopAt, offset + chunkSize));
        await new Promise((done, failed) => req.write(block, error => error ? failed(error) : done()));
        await delay(chunkDelayMs);
      }
      if (stopAt === bytes.length) req.end();
      else {
        await delay(socketDrainMs);
        interrupting = true;
        req.destroy(Error('Controlled connection loss'));
      }
    })().catch(() => { req.destroy(); reject(Error('Binary write failed')); });
  });
}

async function complete(path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { response } = await api(path, { method: 'POST', body, statuses: [200, 202, 429] });
    if (response.status === 200) return;
    const retry = Number(response.headers.get('retry-after'));
    await delay((retry > 0 && retry <= 60 ? retry : 2) * 1000);
  }
  throw Error('Finalization remained pending');
}

async function upload(input, importId) {
  const { data: { item } } = await api('/imports/' + importId + '/files', {
    method: 'POST', key: randomUUID(), statuses: [201],
    body: { clientFileId: randomUUID(), originalName: input.name, mimeType: 'image/png', sizeBytes: input.bytes.length, contentSha256: input.sha256 },
  });
  assert.equal(item.transfer.tusStaged === true, mode === 'tus', 'Compose mode and transfer disagree');
  assert.equal(item.transfer.partCount, 1);
  const transfer = '/transfers/' + item.transfer.id;
  const stage = '/tus/' + item.transfer.id;
  const tus = { 'Tus-Resumable': '1.0.0' };
  const interrupted = scenario === 'interrupted' && input.number <= 2;
  let retained = 0;
  if (mode === 'tus') {
    await api(stage + '/prepare', { method: 'POST', body: {} });
    const patch = (start, end) => send(apiBase + stage, 'PATCH', {
      ...tus, Origin: origin, Cookie: cookie, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(start),
    }, input.bytes, start, end);
    if (interrupted) {
      await patch(0, interruptedPrefix);
      await delay(outageDelayMs);
      const { response } = await api(stage, { method: 'HEAD', headers: tus });
      retained = Number(response.headers.get('upload-offset'));
      assert.equal(retained, interruptedPrefix, 'Unexpected stored tus offset');
    }
    await patch(retained, input.bytes.length);
    await complete(stage + '/complete', {});
  } else {
    const put = async stopAt => {
      const { data: grant } = await api(transfer + '/parts/1/sign', { method: 'POST', body: {} });
      await send(grant.url, 'PUT', grant.headers, input.bytes, 0, stopAt);
    };
    if (interrupted) {
      await put(interruptedPrefix);
      await delay(outageDelayMs);
      const { data } = await api(transfer + '/resume', { method: 'POST', body: { sizeBytes: input.bytes.length, contentSha256: input.sha256 } });
      retained = data.transfer.completedBytes;
      assert.equal(retained, 0, 'Unexpected complete S3 part');
    }
    await put(input.bytes.length);
    await complete(transfer + '/complete', {});
  }
  await complete('/files/' + item.fileId + '/confirm');
  return { fileId: item.fileId, prefixSent: interrupted ? interruptedPrefix : 0, retained,
    sent: input.bytes.length + (interrupted ? interruptedPrefix - retained : 0) };
}

async function verifyCommittedInputs() {
  process.loadEnvFile();
  const database = new URL(process.env.DATABASE_URL);
  assert(['127.0.0.1', 'localhost'].includes(database.hostname), 'Benchmark DB must be local');
  const db = new pg.Client({ connectionString: database.toString(), connectionTimeoutMillis: 5000 });
  try {
    await db.connect();
    const { rows } = await db.query(`SELECT u."usedStorageBytes"::text AS used, u."reservedStorageBytes"::text AS reserved,
      f."originalName" AS name, f.status AS state, f."sizeBytes"::text AS size, t."verifiedSha256" AS sha256,
      j.state AS processing, j."lastErrorCode" AS "processingError", COALESCE(d."sizeBytes",0)::text AS derived,
      (SELECT count(*)::int FROM "AuditEvent" a WHERE a."resourceId"=f.id AND a.action='UPLOAD_CONFIRMED') AS confirms
      FROM "User" u JOIN "FileObject" f ON f."ownerId"=u.id JOIN "MultipartTransfer" t ON t."fileObjectId"=f.id
      JOIN "ProcessingJob" j ON j."fileObjectId"=f.id LEFT JOIN "DerivedObject" d ON d."jobId"=j.id
      WHERE u."displayName"=$1 ORDER BY f."originalName"`, [accountName]);
    assert.equal(rows.length, inputs.length);
    const derivedBytes = rows.reduce((sum, row) => sum + Number(row.derived), 0);
    const total = inputs.reduce((sum, input) => sum + input.bytes.length, 0);
    for (const [index, row] of rows.entries()) {
      const input = inputs[index];
      assert.deepEqual([row.name, row.state, Number(row.size), row.sha256, row.processing, row.confirms],
        [input.name, 'ACTIVE', input.bytes.length, input.sha256, input.expectedProcessing, 1], 'Database file/processing mismatch for ' + input.name);
      assert.equal(Number(row.used), total + derivedBytes);
      assert.equal(Number(row.reserved), 0);
      if (input.expectedProcessing === 'FAILED') assert.equal(row.processingError, 'PROCESSOR_INPUT_INVALID');
    }
    return { originals: rows.length, originalBytes: total, derivedBytes, usedBytes: total + derivedBytes, reservedBytes: 0 };
  } finally {
    await db.end();
  }
}

try {
  await authenticate('/auth/register', { ...credentials, displayName: accountName }, 201);
  const login = await authenticate('/auth/login', credentials, 200);
  cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  assert(cookie, 'Missing authentication cookie');
  const begin = performance.now();
  const { data } = await api('/imports', { method: 'POST', body: {}, key: randomUUID(), statuses: [201] });
  const parallel = [inputs.filter((_, i) => i % 2 === 0), inputs.filter((_, i) => i % 2 === 1)];
  const lanes = await Promise.all(parallel.map(async files => {
    const results = [];
    for (const input of files) results.push(await upload(input, data.import.id));
    return results;
  }));
  const uploaded = inputs.map((_, i) => lanes[i % 2][Math.floor(i / 2)]);
  const originalsMs = Math.round(performance.now() - begin);
  let items;
  const processingDeadline = performance.now() + processingDeadlineMs;
  do {
    ({ data: { items } } = await api('/files/processing/status', { method: 'POST', body: { fileIds: uploaded.map(item => item.fileId) } }));
    if (items.length === inputs.length && items.every(item => processors.has(item.state))) break;
    await delay(processingPollMs);
  } while (performance.now() < processingDeadline);
  const totalMs = Math.round(performance.now() - begin);
  assert.equal(items.length, inputs.length);
  assert(items.every(item => processors.has(item.state)), 'Processing deadline reached: ' + items.map(item => item.state).join(','));
  for (const [index, item] of uploaded.entries()) {
    const { data: { url } } = await api('/files/' + item.fileId + '/download-url');
    assert.equal(new URL(url).origin, minio);
    const object = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    assert.equal(object.status, 200);
    assert.equal(digest(Buffer.from(await object.arrayBuffer())), inputs[index].sha256, 'Stored bytes differ');
  }
  const db = await verifyCommittedInputs();
  const rows = inputs.map((input, i) => ({ name: input.name, size: input.bytes.length, sha256: input.sha256,
    prefixSent: uploaded[i].prefixSent, retained: uploaded[i].retained, sent: uploaded[i].sent, processing: items.find(item => item.fileId === uploaded[i].fileId)?.state }));
  const result = { mode, scenario, originalsMs, totalMs, sentBytes: rows.reduce((sum, row) => sum + row.sent, 0),
    resentBytes: rows.reduce((sum, row) => sum + row.prefixSent - row.retained, 0), db, rows };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ mode, scenario, originalsMs, totalMs, sentBytes: result.sentBytes, resentBytes: result.resentBytes, ...db }));
} catch (error) {
  console.error('Benchmark failed: ' + (error instanceof assert.AssertionError ? error.message.split('\n')[0] : error.message).slice(0, 160));
  process.exitCode = 1;
}
