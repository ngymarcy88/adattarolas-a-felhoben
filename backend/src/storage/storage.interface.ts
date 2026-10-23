export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface ObjectHead { sizeBytes: number; contentType: string | null; etag: string }
export interface UploadAccess {
  method: 'PUT'; url: string; expiresAt: Date;
  headers: { 'Content-Type': string; 'If-None-Match': '*' };
}
export interface ObjectStorage {
  createUploadAccess(input: { key: string; mimeType: string; sizeBytes: number; expiresAt: Date }): Promise<UploadAccess>;
  head(key: string): Promise<ObjectHead | null>;
  readPrefix(key: string, expected: ObjectHead, maxBytes: number): Promise<Uint8Array>;
  /** Physical operation only: does NOT authorize quota release or prove writes have ended. */
  deleteObject(key: string): Promise<void>;
  createReadAccess(input: { key: string; mimeType: string; originalName: string;
    disposition: 'inline' | 'attachment'; expiresAt: Date }): Promise<{ url: string; expiresAt: Date }>;
  /** No S3 request proves per-upload quiescence in this adapter. Never synthesize writesClosedAt. */
  readonly writeClosureEvidence: 'unproven';
}
