import { test } from 'node:test';
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
