import { validateEnvironment } from '../src/config/environment';

const validEnvironment = (): Record<string, unknown> => ({
  BACKEND_PUBLIC_URL: 'http://localhost:3000',
  FRONTEND_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://local:unit-test-only@localhost:5432/cloudvault',
  JWT_SECRET: 'unit-test-value-with-at-least-32-characters',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'cloudvault',
  S3_ACCESS_KEY_ID: 'unit-test-access',
  S3_SECRET_ACCESS_KEY: 'unit-test-secret',
});

describe('validateEnvironment', () => {
  it('parses central typed config and documented defaults', () => {
    const config = validateEnvironment(validEnvironment());
    expect(config).toMatchObject({
      environment: 'local', port: 3000, jwtExpiresIn: '1h',
      maxUploadBytes: 104857600, presignedUrlTtlSeconds: 300,
      storage: { forcePathStyle: true },
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    });
  });

  it('accepts explicit valid values', () => {
    expect(validateEnvironment({ ...validEnvironment(), APP_ENV: 'test', BACKEND_PORT: '3001',
      S3_FORCE_PATH_STYLE: 'false', MAX_UPLOAD_BYTES: '1000', JWT_EXPIRES_IN: '30m' }))
      .toMatchObject({ environment: 'test', port: 3001, maxUploadBytes: 1000,
        jwtExpiresIn: '30m', storage: { forcePathStyle: false } });
  });

  it('allows a configured safe subset and trims separator whitespace', () => {
    expect(validateEnvironment({ ...validEnvironment(), ALLOWED_MIME_TYPES: 'image/png, video/mp4' })
      .allowedMimeTypes).toEqual(['image/png', 'video/mp4']);
  });

  it.each(['', ' ', 'image/svg+xml', 'image/png,text/html', 'image/png,', 'image/png,image/png'])
    ('rejects unsafe, empty or duplicate MIME allowlists: %s', (value) => {
      expect(() => validateEnvironment({ ...validEnvironment(), ALLOWED_MIME_TYPES: value }))
        .toThrow('Invalid configuration variables: ALLOWED_MIME_TYPES');
    });

  it.each([
    ['APP_ENV', 'development'], ['BACKEND_PORT', '0'], ['BACKEND_PORT', '65536'],
    ['BACKEND_PORT', '3000.5'], ['BACKEND_PORT', '3e3'], ['MAX_UPLOAD_BYTES', '104857601'],
    ['MAX_UPLOAD_BYTES', '-1'], ['PRESIGNED_URL_TTL_SECONDS', '301'],
    ['S3_FORCE_PATH_STYLE', 'yes'], ['JWT_SECRET', 'short'],
    ['JWT_SECRET', 'replace-with-a-very-long-and-unique-secret'],
    ['JWT_EXPIRES_IN', 'forever'], ['DATABASE_URL', 'mysql://user:pass@localhost/db'],
    ['DATABASE_URL', 'postgresql://localhost/db'], ['DATABASE_URL', 'invalid'],
    ['S3_ENDPOINT', 'ftp://localhost'], ['S3_ENDPOINT', 'http://user:pass@localhost:9000'],
    ['FRONTEND_PUBLIC_URL', 'https://localhost/app'], ['FRONTEND_PUBLIC_URL', 'https://localhost?x=1'],
    ['BACKEND_PUBLIC_URL', 'https://localhost/#secret'], ['S3_BUCKET', 'Bad Bucket'],
    ['S3_REGION', ''], ['S3_SECRET_ACCESS_KEY', 'short'], ['S3_ACCESS_KEY_ID', ''],
  ])('rejects invalid %s without echoing its value', (name, value) => {
    expect(() => validateEnvironment({ ...validEnvironment(), [name]: value })).toThrow(name);
  });

  it('reports missing variable names without leaking other secrets', () => {
    const env = validEnvironment();
    delete env.S3_BUCKET;
    try {
      validateEnvironment(env);
      throw new Error('Expected configuration rejection');
    } catch (error) {
      expect((error as Error).message).toBe('Invalid configuration variables: S3_BUCKET');
      expect((error as Error).message).not.toContain(env.JWT_SECRET);
      expect((error as Error).message).not.toContain(env.DATABASE_URL);
    }
  });
});
