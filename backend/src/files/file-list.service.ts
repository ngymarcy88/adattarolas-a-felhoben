import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { encodeFileCursor, type FileListQuery } from './file-list.query';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const select = { id: true, originalName: true, mimeType: true, detectedMimeType: true, sizeBytes: true, status: true, createdAt: true } satisfies Prisma.FileObjectSelect;
type ListRow = Prisma.FileObjectGetPayload<{ select: typeof select }>;

@Injectable()
export class FileListService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async list(ownerId: string, query: FileListQuery) {
    const configured: readonly string[] = this.config.getOrThrow<AppConfig>('app').allowedMimeTypes;
    const allowed = imageTypes.filter(mime => configured.includes(mime));
    try {
      const cursor = query.cursor;
      const rows = await this.prisma.fileObject.findMany({
        where: { ownerId, status: 'ACTIVE', mimeType: { in: allowed },
          detectedMimeType: { equals: this.prisma.fileObject.fields.mimeType },
          ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, select,
      });
      const items = rows.slice(0, query.limit).map((row: ListRow) => {
        if (row.status !== 'ACTIVE' || !allowed.includes(row.mimeType) || row.detectedMimeType !== row.mimeType ||
            row.sizeBytes < 1n || row.sizeBytes > BigInt(Number.MAX_SAFE_INTEGER) || !Number.isFinite(+row.createdAt) ||
            row.createdAt.getUTCFullYear() < 1 || row.createdAt.getUTCFullYear() > 9999) throw new Error('Invalid gallery metadata');
        // Explicit projection also protects serialization if a test double/provider returns extra fields.
        return { id: row.id, originalName: row.originalName, mimeType: row.mimeType, detectedMimeType: row.detectedMimeType,
          sizeBytes: Number(row.sizeBytes), status: row.status, createdAt: row.createdAt.toISOString() };
      });
      const hasNextPage = rows.length > query.limit;
      const last = rows[Math.min(rows.length, query.limit) - 1];
      return { items, nextCursor: hasNextPage ? encodeFileCursor(last) : null, hasNextPage };
    } catch { throw new ApiError('DATABASE_UNAVAILABLE'); }
  }
}
