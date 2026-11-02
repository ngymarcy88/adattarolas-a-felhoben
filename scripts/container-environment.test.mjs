import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { containerDatabaseUrl } from './container-environment.mjs';

test('rewrites the container address while preserving encoded credentials and schema', () => {
  assert.equal(containerDatabaseUrl('postgresql://user:p%40ss%3Aword@127.0.0.1:5433/db?schema=public'),
    'postgresql://user:p%40ss%3Aword@postgres:5432/db?schema=public');
});
test('rejects missing, malformed and non-PostgreSQL configuration without exposing secrets', () => {
  for (const value of [undefined, '', 'invalid', 'mysql://u:private@host/db', 'postgresql://host/db']) {
    assert.throws(() => containerDatabaseUrl(value), { message: 'Invalid DATABASE_URL for container startup' });
  }
});

// Parse only the static policy template; never resolve environment credentials.
test('grants multipart discovery on the private bucket and part control only on originals', () => {
  const script = readFileSync(new URL('../infra/minio/init.sh', import.meta.url), 'utf8');
  const template = script.match(/printf '([^']+)'[^\n]+application-policy\.json/)[1];
  const policy = JSON.parse(template.replaceAll('%s', 'unit-bucket'));
  const resources = action => policy.Statement.filter(s => s.Action.includes(action)).flatMap(s => s.Resource);
  assert.deepEqual(resources('s3:ListBucketMultipartUploads'), ['arn:aws:s3:::unit-bucket']);
  for (const action of ['s3:ListMultipartUploadParts', 's3:AbortMultipartUpload']) {
    assert.deepEqual(resources(action), ['arn:aws:s3:::unit-bucket/originals/*']);
  }
  assert.match(script, /mc anonymous set none/);
});
