export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface ObjectHead { sizeBytes: number; contentType: string | null; etag: string }
export interface UploadAccess {
  method: 'PUT'; url: string; expiresAt: Date;
  headers: { 'Content-Type': string; 'If-None-Match': '*' };
}
export interface DerivedWriteReceipt {
  sizeBytes: number;
  contentType: 'image/webp';
  etag: string;
  sha256: string;
}
/** Server-owned identity/geometry; not a DTO or an authorization decision. */
export interface MultipartSession { key: string; uploadId: string; sizeBytes: number; partSizeBytes: number }
/** Only complete storage-observed parts; ETag is opaque, never a full-file checksum. */
export interface MultipartPartReceipt { partNumber: number; sizeBytes: number; etag: string }
export interface MultipartStorage {
  /** Bounded exact-key discovery only; never retry non-idempotent create to discover its outcome. */
  findMultipartUploads(key: string, signal?: AbortSignal): Promise<string[]>;
  /** Full bounded conditional read; metadata binds the server-owned transfer, prefix is untrusted image input. */
  verifyMultipartObject(input: { key: string; transferId: string; sizeBytes: number; partSizeBytes: number;
    etag?: string; signal?: AbortSignal }): Promise<{ etag: string; sha256: string; prefix: Uint8Array }>;
  /** Non-idempotent provider create: caller must persist intent before calling; no hidden retry. */
  initiateMultipart(input: { key: string; mimeType: string; sizeBytes: number; partSizeBytes: number;
    transferId: string; signal?: AbortSignal }): Promise<{ uploadId: string }>;
  createMultipartPartAccess(input: MultipartSession & { partNumber: number; expiresAt: Date; signal?: AbortSignal }):
    Promise<{ method: 'PUT'; url: string; partNumber: number; sizeBytes: number; expiresAt: Date; headers: Record<string, string> }>;
  listMultipartParts(input: MultipartSession & { signal?: AbortSignal }): Promise<MultipartPartReceipt[]>;
  /** Frozen complete manifest, create-only. Success does not validate the complete object's content. */
  completeMultipart(input: MultipartSession & { parts: readonly MultipartPartReceipt[]; signal?: AbortSignal }):
    Promise<{ etag: string; versionId?: string }>;
  /** ACK (or NoSuchUpload) is not write closure, object/part absence or quota release. */
  abortMultipart(input: { key: string; uploadId: string; signal?: AbortSignal }): Promise<{ writeClosureEvidence: 'unproven' }>;
}
export interface ObjectStorage extends MultipartStorage {
  createUploadAccess(input: { key: string; mimeType: string; sizeBytes: number; expiresAt: Date }): Promise<UploadAccess>;
  head(key: string): Promise<ObjectHead | null>;
  /** Complete conditional image input, bounded by both configured and processor limits. */
  readOriginal(key: string, expected: ObjectHead, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array>;
  /** Bounded conditional full candidate read for recovery, never an authorization or closure proof. */
  readDerived(key: string, expected: ObjectHead, signal?: AbortSignal): Promise<Uint8Array>;
  /** One create-only attempt. An error may have an unknown outcome; never infer quota release. */
  writeDerived(input: { key: string; bytes: Uint8Array; signal?: AbortSignal }): Promise<DerivedWriteReceipt>;
  readPrefix(key: string, expected: ObjectHead, maxBytes: number): Promise<Uint8Array>;
  /** Physical operation only: does NOT authorize quota release or prove writes have ended. */
  deleteObject(key: string): Promise<void>;
  createReadAccess(input: { key: string; mimeType: string; originalName: string;
    disposition: 'inline' | 'attachment'; expiresAt: Date }): Promise<{ url: string; expiresAt: Date }>;
  /** No S3 request proves per-upload quiescence in this adapter. Never synthesize writesClosedAt. */
  readonly writeClosureEvidence: 'unproven';
}
