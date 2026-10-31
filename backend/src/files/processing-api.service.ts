import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingStateService, processingSourceFingerprint } from '../processing/processing-state.service';
import { PROCESSING_FAILURE_CODES, ProcessingStateError } from '../processing/processing-state.types';
import { thumbnailProcessingPolicy as policy } from '../processing/thumbnail-processor';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';
import { derivedStorageKey } from '../storage/storage-key';
import { processingIds, ProcessingRetryPipe } from './processing.dto';

const filesSelect = { id: true, ownerId: true, storageKey: true, sizeBytes: true, mimeType: true, detectedMimeType: true } satisfies Prisma.FileObjectSelect;
const jobsSelect = { id: true, ownerId: true, fileObjectId: true, processorKey: true, processorVersion: true,
  implementationFingerprint: true, sourceFingerprint: true, state: true, retryRevision: true, totalAttemptCount: true,
  nextAttemptAt: true, lastErrorCode: true, retryable: true, fence: true } satisfies Prisma.ProcessingJobSelect;
const resultSelect = { id: true, ownerId: true, fileObjectId: true, jobId: true, attemptId: true, kind: true, state: true,
  processorVersion: true, implementationFingerprint: true, sourceFingerprint: true, sourceSha256: true, publicationFence: true,
  storageKey: true, mimeType: true, sizeBytes: true, sha256: true, width: true, height: true, createdAt: true } satisfies Prisma.DerivedObjectSelect;
const attemptSelect = { id: true, jobId: true, ownerId: true, fileObjectId: true, phase: true, fence: true, candidateKey: true,
  sourceSha256: true, outputSha256: true, outputBytes: true, mimeType: true, width: true, height: true, reservedBytes: true, finalizedAt: true,
  reservationReleasedAt: true } satisfies Prisma.ProcessingAttemptSelect;
type Source = Prisma.FileObjectGetPayload<{ select: typeof filesSelect }>;
type Job = Prisma.ProcessingJobGetPayload<{ select: typeof jobsSelect }>;
type Result = Prisma.DerivedObjectGetPayload<{ select: typeof resultSelect }>;
type Attempt = Prisma.ProcessingAttemptGetPayload<{ select: typeof attemptSelect }>;
type View = { file: Source; job?: Job; result?: Result; attempt?: Attempt; cleanupPending: boolean };
const errorCodes = new Set<string>([...PROCESSING_FAILURE_CODES, 'DERIVED_QUOTA_EXCEEDED']);
const states = new Set(['QUEUED', 'RUNNING', 'RETRY_WAIT', 'BLOCKED_QUOTA', 'SUCCEEDED', 'FAILED', 'CANCELLED']);
const date = (value: Date) => Object.prototype.toString.call(value) === '[object Date]' && Number.isFinite(value.getTime());
const digest = (value: string) => typeof value === 'string' && value.length === 64 && /^[0-9a-f]+$/.test(value);
function unavailable(): never { throw new ApiError('PROCESSING_UNAVAILABLE'); }

