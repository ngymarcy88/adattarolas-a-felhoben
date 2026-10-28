import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const select = { storageKey: true, originalName: true, mimeType: true, detectedMimeType: true, sizeBytes: true } satisfies Prisma.FileObjectSelect;
type PreviewFile = Prisma.FileObjectGetPayload<{ select: typeof select }>;

@Injectable()
export class FilePreviewService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  private async ownActive(ownerId: string, id: string): Promise<PreviewFile> {
    let file;
    try { file = await this.prisma.fileObject.findFirst({ where: { id, ownerId, status: 'ACTIVE' }, select }); }
    catch { throw new ApiError('DATABASE_UNAVAILABLE'); }
    if (!file) throw new ApiError('FILE_NOT_FOUND');
    return file;
  }

  private assertType(file: PreviewFile): void {
    const configured: readonly string[] = this.config.getOrThrow<AppConfig>('app').allowedMimeTypes;
    if (!file.detectedMimeType || !imageTypes.has(file.detectedMimeType) || file.detectedMimeType !== file.mimeType || !configured.includes(file.detectedMimeType)) {
      throw new ApiError('PREVIEW_NOT_ALLOWED');
    }
  }

  async create(ownerId: string, id: string) {
    const file = await this.ownActive(ownerId, id);
    this.assertType(file); // Ownership/state precedes every type check and storage operation.
    let head;
    try { head = await this.storage.head(file.storageKey); }
    catch { throw new ApiError('STORAGE_UNAVAILABLE'); }
    if (!head) throw new ApiError('FILE_NOT_FOUND');
    if (!Number.isSafeInteger(head.sizeBytes) || head.sizeBytes < 1 || BigInt(head.sizeBytes) !== file.sizeBytes) {
      throw new ApiError('STORAGE_UNAVAILABLE');
    }

    const ttl = Math.min(300, this.config.getOrThrow<AppConfig>('app').presignedUrlTtlSeconds);
    const deadline = Date.now() + ttl * 1000;
    const requested = new Date(deadline);
    let access;
    try { access = await this.storage.createReadAccess({ key: file.storageKey, mimeType: file.detectedMimeType!,
      originalName: file.originalName, disposition: 'inline', expiresAt: requested }); }
    catch { throw new ApiError('STORAGE_UNAVAILABLE'); }

    // Do not keep a transaction/row lock open across provider calls. Discard stale capabilities.
    const current = await this.ownActive(ownerId, id);
    this.assertType(current);
    if (current.storageKey !== file.storageKey || current.originalName !== file.originalName || current.sizeBytes !== file.sizeBytes ||
        current.mimeType !== file.mimeType || current.detectedMimeType !== file.detectedMimeType) throw new ApiError('STORAGE_UNAVAILABLE');
    try {
      const url = new URL(access.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || !(access.expiresAt instanceof Date) ||
          !Number.isFinite(+access.expiresAt) || +access.expiresAt <= Date.now() || +access.expiresAt > deadline) throw new Error();
    } catch { throw new ApiError('STORAGE_UNAVAILABLE'); }
    // Only the adapter's real absolute expiry is public; no file/key/owner fields escape.
    return { url: access.url, expiresAt: access.expiresAt.toISOString() };
  }
}
