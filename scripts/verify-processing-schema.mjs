/** Opt-in schema verification: disposable PostgreSQL only, no application DB or storage access. */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const backend = resolve(root, 'backend');
const docker = process.env.CLOUDVAULT_DOCKER_CLI || 'docker';
const name = `cloudvault-schema-check-${randomUUID()}`;
const multipart = process.argv.includes('--multipart');
const migration = '20261101000100_multipart_import_model';
const directory = resolve(backend, 'prisma/migrations');
const migrations = readdirSync(directory).filter(value => /^\d/.test(value)).sort();
if (migrations.at(-1) !== migration) throw new Error('Update this verifier before testing later migrations.');
const fixture = readFileSync(resolve(backend, `prisma/verification/${multipart ? 'multipart-model' : 'processing-model'}.sql`), 'utf8');
const parts = fixture.split('-- @after-migration');
if (parts.length !== 2) throw new Error('Missing fixture boundary.');
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', timeout: 180_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${args[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
const dockerRun = (...args) => run(docker, args);
const sql = (statement, database = 'postgres') => run(docker, ['exec', '-i', name, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], { input: statement });
let url;
function prisma(args, database = 'postgres') {
  // Synthetic disposable URL overrides dotenv without reading/logging the application's credentials.
  const datasource = new URL(url); datasource.pathname = `/${database}`;
  return run(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), ...args], {
    cwd: backend, env: { ...process.env, DATABASE_URL: datasource.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
function legacySnapshot() {
  return ['User', 'FileObject', 'UploadOperation', 'ShareLink', 'AuditEvent', 'ProcessingJob', 'ProcessingAttempt', 'DerivedObject'].map(table =>
    sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) - 'uploadTransport' ORDER BY id)::text, '[]')) FROM "${table}" t;`)).join(':');
}
let started = false;
try {
  dockerRun('run', '-d', '--rm', '--pull=never', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17.9-bookworm');
  started = true;
  const until = Date.now() + 30_000;
  while (true) {
    const ready = spawnSync(docker, ['exec', name, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8', timeout: 5000 });
    if (ready.status === 0) break;
    if (Date.now() > until) throw new Error('Disposable PostgreSQL did not become ready.');
    await new Promise(done => setTimeout(done, 500));
  }
  const port = dockerRun('port', name, '5432/tcp').match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error('Expected a loopback-only disposable port.');
  url = `postgresql://postgres@127.0.0.1:${port}/postgres?schema=public`;
  // Upgrade path: existing migrations + synthetic pending/active data, then real migrate deploy.
  console.log('Starting isolated upgrade check (Prisma CLI on /mnt/c can be slow).');
  for (const previous of migrations.slice(0, -1)) {
    sql(readFileSync(resolve(directory, previous, 'migration.sql'), 'utf8'));
    prisma(['migrate', 'resolve', '--applied', previous]);
  }
  sql(parts[0]);
  const before = legacySnapshot();
  console.log('Applying the additive multipart migration through Prisma migrate deploy.');
  prisma(['migrate', 'deploy']);
  if (legacySnapshot() !== before) throw new Error('Legacy data or quota counters changed during migration.');
  console.log('PASS upgrade migration: legacy rows, pending reservation and counters unchanged.');
  if (sql(`SELECT count(*) FROM "FileObject" WHERE "uploadTransport" <> 'SINGLE_PUT';`) !== '0') throw new Error('Legacy transport default changed.');
  const output = sql(parts[1]);
  const actual = Number(output.match(/SCHEMA_ASSERTIONS_PASS=(\d+)/)?.[1]);
  const expected = (parts[1].match(/SELECT pg_temp\.expect_sql/g) || []).length;
  if (actual !== expected || expected === 0) throw new Error('Schema assertions did not all execute.');
  if (legacySnapshot() !== before) throw new Error('Verification transaction did not roll back.');
  console.log(`PASS ${actual} real PostgreSQL constraint cases; verification fixtures rolled back.`);
  prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
  prisma(['migrate', 'status']);
  console.log('PASS upgrade schema matches Prisma; migration history is current (CHECK semantics tested separately).');
  // Use the freshly generated/built client, not a mock, to check @updatedAt/default(now()) compatibility.
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require(resolve(backend, 'dist/generated/prisma/client.js'));
  const { PrismaPg } = require('@prisma/adapter-pg');
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5000 }) });
  const rollback = new Error('Rollback verification client writes');
  try {
    await client.$transaction(async tx => {
      const ownerId = '20000000-0000-4000-8000-000000000001';
      const fileObjectId = '20000000-0000-4000-8000-000000000011';
      if (!tx.processingJob) throw new Error('Build the backend with the current generated Prisma Client before verification.');
      const job = await tx.processingJob.create({ data: { ownerId, fileObjectId, processorKey: 'thumbnail',
        processorVersion: '9.0.0', implementationFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64) } });
      const id = randomUUID();
      const attempt = await tx.processingAttempt.create({ data: { id, jobId: job.id, ownerId, fileObjectId, fence: 1n, ordinal: 1,
        candidateKey: `derived/${ownerId}/${fileObjectId}/${job.id}/${id}.webp` } });
      if (multipart) {
        const now = new Date(); const expiresAt = new Date(+now + 3600000); const replayUntil = new Date(+expiresAt + 86400000);
        const imported = await tx.importSession.create({ data: { ownerId, idempotencyKey: randomUUID(), requestFingerprint: 'v1:'+'c'.repeat(64),
          expiresAt, replayUntil, acceptedFileCount: 1, nextOrdinal: 2 } });
        const file = await tx.fileObject.create({ data: { ownerId, originalName: 'schema.png', storageKey: `synthetic/${randomUUID()}`,
          mimeType: 'image/png', sizeBytes: 2n, uploadTransport: 'MULTIPART', uploadUrlExpiresAt: null, confirmBy: expiresAt } });
        const operation = await tx.uploadOperation.create({ data: { ownerId, fileObjectId: file.id, uploadTransport: 'MULTIPART',
          idempotencyKey: randomUUID(), requestFingerprint: 'v2:'+'c'.repeat(64), replayUntil } });
        const item = await tx.importFile.create({ data: { importId: imported.id, ownerId, fileObjectId: file.id, clientFileId: randomUUID(), ordinal: 1 } });
        const transfer = await tx.multipartTransfer.create({ data: { importFileId: item.id, uploadOperationId: operation.id, fileObjectId: file.id,
          ownerId, sizeBytes: 2n, partCount: 1, contentSha256: 'c'.repeat(64), providerNamespace: 'synthetic-client', expiresAt } });
        await tx.multipartPart.create({ data: { transferId: transfer.id, partNumber: 1, expectedSizeBytes: 2 } });
        await tx.multipartIoOperation.create({ data: { transferId: transfer.id, kind: 'CREATE', attemptNo: 1, fence: 0n } });
        await tx.user.update({ where: { id: ownerId }, data: { reservedStorageBytes: { increment: 2n } } });
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
      }
      if (job.updatedAt < job.createdAt || attempt.updatedAt < attempt.createdAt) throw new Error('Prisma default timestamp order mismatch.');
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await client.$disconnect(); }
  if (legacySnapshot() !== before) throw new Error('Client verification writes did not roll back.');
  console.log('PASS real Prisma Client creates/default timestamps and rollback.');
  dockerRun('exec', name, 'createdb', '-U', 'postgres', 'fresh');
  prisma(['migrate', 'deploy'], 'fresh');
  prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], 'fresh');
  console.log('PASS fresh full migration chain and Prisma schema parity.');
  if (multipart) {
    const historical = readFileSync(resolve(backend, 'prisma/verification/processing-model.sql'), 'utf8').split('-- @after-migration');
    sql(historical[0], 'fresh');
    const legacyCases = sql(historical[1], 'fresh').match(/SCHEMA_ASSERTIONS_PASS=(\d+)/)?.[1];
    if (Number(legacyCases) !== (historical[1].match(/SELECT pg_temp\.expect_sql/g) || []).length) throw new Error('Processing SQL regression failed.');
    console.log(`PASS ${legacyCases} existing processing-model SQL regression cases on the final schema.`);
  }
} finally {
  if (started) dockerRun('stop', name); // --rm also removes this container's anonymous data volume.
}
