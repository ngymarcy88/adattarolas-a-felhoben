import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';
import { MultipartStore, type Transfer } from './multipart.store';
import { TUS_STAGE_ID, TUS_STAGING_DIRECTORY, TUS_VERSION, tusAwaitingStorage } from './tus-staging.policy';

const RETRY_DELAY_MS = 60_000;
const SUCCESS_BATCH_SIZE = 4;

function canRelease(transfer: Transfer): boolean {
  return tusAwaitingStorage(transfer) && transfer.cleanupState === 'PENDING' && transfer.publicationExcludedAt !== null &&
    transfer.providerUploadId === null && transfer.ioOperations.length === 0 && !transfer.uploadOperation.reservationReleasedAt &&
    ['CANCELLED', 'EXPIRED', 'REJECTED'].includes(transfer.state);
}

@Injectable()
export class TusCleanupService {
  private readonly running = new Set<string>();

  constructor(private readonly store: MultipartStore, private readonly config: ConfigService) {}

  async releaseEarly(owner: string, id: string): Promise<void> {
    await this.withSlot(id, async () => {
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
    });
  }

  async cleanSuccessfulBatch(signal?: AbortSignal): Promise<void> {
    if (!this.config.getOrThrow<AppConfig>('app').tusStagingOrigin || signal?.aborted) return;
    const candidates = await this.store.prisma.multipartTransfer.findMany({
      where: {
        tusStaged: true, state: 'SUCCEEDED', tusUploadId: { not: null }, tusStageRemovedAt: null,
        OR: [{ cleanupRetryAfter: null }, { cleanupRetryAfter: { lte: new Date() } }],
      },
      select: { id: true, ownerId: true },
      orderBy: [{ cleanupRetryAfter: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: SUCCESS_BATCH_SIZE,
    });
    for (const { ownerId, id } of candidates) {
      if (signal?.aborted) break;
      try {
        await this.withSlot(id, () => this.cleanSuccessful(ownerId, id, signal));
      } catch {
        // The next pass can reconcile this transfer using its durable state.
      }
    }
  }

  private async cleanSuccessful(owner: string, id: string, signal?: AbortSignal): Promise<void> {
    const eligible = (t: Transfer, now: Date) => t.tusStaged && t.state === 'SUCCEEDED' &&
      t.uploadOperation.state === 'FINALIZED' && t.verifiedAt && t.verifiedSha256 === t.contentSha256 &&
      t.tusUploadId && !t.tusStageRemovedAt && (!t.cleanupRetryAfter || +t.cleanupRetryAfter <= +now);
    const stage = await this.store.locked(owner, id, async ({ transfer, now }) => eligible(transfer, now) ? transfer.tusUploadId : null);
    if (!stage || signal?.aborted) return;
    const removed = await this.removeStage(stage, signal);
    if (signal?.aborted) return;
    await this.store.locked(owner, id, async ({ tx, transfer, now }) => {
      if (!eligible(transfer, now) || transfer.tusUploadId !== stage) return;
      await tx.multipartTransfer.update({ where: { id }, data: removed
        ? { tusStageRemovedAt: now, cleanupRetryAfter: null }
        : { cleanupRetryAfter: new Date(+now + RETRY_DELAY_MS) } });
    });
  }

  private async withSlot(id: string, action: () => Promise<void>): Promise<void> {
    if (this.running.has(id) || this.running.size >= 2) return;
    this.running.add(id);
    try { await action(); }
    finally { this.running.delete(id); }
  }

  private async removeStage(id: string, signal?: AbortSignal): Promise<boolean> {
    const origin = this.config.getOrThrow<AppConfig>('app').tusStagingOrigin;
    if (!origin || !TUS_STAGE_ID.test(id)) return false;
    try {
      if (!(await lstat(TUS_STAGING_DIRECTORY)).isDirectory()) return false;
      const url = new URL('/files/' + id, origin);
      const timeout = AbortSignal.timeout(10000);
      const options = { redirect: 'error' as const, headers: { 'Tus-Resumable': TUS_VERSION },
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout };
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
