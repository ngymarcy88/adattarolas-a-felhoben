import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/app-config';
import type { Prisma } from '../generated/prisma/client';
import { ApiError, type ApiErrorCode } from '../common/errors/api-error';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';
import { ProcessingStateService } from '../processing/processing-state.service';
import { detectImageMime, IMAGE_PREFIX_BYTES } from './image-signature';
import { UploadStateService, publicFile, type LockedUpload, type UploadFile } from './upload-state.service';

type Result = { file?: UploadFile; error?: ApiErrorCode; verify?: UploadFile };
type Verification = { mime: string } | { error: 'FILE_TOO_LARGE' | 'UPLOAD_VALIDATION_FAILED' | 'UPLOAD_NOT_READY' | 'UPLOAD_VERIFICATION_UNAVAILABLE' };
@Injectable()
export class UploadConfirmService {
  constructor(private readonly state: UploadStateService, private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage, private readonly processing: ProcessingStateService) {}

  private async current(tx: Prisma.TransactionClient, view: LockedUpload): Promise<Result | null> {
    const { file, now } = view; const operation = file.uploadOperation;
    if (file.status === 'ACTIVE') return { file }; // Legacy/pruned successful files need no receipt.
    if (file.status !== 'PENDING_UPLOAD') return { error: 'RESOURCE_STATE_CONFLICT' };
    if (!operation || operation.state === 'FINALIZED') throw new ApiError('DATABASE_UNAVAILABLE');
    if (operation.state === 'REJECTED' || operation.state === 'EXPIRED') {
      if (!operation.terminalErrorCode) throw new ApiError('DATABASE_UNAVAILABLE');
      return { error: operation.terminalErrorCode };
    }
    if (+now >= +file.confirmBy) {
      await tx.uploadOperation.update({ where: { id: operation.id }, data: { state: 'EXPIRED', terminalErrorCode: 'UPLOAD_EXPIRED', closedAt: now } });
      return { error: 'UPLOAD_EXPIRED' };
    }
    return null;
  }

  private async verify(file: UploadFile): Promise<Verification> {
    try {
      const head = await this.storage.head(file.storageKey);
      if (!head) return { error: 'UPLOAD_NOT_READY' };
      if (head.sizeBytes > Math.min(this.config.getOrThrow<AppConfig>('app').maxUploadBytes, 104857600)) return { error: 'FILE_TOO_LARGE' };
      if (head.sizeBytes < 1 || BigInt(head.sizeBytes) !== file.sizeBytes) return { error: 'UPLOAD_VALIDATION_FAILED' };
      const prefix = await this.storage.readPrefix(file.storageKey, head, IMAGE_PREFIX_BYTES);
      const mime = detectImageMime(prefix);
      if (!mime || mime !== file.mimeType || !this.config.getOrThrow<AppConfig>('app').allowedMimeTypes.includes(mime as AppConfig['allowedMimeTypes'][number])) {
        return { error: 'UPLOAD_VALIDATION_FAILED' };
      }
      return { mime };
    } catch { return { error: 'UPLOAD_VERIFICATION_UNAVAILABLE' }; }
  }

  async confirm(ownerId: string, fileId: string, requestId: string = randomUUID()) {
    const initial = await this.state.locked(ownerId, fileId, async (tx, view): Promise<Result> =>
      await this.current(tx, view) ?? { verify: view.file });
    if (initial.error) throw new ApiError(initial.error);
    if (initial.file) return { file: publicFile(initial.file) };
    const original = initial.verify!;
    const verification = await this.verify(original); // No DB locks during provider I/O.
    let result: Result;
    try { result = await this.state.locked(ownerId, fileId, async (tx, view): Promise<Result> => {
      const current = await this.current(tx, view);
      if (current) return current; // A concurrent winner or deadline overrides stale provider results.
      const { file, user, now } = view; const operation = file.uploadOperation!;
      if (file.storageKey !== original.storageKey || file.sizeBytes !== original.sizeBytes || file.mimeType !== original.mimeType ||
          +file.confirmBy !== +original.confirmBy || operation.id !== original.uploadOperation!.id) throw new ApiError('DATABASE_UNAVAILABLE');
      if ('error' in verification) {
        if (verification.error === 'FILE_TOO_LARGE' || verification.error === 'UPLOAD_VALIDATION_FAILED') {
          await tx.uploadOperation.update({ where: { id: operation.id }, data: { state: 'REJECTED', terminalErrorCode: verification.error, closedAt: now } });
          if (Date.now() >= +file.confirmBy) throw new ApiError('UPLOAD_EXPIRED');
        }
        return { error: verification.error };
      }
      if (user.reservedStorageBytes < file.sizeBytes) throw new ApiError('DATABASE_UNAVAILABLE');
      await tx.fileObject.update({ where: { id: file.id }, data: { status: 'ACTIVE', detectedMimeType: verification.mime } });
      await tx.uploadOperation.update({ where: { id: operation.id }, data: { state: 'FINALIZED', closedAt: now } });
      await tx.user.update({ where: { id: ownerId }, data: { reservedStorageBytes: { decrement: file.sizeBytes }, usedStorageBytes: { increment: file.sizeBytes } } });
      await this.processing.enqueueConfirmedFile(tx, { ...file, status: 'ACTIVE', detectedMimeType: verification.mime });
      await tx.auditEvent.create({ data: { actorUserId: ownerId, action: 'UPLOAD_CONFIRMED', resourceType: 'FILE_OBJECT', resourceId: file.id,
        requestId, metadata: { sizeBytes: String(file.sizeBytes), mimeType: verification.mime } } });
      // Check again after all writes. Throw rolls back every write if commit work exhausted the deadline.
      if (Date.now() >= +file.confirmBy) throw new ApiError('UPLOAD_EXPIRED');
      return { file: { ...file, status: 'ACTIVE', detectedMimeType: verification.mime } };
    }); } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'UPLOAD_EXPIRED') throw error;
      result = await this.state.locked(ownerId, fileId, async (tx, view): Promise<Result> =>
        await this.current(tx, view) ?? { error: 'UPLOAD_EXPIRED' });
    }
    if (result.error) throw new ApiError(result.error);
    return { file: publicFile(result.file!) };
  }
}
