import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/app-config';
import { ApiError, type ApiErrorCode } from '../common/errors/api-error';
import type { FileObject } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage, type UploadAccess } from '../storage/storage.interface';
import { originalStorageKey } from '../storage/storage-key';
import type { UploadInitDto } from './upload-init.dto';

type Prepared = { fileId: string; access: UploadAccess };
type Candidate = { id: string; key: string; createdAt: Date; confirmBy: Date; replayUntil: Date };
type Outcome = { created: boolean; file?: FileObject; access?: UploadAccess; needsAccess?: boolean; error?: ApiErrorCode };
type QuotaUser = { id: string; usedStorageBytes: bigint; reservedStorageBytes: bigint; storageLimitBytes: bigint };
export function uploadFingerprint(input: UploadInitDto): string {
  return 'v1:' + createHash('sha256').update(JSON.stringify(['image-upload-init', 1, input.originalName, input.mimeType, String(input.sizeBytes)]), 'utf8').digest('hex');
}
@Injectable()
export class UploadInitService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  private async sign(file: { id: string; storageKey: string; mimeType: string; sizeBytes: bigint; uploadUrlExpiresAt: Date }): Promise<Prepared> {
    try {
      return { fileId: file.id, access: await this.storage.createUploadAccess({ key: file.storageKey, mimeType: file.mimeType,
        sizeBytes: Number(file.sizeBytes), expiresAt: file.uploadUrlExpiresAt }) };
    } catch { throw new ApiError('STORAGE_UNAVAILABLE'); }
  }

  async initiate(ownerId: string, key: string, input: UploadInitDto) {
    const fingerprint = uploadFingerprint(input);
    const where = { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } };
    let candidate: Candidate | undefined; let prepared: Prepared | undefined; let replaySigningFailed = false;
    try {
      // Read only: prepare a capability outside DB locks, then revalidate everything under locks.
      const prior = await this.prisma.uploadOperation.findUnique({ where, include: { fileObject: true } });
      if (!prior) {
        const t0 = new Date(Math.floor(Date.now() / 1000) * 1000); const id = randomUUID();
        candidate = { id, key: originalStorageKey(ownerId, id), createdAt: t0,
          confirmBy: new Date(+t0 + 900_000), replayUntil: new Date(+t0 + 86_400_000) };
        prepared = await this.sign({ id, storageKey: candidate.key, mimeType: input.mimeType, sizeBytes: BigInt(input.sizeBytes),
          uploadUrlExpiresAt: new Date(+t0 + this.config.getOrThrow<AppConfig>('app').presignedUrlTtlSeconds * 1000) });
      } else if (prior.requestFingerprint === fingerprint && prior.state === 'OPEN' && prior.fileObject.status === 'PENDING_UPLOAD' &&
          Date.now() < +prior.fileObject.confirmBy && Date.now() < +prior.fileObject.uploadUrlExpiresAt) {
        try { prepared = await this.sign(prior.fileObject); } catch { replaySigningFailed = true; }
      }
      let result = await this.reserve(ownerId, key, input, fingerprint, candidate, prepared);
      // A competing init may have committed a different candidate. Sign only the winner, never the discarded URL.
      if (result.needsAccess && result.file) {
        if (replaySigningFailed) throw new ApiError('STORAGE_UNAVAILABLE');
        try { prepared = await this.sign(result.file); } catch { prepared = undefined; }
        result = await this.reserve(ownerId, key, input, fingerprint, undefined, prepared);
      }
      if (result.error) throw new ApiError(result.error);
      if (result.needsAccess) throw new ApiError('STORAGE_UNAVAILABLE');
      if (!result.file) throw new ApiError('DATABASE_UNAVAILABLE');
      const file = result.file;
      return { created: result.created, body: { file: { id: file.id, status: file.status, originalName: file.originalName,
        mimeType: file.mimeType, detectedMimeType: file.detectedMimeType, sizeBytes: Number(file.sizeBytes), confirmBy: file.confirmBy.toISOString() },
      upload: result.access && Date.now() < +result.access.expiresAt ? { method: result.access.method, url: result.access.url,
        expiresAt: result.access.expiresAt.toISOString(), headers: result.access.headers } : null } };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('DATABASE_UNAVAILABLE');
    }
  }

  private reserve(ownerId: string, key: string, input: UploadInitDto, fingerprint: string, candidate?: Candidate, prepared?: Prepared): Promise<Outcome> {
    return this.prisma.$transaction(async (tx): Promise<Outcome> => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
      const users = await tx.$queryRaw<QuotaUser[]>`SELECT "id", "usedStorageBytes", "reservedStorageBytes", "storageLimitBytes" FROM "User" WHERE "id" = ${ownerId}::uuid FOR UPDATE`;
      const user = users[0]; if (!user) throw new ApiError('AUTH_REQUIRED');
      const where = { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } };
      let prior = await tx.uploadOperation.findUnique({ where, include: { fileObject: true } });
      if (prior) {
        await tx.$queryRaw`SELECT "id" FROM "FileObject" WHERE "id" = ${prior.fileObjectId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "UploadOperation" WHERE "id" = ${prior.id}::uuid FOR UPDATE`;
        prior = await tx.uploadOperation.findUnique({ where, include: { fileObject: true } });
        if (!prior) throw new ApiError('DATABASE_UNAVAILABLE');
        if (prior.requestFingerprint !== fingerprint) return { created: false, error: 'IDEMPOTENCY_CONFLICT' };
        const file = prior.fileObject;
        if (file.status === 'SOFT_DELETED') return { created: false, error: 'RESOURCE_STATE_CONFLICT' };
        if (file.status === 'ACTIVE' && prior.state === 'FINALIZED') return { created: false, file };
        if (file.status !== 'PENDING_UPLOAD' || prior.state === 'FINALIZED') throw new ApiError('DATABASE_UNAVAILABLE');
        if (prior.state === 'REJECTED' || prior.state === 'EXPIRED') {
          if (!prior.terminalErrorCode) throw new ApiError('DATABASE_UNAVAILABLE');
          return { created: false, error: prior.terminalErrorCode };
        }
        const now = new Date();
        if (+now >= +file.confirmBy) {
          await tx.uploadOperation.update({ where: { id: prior.id }, data: { state: 'EXPIRED', terminalErrorCode: 'UPLOAD_EXPIRED', closedAt: now } });
          return { created: false, error: 'UPLOAD_EXPIRED' }; // Commit terminal receipt, then throw outside transaction.
        }
        if (+now >= +file.uploadUrlExpiresAt) return { created: false, file };
        if (!prepared || prepared.fileId !== file.id) return { created: false, file, needsAccess: true };
        return { created: false, file, access: prepared.access };
      }
      if (!candidate || !prepared || prepared.fileId !== candidate.id) throw new ApiError('DATABASE_UNAVAILABLE');
      if (Date.now() >= +prepared.access.expiresAt) throw new ApiError('STORAGE_UNAVAILABLE');
      const size = BigInt(input.sizeBytes);
      if (user.usedStorageBytes + user.reservedStorageBytes + size > user.storageLimitBytes) throw new ApiError('QUOTA_EXCEEDED');
      const file = await tx.fileObject.create({ data: { id: candidate.id, ownerId, originalName: input.originalName,
        mimeType: input.mimeType, sizeBytes: size, storageKey: candidate.key, createdAt: candidate.createdAt,
        uploadUrlExpiresAt: prepared.access.expiresAt, confirmBy: candidate.confirmBy } });
      await tx.uploadOperation.create({ data: { ownerId, fileObjectId: file.id, idempotencyKey: key, requestFingerprint: fingerprint,
        createdAt: candidate.createdAt, replayUntil: candidate.replayUntil } });
      await tx.user.update({ where: { id: ownerId }, data: { reservedStorageBytes: { increment: size } } });
      if (Date.now() >= +prepared.access.expiresAt) throw new ApiError('STORAGE_UNAVAILABLE');
      return { created: true, file, access: prepared.access };
    }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });
  }
}
