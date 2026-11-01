import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';
import { UploadStateService, type UploadFile } from './upload-state.service';

type CleanupPlan = { kind: 'skip' | 'blocked' | 'released' } | { kind: 'delete'; file: UploadFile };
export const CLEANUP_BATCH_SIZE = 50;
@Injectable()
export class UploadCleanupService {
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly state: UploadStateService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  private retry(file: UploadFile, now: Date, code: string) {
    const count = Math.min(file.cleanupAttemptCount + 1, 2147483647);
    return { cleanupAttemptCount: count, cleanupLastErrorCode: code,
      cleanupRetryAfter: new Date(+now + Math.min(3600000, 60000 * 2 ** Math.min(count - 1, 6))) };
  }
  async clean(ownerId: string, fileId: string): Promise<'skip' | 'blocked' | 'released' | 'retry'> {
    const plan = await this.state.locked(ownerId, fileId, async (tx, { file, now }): Promise<CleanupPlan> => {
      if (file.uploadTransport !== 'SINGLE_PUT') return { kind: 'skip' };
      let operation = file.uploadOperation;
      if (file.status !== 'PENDING_UPLOAD' || !operation || operation.state === 'FINALIZED' || operation.reservationReleasedAt) return { kind: 'skip' };
      if (file.cleanupRetryAfter && +now < +file.cleanupRetryAfter) return { kind: 'skip' };
      if (operation.state === 'OPEN') {
        if (+now < +file.confirmBy) return { kind: 'skip' };
        operation = await tx.uploadOperation.update({ where: { id: operation.id }, data: { state: 'EXPIRED', terminalErrorCode: 'UPLOAD_EXPIRED', closedAt: now } });
      }
      if (!operation.writesClosedAt || +operation.writesClosedAt > +now || !operation.closedAt || +operation.closedAt > +now) {
        await tx.fileObject.update({ where: { id: file.id }, data: this.retry(file, now, 'WRITE_CLOSURE_UNPROVEN') });
        return { kind: 'blocked' }; // No HEAD, DELETE, invented proof, or reservation release.
      }
      return { kind: 'delete', file: { ...file, uploadOperation: operation } };
    });
    if (plan.kind !== 'delete') return plan.kind;
    const original = plan.file;
    try {
      if (await this.storage.head(original.storageKey)) await this.storage.deleteObject(original.storageKey);
      if (await this.storage.head(original.storageKey)) throw new Error('Object still present');
    } catch {
      await this.state.locked(ownerId, fileId, async (tx, { file, now }) => {
        const operation = file.uploadOperation;
        if (file.uploadTransport === 'SINGLE_PUT' && file.status === 'PENDING_UPLOAD' && operation && ['REJECTED', 'EXPIRED'].includes(operation.state) && !operation.reservationReleasedAt) {
          await tx.fileObject.update({ where: { id: file.id }, data: this.retry(file, now, 'STORAGE_UNAVAILABLE') });
        }
      });
      return 'retry';
    }
    return this.state.locked(ownerId, fileId, async (tx, { file, user, now }) => {
      const operation = file.uploadOperation;
      if (file.uploadTransport !== 'SINGLE_PUT' || file.status !== 'PENDING_UPLOAD' || !operation || !['REJECTED', 'EXPIRED'].includes(operation.state) || operation.reservationReleasedAt) return 'skip';
      if (!operation.writesClosedAt || operation.id !== original.uploadOperation!.id || file.storageKey !== original.storageKey ||
          file.sizeBytes !== original.sizeBytes || +operation.writesClosedAt !== +original.uploadOperation!.writesClosedAt!) return 'blocked';
      if (user.reservedStorageBytes < file.sizeBytes) throw new Error('Inconsistent reservation');
      await tx.user.update({ where: { id: ownerId }, data: { reservedStorageBytes: { decrement: file.sizeBytes } } });
      await tx.uploadOperation.update({ where: { id: operation.id }, data: { reservationReleasedAt: now } });
      await tx.fileObject.update({ where: { id: file.id }, data: { cleanupRetryAfter: null, cleanupLastErrorCode: null } });
      return 'released';
    });
  }

  async runBatch(signal?: AbortSignal) {
    const summary = { selected: 0, released: 0, blocked: 0, retry: 0, skip: 0, failed: 0 };
    if (this.running || signal?.aborted) return summary;
    this.running = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.fileObject.findMany({ where: { uploadTransport: 'SINGLE_PUT', status: 'PENDING_UPLOAD', AND: [
        { OR: [{ confirmBy: { lte: now }, uploadOperation: { is: { state: 'OPEN' } } },
          { uploadOperation: { is: { state: { in: ['REJECTED', 'EXPIRED'] }, reservationReleasedAt: null } } }] },
        { OR: [{ cleanupRetryAfter: null }, { cleanupRetryAfter: { lte: now } }] },
      ] }, select: { id: true, ownerId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: CLEANUP_BATCH_SIZE });
      summary.selected = candidates.length;
      for (const candidate of candidates) {
        if (signal?.aborted) break;
        try { summary[await this.clean(candidate.ownerId, candidate.id)]++; }
        catch { summary.failed++; } // Per-file isolation; never log raw provider/DB errors.
      }
      return summary;
    } finally { this.running = false; }
  }
}
