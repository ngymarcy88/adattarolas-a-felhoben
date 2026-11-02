import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../common/errors/api-error';

export const transferInclude = { uploadOperation: { include: { fileObject: true } }, importFile: { include: { importSession: true } },
  parts: { orderBy: { partNumber: 'asc' as const } }, manifestParts: { orderBy: { partNumber: 'asc' as const } }, ioOperations: true } as const;
export type Transfer = Prisma.MultipartTransferGetPayload<{ include: typeof transferInclude }>;
export type UserQuota = { id: string; usedStorageBytes: bigint; reservedStorageBytes: bigint; storageLimitBytes: bigint };
export interface TransferContext { tx: Prisma.TransactionClient; user: UserQuota; transfer: Transfer; now: Date }
@Injectable()
export class MultipartStore {
  constructor(readonly prisma: PrismaService) {}
  async withUser<T>(owner: string, action: (tx: Prisma.TransactionClient, user: UserQuota, now: Date) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        const [user] = await tx.$queryRaw<UserQuota[]>`SELECT "id", "usedStorageBytes", "reservedStorageBytes", "storageLimitBytes" FROM "User" WHERE "id"=${owner}::uuid FOR UPDATE`;
        if (!user) throw new ApiError('AUTH_REQUIRED');
        const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
        return action(tx, user, clock.now);
      }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('DATABASE_UNAVAILABLE'); }
  }
  async locked<T>(owner: string, id: string, action: (view: TransferContext) => Promise<T>, byFile = false): Promise<T> {
    return this.withUser(owner, async (tx, user) => {
      const where = { ownerId: owner, ...(byFile ? { fileObjectId: id } : { id }) };
      const initial = await tx.multipartTransfer.findFirst({ where, include: transferInclude });
      if (!initial) throw new ApiError(byFile ? 'FILE_NOT_FOUND' : 'TRANSFER_NOT_FOUND');
      await tx.$queryRaw`SELECT "id" FROM "ImportSession" WHERE "id"=${initial.importFile.importId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "FileObject" WHERE "id"=${initial.fileObjectId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "UploadOperation" WHERE "id"=${initial.uploadOperationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "MultipartTransfer" WHERE "id"=${initial.id}::uuid FOR UPDATE`;
      const transfer = await tx.multipartTransfer.findFirst({ where, include: transferInclude });
      if (!transfer || transfer.ownerId !== owner) throw new ApiError(byFile ? 'FILE_NOT_FOUND' : 'TRANSFER_NOT_FOUND');
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
      return action({ tx, user, transfer, now: clock.now });
    });
  }
}
export function publicImport(i: { id: string; state: string; createdAt: Date; expiresAt: Date; acceptedFileCount: number }, now = new Date()) {
  return { id: i.id, state: +now >= +i.expiresAt ? 'EXPIRED' : i.state, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString(), acceptedFileCount: i.acceptedFileCount };
}
export function publicTransfer(t: Transfer, observedAt?: Date) {
  const parts = t.parts.filter(p => p.observedSizeBytes !== null && p.observedETag !== null && p.observedAt !== null);
  const at = observedAt ?? parts.reduce<Date | undefined>((max, p) => !max || +p.observedAt! > +max ? p.observedAt! : max, undefined);
  return { id: t.id, state: t.state, revision: t.revision, partSizeBytes: t.partSizeBytes, partCount: t.partCount,
    expiresAt: t.expiresAt.toISOString(), completedBytes: parts.reduce((sum, p) => sum + p.observedSizeBytes!, 0), partsObservedAt: at?.toISOString() ?? null,
    parts: parts.map(p => ({ partNumber: p.partNumber, sizeBytes: p.observedSizeBytes! })), cleanupState: t.cleanupState,
    reservationState: t.uploadOperation.state === 'FINALIZED' ? 'CONVERTED_TO_USED' : t.uploadOperation.reservationReleasedAt ? 'RELEASED' : 'HELD',
    lastErrorCode: t.lastErrorCode && ['STORAGE_UNAVAILABLE', 'UPLOAD_VERIFICATION_UNAVAILABLE', 'TRANSFER_PARTS_INVALID', 'UPLOAD_VALIDATION_FAILED', 'UPLOAD_EXPIRED', 'UPLOAD_CANCELLED'].includes(t.lastErrorCode) ? t.lastErrorCode : null };
}
export function publicItem(item: { clientFileId: string; fileObjectId: string; fileObject: { originalName: string; mimeType: string; sizeBytes: bigint }; transfer: Transfer | null }) {
  return { clientFileId: item.clientFileId, fileId: item.fileObjectId, originalName: item.fileObject.originalName, mimeType: item.fileObject.mimeType,
    sizeBytes: Number(item.fileObject.sizeBytes), transfer: item.transfer ? publicTransfer(item.transfer) : null };
}
