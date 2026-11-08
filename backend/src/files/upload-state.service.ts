import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../common/errors/api-error';

export type UploadFile = Prisma.FileObjectGetPayload<{ include: { uploadOperation: true } }>;
export interface LockedUpload { file: UploadFile; user: { reservedStorageBytes: bigint }; now: Date }
export function publicFile(file: UploadFile) {
  return { id: file.id, status: file.status, originalName: file.originalName, mimeType: file.mimeType,
    detectedMimeType: file.detectedMimeType, sizeBytes: Number(file.sizeBytes), confirmBy: file.confirmBy.toISOString() };
}
// New multipart terminal codes must never enter the legacy single-PUT error path.
export function legacyUploadTerminalError(code: string | null) {
  if (code === 'FILE_TOO_LARGE' || code === 'UPLOAD_VALIDATION_FAILED' || code === 'UPLOAD_EXPIRED') return code;
  throw new ApiError('DATABASE_UNAVAILABLE');
}
@Injectable()
export class UploadStateService {
  constructor(private readonly prisma: PrismaService) {}
  async locked<T>(ownerId: string, fileId: string, action: (tx: Prisma.TransactionClient, view: LockedUpload) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        const users = await tx.$queryRaw<{ reservedStorageBytes: bigint }[]>`SELECT "reservedStorageBytes" FROM "User" WHERE "id" = ${ownerId}::uuid FOR UPDATE`;
        if (!users[0]) throw new ApiError('AUTH_REQUIRED');
        const files = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FileObject" WHERE "id" = ${fileId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
        if (!files[0]) throw new ApiError('FILE_NOT_FOUND');
        let file = await tx.fileObject.findUnique({ where: { id: fileId }, include: { uploadOperation: true } });
        if (!file || file.ownerId !== ownerId) throw new ApiError('FILE_NOT_FOUND');
        if (file.uploadOperation) {
          await tx.$queryRaw`SELECT "id" FROM "UploadOperation" WHERE "id" = ${file.uploadOperation.id}::uuid FOR UPDATE`;
          file = await tx.fileObject.findUnique({ where: { id: fileId }, include: { uploadOperation: true } });
        }
        if (!file || file.ownerId !== ownerId) throw new ApiError('FILE_NOT_FOUND');
        return action(tx, { file, user: users[0], now: new Date() });
      }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('DATABASE_UNAVAILABLE');
    }
  }
}
