import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';
import { MultipartStore, type Transfer } from './multipart.store';
import { TUS_STAGE_ID, TUS_STAGING_DIRECTORY, TUS_VERSION, tusAwaitingStorage } from './tus-staging.policy';

function canRelease(transfer: Transfer): boolean {
  return tusAwaitingStorage(transfer) && transfer.cleanupState === 'PENDING' && transfer.publicationExcludedAt !== null &&
    transfer.providerUploadId === null && transfer.ioOperations.length === 0 && !transfer.uploadOperation.reservationReleasedAt &&
    ['CANCELLED', 'EXPIRED', 'REJECTED'].includes(transfer.state);
}

@Injectable()
export class TusEarlyCleanupService {
  private readonly running = new Set<string>();

  constructor(private readonly store: MultipartStore, private readonly config: ConfigService) {}

  async run(owner: string, id: string): Promise<void> {
    if (this.running.has(id) || this.running.size >= 2) return;
    this.running.add(id);
    try {
      const planned = await this.store.locked(owner, id, async ({ transfer }) => canRelease(transfer) ? transfer : null);
      if (!planned) return;
      if (planned.tusCreateStarted && (!planned.tusUploadId || !await this.removeStage(planned.tusUploadId))) return;

      await this.store.locked(owner, id, async ({ tx, user, transfer, now }) => {
        if (!canRelease(transfer) || transfer.tusCreateStarted !== planned.tusCreateStarted || transfer.tusUploadId !== planned.tusUploadId) return;
        if (user.reservedStorageBytes < transfer.sizeBytes) throw new ApiError('DATABASE_UNAVAILABLE');
        // A terminal transfer without a committed S3 intent could never create an S3 session or object.
        await tx.multipartTransfer.update({ where: { id }, data: {
          cleanupState: 'VERIFIED', writesClosedAt: now, objectAbsentAt: now, partsAbsentAt: now,
          closureEvidenceType: 'tus_pre_s3_v1', closureEvidenceRef: id, revision: { increment: 1 },
        } });
        await tx.uploadOperation.update({ where: { id: transfer.uploadOperationId }, data: {
          writesClosedAt: now, reservationReleasedAt: now,
        } });
        await tx.user.update({ where: { id: owner }, data: { reservedStorageBytes: { decrement: transfer.sizeBytes } } });
      });
    } finally {
      this.running.delete(id);
    }
  }

  private async removeStage(id: string): Promise<boolean> {
    const origin = this.config.getOrThrow<AppConfig>('app').tusStagingOrigin;
    if (!origin || !TUS_STAGE_ID.test(id)) return false;
    try {
      if (!(await lstat(TUS_STAGING_DIRECTORY)).isDirectory()) return false;
      const url = new URL('/files/' + id, origin);
      const options = { redirect: 'error' as const, headers: { 'Tus-Resumable': TUS_VERSION }, signal: AbortSignal.timeout(10000) };
      const deletion = await fetch(url, { ...options, method: 'DELETE' });
      void deletion.body?.cancel().catch(() => {});
      if (deletion.status !== 204 && deletion.status !== 404) return false;
      const head = await fetch(url, { ...options, method: 'HEAD' });
      if (head.status !== 404) return false;
      // HEAD alone can be 404 with one file still present after an interrupted termination.
      const entries = await Promise.allSettled([lstat(join(TUS_STAGING_DIRECTORY, id)), lstat(join(TUS_STAGING_DIRECTORY, id + '.info'))]);
      return entries.every(entry => entry.status === 'rejected' && (entry.reason as NodeJS.ErrnoException)?.code === 'ENOENT');
    } catch {
      return false;
    }
  }
}
