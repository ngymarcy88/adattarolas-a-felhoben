import { createHash } from 'node:crypto';
import { Injectable, PipeTransform } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/errors/api-error';
import { UploadInitValidationPipe } from '../files/upload-init.dto';

export function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw new ApiError('VALIDATION_ERROR');
  return value as Record<string, unknown>;
}
export function uuid(value: unknown, v4 = false): string {
  if (typeof value !== 'string' || value.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
      (v4 && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) throw new ApiError('VALIDATION_ERROR');
  return value.toLowerCase();
}
export function source(value: unknown) {
  const v = record(value, ['sizeBytes', 'contentSha256']);
  if (!Number.isSafeInteger(v.sizeBytes) || (v.sizeBytes as number) < 1 || typeof v.contentSha256 !== 'string' || v.contentSha256.length !== 64 || !/^[a-f0-9]{64}$/.test(v.contentSha256)) throw new ApiError('VALIDATION_ERROR');
  return { sizeBytes: v.sizeBytes as number, contentSha256: v.contentSha256 };
}
export interface MultipartFileInput { clientFileId: string; originalName: string; mimeType: string; sizeBytes: number; contentSha256: string }
@Injectable()
export class MultipartFilePipe implements PipeTransform<unknown, MultipartFileInput> {
  constructor(private readonly config: ConfigService) {}
  transform(value: unknown) {
    const v = record(value, ['clientFileId', 'originalName', 'mimeType', 'sizeBytes', 'contentSha256']);
    const base = new UploadInitValidationPipe(this.config).transform({ originalName: v.originalName, mimeType: v.mimeType, sizeBytes: v.sizeBytes });
    return { ...base, clientFileId: uuid(v.clientFileId, true), ...source({ sizeBytes: v.sizeBytes, contentSha256: v.contentSha256 }) };
  }
}
export function fingerprint(importId: string, input: MultipartFileInput): string {
  return 'v2:' + createHash('sha256').update(JSON.stringify(['multipart-image-init', 2, importId, input.clientFileId,
    input.originalName, input.mimeType, String(input.sizeBytes), input.contentSha256])).digest('hex');
}
export const importFingerprint = 'v1:' + createHash('sha256').update(JSON.stringify(['import-create', 1])).digest('hex');
export interface PageInput { limit: number; cursor?: { id: string; at: string | number } }
const scope = (owner: string, resource: string) => createHash('sha256').update(JSON.stringify([owner, resource])).digest('hex');
export function pageInput(value: unknown, owner: string, resource: string): PageInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['limit', 'cursor'].includes(k))) throw new ApiError('VALIDATION_ERROR');
  const v = value as Record<string, unknown>; const limit = v.limit === undefined ? 20 : Number(v.limit);
  if (v.limit !== undefined && (typeof v.limit !== 'string' || !/^[1-9][0-9]?$/.test(v.limit) || String(limit) !== v.limit) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new ApiError('VALIDATION_ERROR');
  if (v.cursor === undefined) return { limit };
  try {
    if (typeof v.cursor !== 'string' || v.cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(v.cursor)) throw new Error();
    const b = Buffer.from(v.cursor, 'base64url'); if (b.toString('base64url') !== v.cursor) throw new Error();
    const c = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b)), ['v', 'scope', 'id', 'at']);
    if (c.v !== 1 || c.scope !== scope(owner, resource)) throw new Error();
    const id = uuid(c.id);
    if (resource === 'imports') {
      if (typeof c.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c.at) || new Date(c.at).toISOString() !== c.at) throw new Error();
    } else if (!Number.isSafeInteger(c.at) || (c.at as number) < 1 || (c.at as number) > 50) throw new Error();
    return { limit, cursor: { id, at: c.at as string | number } };
  } catch { throw new ApiError('VALIDATION_ERROR'); }
}
export function pageCursor(owner: string, resource: string, id: string, at: string | number) {
  return Buffer.from(JSON.stringify({ v: 1, scope: scope(owner, resource), id, at })).toString('base64url');
}
