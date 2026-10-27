import { Injectable, type PipeTransform } from '@nestjs/common';
import { TextDecoder } from 'node:util';
import { ApiError } from '../common/errors/api-error';

export interface FileListCursor { createdAt: Date; id: string }
export class FileListQuery {
  constructor(readonly limit: number, readonly cursor?: FileListCursor) {}
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function decodeFileCursor(value: unknown): FileListCursor {
  try {
    if (typeof value !== 'string' || !value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw new Error();
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    const cursor = data as Record<string, unknown>;
    if (Object.keys(cursor).length !== 4 || !['v', 'scope', 'createdAt', 'id'].every(key => Object.hasOwn(cursor, key)) ||
        cursor.v !== 1 || cursor.scope !== 'active-images-v1' || typeof cursor.id !== 'string' || cursor.id.length !== 36 || !uuid.test(cursor.id) ||
        typeof cursor.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt)) throw new Error();
    const createdAt = new Date(cursor.createdAt);
    if (!Number.isFinite(+createdAt) || createdAt.getUTCFullYear() < 1 || createdAt.toISOString() !== cursor.createdAt) throw new Error();
    return { createdAt, id: cursor.id };
  } catch { throw new ApiError('CURSOR_INVALID'); }
}
export function encodeFileCursor(cursor: FileListCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, scope: 'active-images-v1', createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');
}
@Injectable()
export class FileListQueryPipe implements PipeTransform<unknown, FileListQuery> {
  transform(value: unknown): FileListQuery {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['limit', 'cursor'].includes(key))) {
      throw new ApiError('VALIDATION_ERROR');
    }
    const query = value as Record<string, unknown>;
    let limit = 20;
    if (Object.hasOwn(query, 'limit')) {
      if (typeof query.limit !== 'string' || !/^(?:[1-9][0-9]?|100)$/.test(query.limit) || String(Number(query.limit)) !== query.limit) throw new ApiError('VALIDATION_ERROR');
      limit = Number(query.limit);
    }
    return new FileListQuery(limit, Object.hasOwn(query, 'cursor') ? decodeFileCursor(query.cursor) : undefined);
  }
}
