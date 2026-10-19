export const supportedMimeTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm',
] as const;

export type AllowedMimeType = (typeof supportedMimeTypes)[number];

export interface AppConfig {
  environment: 'local' | 'test' | 'production';
  port: number;
  backendPublicUrl: string;
  frontendPublicUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  defaultUserStorageLimitBytes: number;
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  allowedMimeTypes: AllowedMimeType[];
  maxUploadBytes: number;
  presignedUrlTtlSeconds: number;
}
