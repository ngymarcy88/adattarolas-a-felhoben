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
      environment: 'local', host: '127.0.0.1', port: 3000, jwtExpiresIn: '1h', jwtTtlSeconds: 3600, defaultUserStorageLimitBytes: 1073741824,
      maxUploadBytes: 104857600, presignedUrlTtlSeconds: 300, thumbnailPreviewTtlSeconds: 60,
      storage: { forcePathStyle: true, publicEndpoint: 'http://localhost:9000' },
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    });
  });

  it('accepts explicit valid values', () => {
    expect(validateEnvironment({ ...validEnvironment(), APP_ENV: 'test', BACKEND_HOST: '0.0.0.0', BACKEND_PORT: '3001',
      S3_FORCE_PATH_STYLE: 'false', MAX_UPLOAD_BYTES: '1000', JWT_EXPIRES_IN: '30m', DEFAULT_USER_STORAGE_LIMIT_BYTES: '2048' }))
      .toMatchObject({ environment: 'test', host: '0.0.0.0', port: 3001, maxUploadBytes: 1000,
        jwtExpiresIn: '30m', jwtTtlSeconds: 1800, defaultUserStorageLimitBytes: 2048, storage: { forcePathStyle: false } });
  });

  it('separates the internal storage address from the public signing address', () => {
    expect(validateEnvironment({ ...validEnvironment(), S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:9000' }).storage)
      .toMatchObject({ endpoint: 'http://minio:9000', publicEndpoint: 'http://127.0.0.1:9000' });
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
    ['DEFAULT_USER_STORAGE_LIMIT_BYTES', '0'], ['DEFAULT_USER_STORAGE_LIMIT_BYTES', '1.5'],
    ['DEFAULT_USER_STORAGE_LIMIT_BYTES', '9007199254740992'], ['DEFAULT_USER_STORAGE_LIMIT_BYTES', ''],
    ['BACKEND_HOST', 'localhost'], ['BACKEND_HOST', ''], ['APP_ENV', 'development'], ['BACKEND_PORT', '0'], ['BACKEND_PORT', '65536'],
    ['BACKEND_PORT', '3000.5'], ['BACKEND_PORT', '3e3'], ['MAX_UPLOAD_BYTES', '104857601'],
    ['MAX_UPLOAD_BYTES', '-1'], ['PRESIGNED_URL_TTL_SECONDS', '301'],
    ['S3_FORCE_PATH_STYLE', 'yes'], ['JWT_SECRET', 'short'],
    ['JWT_SECRET', 'replace-with-a-very-long-and-unique-secret'],
    ['JWT_EXPIRES_IN', 'forever'], ['JWT_EXPIRES_IN', '25h'], ['JWT_EXPIRES_IN', '999999999999999999d'],
    ['JWT_EXPIRES_IN', '0s'], ['DATABASE_URL', 'mysql://user:pass@localhost/db'],
    ['DATABASE_URL', 'postgresql://localhost/db'], ['DATABASE_URL', 'invalid'],
    ['S3_PUBLIC_ENDPOINT', 'http://user:pass@localhost:9000'], ['S3_PUBLIC_ENDPOINT', 'http://localhost:9000/path'], ['S3_PUBLIC_ENDPOINT', ''], ['S3_ENDPOINT', 'ftp://localhost'], ['S3_ENDPOINT', 'http://user:pass@localhost:9000'],
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

describe('Thumbnail preview TTL configuration', () => {
  it.each(['30', '300'])('accepts bounded thumbnail TTL %s', value => {
    expect(validateEnvironment({ ...validEnvironment(), THUMBNAIL_PREVIEW_TTL_SECONDS: value }).thumbnailPreviewTtlSeconds).toBe(Number(value));
  });
  it.each(['29', '301', '1.5', 'abc', '-1'])('rejects thumbnail TTL %s without echoing its value', value => {
    expect(() => validateEnvironment({ ...validEnvironment(), THUMBNAIL_PREVIEW_TTL_SECONDS: value })).toThrow('THUMBNAIL_PREVIEW_TTL_SECONDS');
  });
});
