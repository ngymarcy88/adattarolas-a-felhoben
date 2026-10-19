import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Exclusive creation protects existing local credentials and persisted volumes.
const root = new URL('../', import.meta.url);
const template = await readFile(new URL('.env.example', root), 'utf8');
const replacements = {
  'change-me-generated-postgres-password': randomBytes(24).toString('hex'),
  'change-me-generated-jwt-secret': randomBytes(48).toString('hex'),
  'change-me-generated-minio-root-user': `root${randomBytes(8).toString('hex')}`,
  'change-me-generated-minio-root-password': randomBytes(32).toString('hex'),
  'change-me-generated-s3-access-key': `cv${randomBytes(10).toString('hex')}`,
  'change-me-generated-s3-secret-key': randomBytes(32).toString('hex'),
};
let content = template;
for (const [placeholder, value] of Object.entries(replacements)) {
  content = content.replaceAll(placeholder, value);
}
try {
  await writeFile(new URL('.env', root), content, { flag: 'wx', mode: 0o600 });
  console.log('Created local .env with generated credentials. Values are not printed.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('Existing .env preserved. Compare it with .env.example before starting.');
  } else {
    console.error('Could not create .env. Verify directory permissions.');
    process.exitCode = 1;
  }
}
