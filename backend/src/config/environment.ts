import { supportedMimeTypes, type AllowedMimeType, type AppConfig } from './app-config';

// Only variable names enter errors. Never stringify configuration or provider errors.
export function validateEnvironment(env: Record<string, unknown>): AppConfig {
  const invalid = new Set<string>();
  const required = (name: string): string => {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) {
      invalid.add(name);
      return '';
    }
    return value;
  };
  const text = (name: string, fallback?: string): string =>
    env[name] === undefined && fallback !== undefined ? fallback : required(name);
  const secret = (name: string, min: number): string => {
    const value = required(name);
    if (value.length < min || /change[-_ ]?me|replace|placeholder|example/i.test(value)) {
      invalid.add(name);
    }
    return value;
  };
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = text(name, String(fallback));
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      invalid.add(name);
    }
    return value;
  };
  const url = (name: string, protocols: string[], originOnly = false): string => {
    const raw = required(name);
    try {
      const value = new URL(raw);
      if (!protocols.includes(value.protocol) || !value.hostname || value.username || value.password ||
          value.hash || value.search || (originOnly && value.pathname !== '/')) {
        invalid.add(name);
      }
      return originOnly ? value.origin : raw;
    } catch {
      invalid.add(name);
      return raw;
    }
  };

  const environment = text('APP_ENV', 'local');
  if (!['local', 'test', 'production'].includes(environment)) invalid.add('APP_ENV');
  const host = text('BACKEND_HOST', '127.0.0.1');
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) invalid.add('BACKEND_HOST');
  const databaseUrl = required('DATABASE_URL');
  try {
    const value = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(value.protocol) || !value.hostname ||
        value.pathname.length < 2 || !value.username || !value.password) invalid.add('DATABASE_URL');
  } catch {
    invalid.add('DATABASE_URL');
  }
  const jwtExpiresIn = text('JWT_EXPIRES_IN', '1h');
  const ttlMatch = /^([1-9]\d{0,5})([smhd])$/.exec(jwtExpiresIn);
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const jwtTtlSeconds = ttlMatch ? Number(ttlMatch[1]) * units[ttlMatch[2]] : NaN;
  if (!Number.isSafeInteger(jwtTtlSeconds) || jwtTtlSeconds < 1 || jwtTtlSeconds > 86400) invalid.add('JWT_EXPIRES_IN');
  const forcePathStyle = text('S3_FORCE_PATH_STYLE', 'true');
  if (!['true', 'false'].includes(forcePathStyle)) invalid.add('S3_FORCE_PATH_STYLE');
  const region = required('S3_REGION');
  if (!/^[a-z0-9-]{1,63}$/.test(region)) invalid.add('S3_REGION');
  const bucket = required('S3_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..')) {
    invalid.add('S3_BUCKET');
  }
  const allowedMimeTypes = text('ALLOWED_MIME_TYPES', supportedMimeTypes.join(','))
    .split(',').map((value) => value.trim());
  if (allowedMimeTypes.some((value) => !supportedMimeTypes.includes(value as AllowedMimeType)) ||
      new Set(allowedMimeTypes).size !== allowedMimeTypes.length) {
    invalid.add('ALLOWED_MIME_TYPES');
  }
  const config: AppConfig = {
    environment: environment as AppConfig['environment'],
    host: host as AppConfig['host'],
    port: integer('BACKEND_PORT', 3000, 1, 65535),
    backendPublicUrl: url('BACKEND_PUBLIC_URL', ['http:', 'https:'], true),
    frontendPublicUrl: url('FRONTEND_PUBLIC_URL', ['http:', 'https:'], true),
    databaseUrl,
    jwtSecret: secret('JWT_SECRET', 32),
    jwtExpiresIn,
    jwtTtlSeconds,
    defaultUserStorageLimitBytes: integer('DEFAULT_USER_STORAGE_LIMIT_BYTES', 1073741824, 1, Number.MAX_SAFE_INTEGER),
    storage: {
      endpoint: url('S3_ENDPOINT', ['http:', 'https:'], true),
      region,
      bucket,
      accessKeyId: secret('S3_ACCESS_KEY_ID', 3),
      secretAccessKey: secret('S3_SECRET_ACCESS_KEY', 8),
      forcePathStyle: forcePathStyle === 'true',
    },
    allowedMimeTypes: allowedMimeTypes as AllowedMimeType[],
    maxUploadBytes: integer('MAX_UPLOAD_BYTES', 104857600, 1, 104857600),
    presignedUrlTtlSeconds: integer('PRESIGNED_URL_TTL_SECONDS', 300, 1, 300),
  };
  if (invalid.size) {
    throw new Error(`Invalid configuration variables: ${[...invalid].sort().join(', ')}`);
  }
  return config;
}