@Injectable()
export class ProcessingApiService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly state: ProcessingStateService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  private assertType(file: Source): void {
    const configured: readonly string[] = this.config.getOrThrow<AppConfig>('app').allowedMimeTypes;
    if (!file.detectedMimeType || file.mimeType !== file.detectedMimeType || !policy.supportedMimeTypes.includes(file.detectedMimeType) ||
        !configured.includes(file.detectedMimeType)) throw new ApiError('PREVIEW_NOT_ALLOWED');
  }
  private assertJob(file: Source, job: Job): void {
    if (job.ownerId !== file.ownerId || job.fileObjectId !== file.id || job.processorKey !== policy.key || job.processorVersion !== policy.version ||
        job.implementationFingerprint !== policy.implementationFingerprint || job.sourceFingerprint !== processingSourceFingerprint(file) ||
        !states.has(job.state) || !Number.isInteger(job.retryRevision) || job.retryRevision < 0 || job.retryRevision > 2 ||
        !Number.isInteger(job.totalAttemptCount) || job.totalAttemptCount < 0 || job.totalAttemptCount > 9 ||
        job.nextAttemptAt !== null && !date(job.nextAttemptAt)) unavailable();
  }
  private assertResult(view: View): void {
    const { file, job, result: r, attempt: a } = view;
    if (!job || !r || !a || job.state !== 'SUCCEEDED' || r.ownerId !== file.ownerId || r.fileObjectId !== file.id ||
        r.jobId !== job.id || r.kind !== 'THUMBNAIL' || r.state !== 'READY' || r.processorVersion !== policy.version ||
        r.implementationFingerprint !== policy.implementationFingerprint || r.sourceFingerprint !== job.sourceFingerprint ||
        r.publicationFence !== job.fence || r.storageKey !== derivedStorageKey(file.ownerId, file.id, job.id, a.id) ||
        r.attemptId !== a.id || a.jobId !== job.id || a.ownerId !== file.ownerId || a.fileObjectId !== file.id ||
        a.phase !== 'PUBLISHED' || !a.finalizedAt || !date(a.finalizedAt) || a.reservationReleasedAt !== null || a.fence > r.publicationFence ||
        a.candidateKey !== r.storageKey || a.outputSha256 !== r.sha256 || a.sourceSha256 !== r.sourceSha256 ||
        a.outputBytes !== r.sizeBytes || a.reservedBytes !== r.sizeBytes || a.mimeType !== r.mimeType || a.width !== r.width || a.height !== r.height || !digest(r.sha256) || !digest(r.sourceSha256) ||
        r.mimeType !== 'image/webp' || r.sizeBytes < 1n || r.sizeBytes > 524288n || !date(r.createdAt) ||
        !Number.isInteger(r.width) || r.width < 1 || r.width > 512 || !Number.isInteger(r.height) || r.height < 1 || r.height > 512) unavailable();
  }

  /** A small repeatable-read projection. No storage calls, locks on user state, jobs or quota mutations. */
  private async read(ownerId: string, ids: readonly string[]): Promise<View[]> {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        const files = await tx.fileObject.findMany({ where: { id: { in: [...ids] }, ownerId, status: 'ACTIVE', deletedAt: null }, select: filesSelect });
        const byId = new Map(files.map(file => [file.id, file]));
        // Fail the whole batch before consulting types/jobs; never disclose which ID failed.
        if (files.length !== ids.length || ids.some(id => !byId.has(id)) || files.some(file => file.ownerId !== ownerId)) throw new ApiError('FILE_NOT_FOUND');
        for (const file of files) this.assertType(file);
        const jobs = await tx.processingJob.findMany({ where: { ownerId, fileObjectId: { in: [...ids] },
          processorKey: policy.key, processorVersion: policy.version }, select: jobsSelect });
        const jobMap = new Map<string, Job>();
        for (const job of jobs) {
          const file = byId.get(job.fileObjectId); if (!file || jobMap.has(file.id)) unavailable();
          this.assertJob(file, job); jobMap.set(file.id, job);
        }
        const jobIds = jobs.map(job => job.id);
        const results = jobIds.length ? await tx.derivedObject.findMany({ where: { ownerId, fileObjectId: { in: [...ids] }, jobId: { in: jobIds },
          kind: 'THUMBNAIL', state: 'READY' }, select: resultSelect }) : [];
        const attempts = jobIds.length ? await tx.processingAttempt.findMany({ where: { ownerId, fileObjectId: { in: [...ids] }, jobId: { in: jobIds } },
          select: attemptSelect }) : [];
        return ids.map(id => {
          const file = byId.get(id)!; const job = jobMap.get(id);
          const eligible = results.filter(result => result.jobId === job?.id); if (eligible.length > 1) unavailable();
          const result = job?.state === 'SUCCEEDED' ? eligible[0] : undefined;
          const attempt = result ? attempts.find(entry => entry.id === result.attemptId) : undefined;
          const cleanupPending = attempts.some(entry => entry.jobId === job?.id && entry.reservedBytes > 0n &&
            entry.finalizedAt === null && entry.reservationReleasedAt === null && ['ORPHANED', 'CLEANUP_BLOCKED'].includes(entry.phase));
          const view = { file, job, result, attempt, cleanupPending }; if (result) this.assertResult(view);
          return view;
        });
      }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 5000 });
    } catch (error) { if (error instanceof ApiError) throw error; unavailable(); }
  }

  async status(ownerId: string, fileIds: readonly string[]) {
    const ids = processingIds(fileIds);
    const views = await this.read(ownerId, ids);
    return { items: views.map(({ file, job, result, cleanupPending }) => ({ fileId: file.id, processorKey: policy.key, processorVersion: policy.version,
      state: job?.state ?? 'NOT_SCHEDULED', retryRevision: job?.retryRevision ?? 0, attemptCount: job?.totalAttemptCount ?? 0,
      nextAttemptAt: job?.nextAttemptAt?.toISOString() ?? null,
      errorCode: job?.lastErrorCode ? errorCodes.has(job.lastErrorCode) ? job.lastErrorCode.startsWith('STORAGE_') ? 'PROCESSING_STORAGE_UNAVAILABLE' : job.lastErrorCode : 'PROCESSING_UNAVAILABLE' : null,
      retryable: Boolean(job?.retryable && ['FAILED', 'BLOCKED_QUOTA', 'CANCELLED'].includes(job.state) && job.retryRevision < 2 && job.totalAttemptCount < 9),
      result: result ? { id: result.id, mimeType: result.mimeType, sizeBytes: Number(result.sizeBytes), width: result.width, height: result.height,
        createdAt: result.createdAt.toISOString() } : null, cleanupPending,
    })) };
  }

  private ready(view: View): Result { if (!view.result) throw new ApiError('THUMBNAIL_NOT_READY'); this.assertResult(view); return view.result; }
  private identity(view: View): string {
    const result = this.ready(view);
    return JSON.stringify([view.file.id, view.file.mimeType, processingSourceFingerprint(view.file), view.job!.id, view.job!.fence.toString(),
      result.id, result.storageKey, result.sha256, result.sourceSha256, result.publicationFence.toString(), result.sizeBytes.toString(),
      result.width, result.height, result.createdAt.toISOString()]);
  }
  async thumbnailUrl(ownerId: string, id: string) {
    const [fileId] = processingIds([id]); const initial = (await this.read(ownerId, [fileId]))[0]!;
    const result = this.ready(initial); const identity = this.identity(initial);
    let head;
    try { head = await this.storage.head(result.storageKey); } catch { unavailable(); }
    if (!head || head.contentType !== 'image/webp' || !Number.isSafeInteger(head.sizeBytes) || BigInt(head.sizeBytes) !== result.sizeBytes) unavailable();
    const app = this.config.getOrThrow<AppConfig>('app');
    if (!Number.isInteger(app.thumbnailPreviewTtlSeconds) || app.thumbnailPreviewTtlSeconds < 30 || app.thumbnailPreviewTtlSeconds > 300 ||
        !Number.isInteger(app.presignedUrlTtlSeconds) || app.presignedUrlTtlSeconds < 1 || app.presignedUrlTtlSeconds > 300) unavailable();
    const deadline = Date.now() + Math.min(app.thumbnailPreviewTtlSeconds, app.presignedUrlTtlSeconds, 300) * 1000;
    let access;
    try { access = await this.storage.createReadAccess({ key: result.storageKey, mimeType: 'image/webp', originalName: 'thumbnail.webp', disposition: 'inline', expiresAt: new Date(deadline) }); }
    catch { unavailable(); }
    const current = (await this.read(ownerId, [fileId]))[0]!;
    if (this.identity(current) !== identity) unavailable();
    try {
      if (typeof access.url !== 'string' || !date(access.expiresAt) || +access.expiresAt <= Date.now() || +access.expiresAt > deadline) unavailable();
      const url = new URL(access.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
          url.origin === new URL(app.frontendPublicUrl).origin) unavailable();
    } catch { unavailable(); }
    return { url: access.url, expiresAt: access.expiresAt.toISOString() };
  }

  async retry(ownerId: string, id: string, expectedRetryRevision: number) {
    const [fileId] = processingIds([id]); new ProcessingRetryPipe().transform({ expectedRetryRevision });
    const view = (await this.read(ownerId, [fileId]))[0]!;
    if (!view.job) throw new ApiError('PROCESSING_RETRY_NOT_ALLOWED');
    try {
      const outcome = await this.state.retryWithOutcome(ownerId, fileId, view.job.id, expectedRetryRevision);
      const job = outcome.job;
      return { changed: outcome.changed, body: { fileId, processorKey: job.processorKey, processorVersion: job.processorVersion,
        state: job.state, retryRevision: job.retryRevision } };
    } catch (error) {
      if (error instanceof ProcessingStateError) {
        if (error.code === 'SOURCE_NOT_ACTIVE' || error.code === 'PROCESSING_NOT_FOUND') throw new ApiError('FILE_NOT_FOUND');
        if (error.code === 'PROCESSING_POLICY_MISMATCH') await this.read(ownerId, [fileId]);
        if (error.code === 'PROCESSING_STATE_CONFLICT' || error.code === 'PROCESSING_RETRY_EXHAUSTED') throw new ApiError('PROCESSING_RETRY_NOT_ALLOWED');
      }
      unavailable();
    }
  }
}
