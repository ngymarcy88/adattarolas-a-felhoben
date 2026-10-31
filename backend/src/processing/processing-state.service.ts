import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config';
import type { DerivedObject, FileObject, Prisma, ProcessingAttempt, ProcessingJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { derivedStorageKey, originalStorageKey } from '../storage/storage-key';
import { PROCESSING_FAILURE_CODES, ProcessingStateError, type CandidateMetadata, type Claim,
  type ProcessingFailureCode, type ProcessingPolicy, type Reservation } from './processing-state.types';
export { ProcessingStateError } from './processing-state.types';

const LEASE_MS = 90_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const permanent = new Set<ProcessingFailureCode>(['SOURCE_CHANGED', 'SOURCE_NOT_ACTIVE',
  'PROCESSOR_INPUT_UNSUPPORTED', 'PROCESSOR_INPUT_INVALID', 'PROCESSOR_INPUT_LIMIT', 'PROCESSOR_OUTPUT_LIMIT']);
type UserBalance = { usedStorageBytes: bigint; reservedStorageBytes: bigint; storageLimitBytes: bigint };
type View = { user: UserBalance; file: FileObject; job: ProcessingJob | null; attempts: ProcessingAttempt[] };
type Tx = Prisma.TransactionClient;
function error(code: ConstructorParameters<typeof ProcessingStateError>[0]): never { throw new ProcessingStateError(code); }
const add = (time: Date, ms: number) => new Date(time.getTime() + ms);

/** Internal explicit state machine. No worker, storage I/O, automatic scheduling or proof inference. */
export class ProcessingStateService {
  private readonly policy: ProcessingPolicy;
  private readonly allowedMimeTypes: readonly string[];
  private readonly maxUploadBytes: number;
  constructor(private readonly prisma: PrismaService, config: ConfigService, policy: ProcessingPolicy) {
    if (!policy || policy.key !== 'thumbnail' || policy.version !== '1.0.0' ||
        typeof policy.implementationFingerprint !== 'string' || !this.matches(hash, policy.implementationFingerprint) ||
        !Array.isArray(policy.supportedMimeTypes) || policy.supportedMimeTypes.length !== supported.length ||
        new Set(policy.supportedMimeTypes).size !== supported.length || policy.supportedMimeTypes.some((mime) => !supported.includes(mime))) {
      error('PROCESSING_POLICY_MISMATCH');
    }
    this.policy = Object.freeze({ key: policy.key, version: policy.version, implementationFingerprint: policy.implementationFingerprint,
      supportedMimeTypes: Object.freeze([...policy.supportedMimeTypes]) });
    const app = config.getOrThrow<AppConfig>('app');
    this.allowedMimeTypes = Object.freeze([...app.allowedMimeTypes]); this.maxUploadBytes = app.maxUploadBytes;
  }

  private matches(pattern: RegExp, value: unknown): value is string {
    return typeof value === 'string' && pattern.exec(value)?.[0] === value;
  }
  private ids(...values: unknown[]): void {
    if (values.some((value) => !this.matches(uuid, value))) error('PROCESSING_INVALID_ARGUMENT');
  }
  private claimInput(claim: Claim): void {
    if (!claim || typeof claim.fence !== 'bigint' || claim.fence < 1n ||
        claim.implementationFingerprint !== this.policy.implementationFingerprint) error('PROCESSING_INVALID_ARGUMENT');
    this.ids(claim.ownerId, claim.fileId, claim.jobId, claim.attemptId, claim.leaseOwner);
  }
  private snapshotClaim(claim: Claim): Claim {
    if (!claim || typeof claim !== 'object') error('PROCESSING_INVALID_ARGUMENT');
    const snapshot: Claim = Object.freeze({ ownerId: claim.ownerId, fileId: claim.fileId, jobId: claim.jobId,
      attemptId: claim.attemptId, leaseOwner: claim.leaseOwner, fence: claim.fence,
      implementationFingerprint: claim.implementationFingerprint });
    this.claimInput(snapshot); return snapshot;
  }
  private async now(tx: Tx): Promise<Date> {
    const rows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) error('PROCESSING_DATABASE_UNAVAILABLE');
    return now;
  }
  private async locked<T>(ownerId: string, fileId: string, jobId: string | null,
    action: (tx: Tx, view: View) => Promise<T>): Promise<T> {
    this.ids(ownerId, fileId); if (jobId !== null) this.ids(jobId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        const users = await tx.$queryRaw<UserBalance[]>`SELECT "usedStorageBytes", "reservedStorageBytes", "storageLimitBytes" FROM "User" WHERE "id" = ${ownerId}::uuid FOR UPDATE`;
        if (!users[0]) error('PROCESSING_NOT_FOUND');
        const files = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FileObject" WHERE "id" = ${fileId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
        if (!files[0]) error('PROCESSING_NOT_FOUND');
        const file = await tx.fileObject.findUnique({ where: { id: fileId } });
        if (!file || file.ownerId !== ownerId) error('PROCESSING_NOT_FOUND');
        let job: ProcessingJob | null = null; let attempts: ProcessingAttempt[] = [];
        if (jobId !== null) {
          await tx.$queryRaw`SELECT "id" FROM "ProcessingJob" WHERE "id" = ${jobId}::uuid AND "ownerId" = ${ownerId}::uuid AND "fileObjectId" = ${fileId}::uuid FOR UPDATE`;
          job = await tx.processingJob.findUnique({ where: { id: jobId } });
          if (!job || job.ownerId !== ownerId || job.fileObjectId !== fileId) error('PROCESSING_NOT_FOUND');
          await tx.$queryRaw`SELECT "id" FROM "ProcessingAttempt" WHERE "jobId" = ${jobId}::uuid AND "ownerId" = ${ownerId}::uuid AND "fileObjectId" = ${fileId}::uuid ORDER BY "ordinal" FOR UPDATE`;
          attempts = await tx.processingAttempt.findMany({ where: { jobId }, orderBy: { ordinal: 'asc' } });
          if (attempts.some((attempt) => attempt.ownerId !== ownerId || attempt.fileObjectId !== fileId)) error('PROCESSING_STATE_CONFLICT');
        }
        return action(tx, { user: users[0], file, job, attempts });
      }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });
    } catch (failure) {
      if (failure instanceof ProcessingStateError) throw failure;
      error('PROCESSING_DATABASE_UNAVAILABLE');
    }
  }
  private sourceFingerprint(file: FileObject): string {
    return createHash('sha256').update(JSON.stringify({ fileId: file.id, storageKey: file.storageKey,
      sizeBytes: file.sizeBytes.toString(), detectedMimeType: file.detectedMimeType })).digest('hex');
  }
  private source(file: FileObject, active = true): void {
    if (active && (file.status !== 'ACTIVE' || file.deletedAt !== null)) error('SOURCE_NOT_ACTIVE');
    if (!file.detectedMimeType || file.mimeType !== file.detectedMimeType ||
        !this.policy.supportedMimeTypes.includes(file.detectedMimeType) || !this.allowedMimeTypes.includes(file.detectedMimeType)) {
      error('PROCESSING_POLICY_MISMATCH');
    }
    if (file.sizeBytes < 1n || file.sizeBytes > BigInt(this.maxUploadBytes) || file.storageKey !== originalStorageKey(file.ownerId, file.id)) {
      error('SOURCE_CHANGED');
    }
  }
  private jobPolicy(view: View): ProcessingJob {
    const job = view.job; if (!job) error('PROCESSING_NOT_FOUND');
    if (job.processorKey !== this.policy.key || job.processorVersion !== this.policy.version ||
        job.implementationFingerprint !== this.policy.implementationFingerprint) error('PROCESSING_POLICY_MISMATCH');
    return job;
  }
  private job(view: View, active = true): ProcessingJob {
    const job = this.jobPolicy(view);
    this.source(view.file, active);
    if (job.sourceFingerprint !== this.sourceFingerprint(view.file)) error('SOURCE_CHANGED');
    return job;
  }
  private live(view: View, claim: Claim, now: Date, sourceFailure = false): { job: ProcessingJob; attempt: ProcessingAttempt; deadline: Date } {
    const job = sourceFailure ? this.jobPolicy(view) : this.job(view);
    const attempt = view.attempts.find((entry) => entry.id === claim.attemptId);
    if (!attempt || job.state !== 'RUNNING' || job.fence !== claim.fence || attempt.fence !== claim.fence ||
        job.leaseOwner !== claim.leaseOwner || !job.leaseUntil || job.leaseUntil.getTime() <= now.getTime()) error('PROCESSING_LEASE_LOST');
    return { job, attempt, deadline: new Date(job.leaseUntil.getTime()) };
  }
  private async beforeCommit(tx: Tx, deadline: Date): Promise<void> {
    if ((await this.now(tx)).getTime() >= deadline.getTime()) error('PROCESSING_LEASE_LOST');
  }
  private async retire(tx: Tx, attempt: ProcessingAttempt, now: Date): Promise<ProcessingAttempt> {
    if (attempt.phase === 'PREPARING') {
      if (attempt.reservedBytes !== 0n || attempt.writeStartedAt !== null) error('PROCESSING_STATE_CONFLICT');
      return tx.processingAttempt.update({ where: { id: attempt.id }, data: {
        phase: 'RELEASED', reservationReleasedAt: now, cleanupRetryAfter: null, updatedAt: now } });
    }
    if (['WRITE_PENDING', 'STORED', 'ORPHANED'].includes(attempt.phase)) {
      return tx.processingAttempt.update({ where: { id: attempt.id }, data: {
        phase: 'CLEANUP_BLOCKED', cleanupRetryAfter: add(now, 60_000), updatedAt: now } });
    }
    return attempt;
  }

  /** Caller must hold User and FileObject locks in this SAME transaction; never call after commit.
   * Only the fresh PENDING→ACTIVE confirm path uses this hook. ACTIVE replay must not backfill.
   * This creates durable intent only: no decoder, worker, I/O or derived reservation.
   */
  async enqueueConfirmedFile(tx: Tx, confirmedFile: FileObject): Promise<ProcessingJob | null> {
    const file = Object.freeze({ ...confirmedFile });
    this.ids(file.ownerId, file.id);
    if (file.status !== 'ACTIVE' || file.deletedAt !== null || !file.detectedMimeType ||
        file.mimeType !== file.detectedMimeType || !this.policy.supportedMimeTypes.includes(file.detectedMimeType) ||
        !this.allowedMimeTypes.includes(file.detectedMimeType)) return null;
    return this.ensureJob(tx, file);
  }

  private async ensureJob(tx: Tx, file: FileObject): Promise<ProcessingJob> {
    this.source(file);
    const existing = await tx.processingJob.findFirst({ where: { ownerId: file.ownerId, fileObjectId: file.id,
      processorKey: this.policy.key, processorVersion: this.policy.version } });
    if (existing) {
      await tx.$queryRaw`SELECT "id" FROM "ProcessingJob" WHERE "id" = ${existing.id}::uuid FOR UPDATE`;
      const current = await tx.processingJob.findUnique({ where: { id: existing.id } });
      if (!current) error('PROCESSING_NOT_FOUND');
      if (current.ownerId !== file.ownerId || current.fileObjectId !== file.id || current.processorKey !== this.policy.key ||
          current.processorVersion !== this.policy.version || current.implementationFingerprint !== this.policy.implementationFingerprint) {
        error('PROCESSING_POLICY_MISMATCH');
      }
      if (current.sourceFingerprint !== this.sourceFingerprint(file)) error('SOURCE_CHANGED');
      return current;
    }
    const now = await this.now(tx);
    return tx.processingJob.create({ data: { id: randomUUID(), ownerId: file.ownerId, fileObjectId: file.id,
      processorKey: this.policy.key, processorVersion: this.policy.version,
      implementationFingerprint: this.policy.implementationFingerprint, sourceFingerprint: this.sourceFingerprint(file),
      state: 'QUEUED', createdAt: now, updatedAt: now } });
  }

  async createJob(ownerId: string, fileId: string): Promise<ProcessingJob> {
    return this.locked(ownerId, fileId, null, (tx, view) => this.ensureJob(tx, view.file));
  }

  async claim(ownerId: string, fileId: string, jobId: string, leaseOwner: string): Promise<Claim | null> {
    this.ids(leaseOwner);
    return this.locked(ownerId, fileId, jobId, async (tx, view) => {
      const job = this.job(view); const now = await this.now(tx);
      if (job.state === 'RUNNING' && job.leaseUntil && job.leaseUntil.getTime() > now.getTime()) return null;
      if (!['QUEUED', 'RETRY_WAIT', 'RUNNING'].includes(job.state)) return null;
      if (job.state === 'RETRY_WAIT' && job.nextAttemptAt && job.nextAttemptAt.getTime() > now.getTime()) return null;
      for (const attempt of view.attempts) await this.retire(tx, attempt, now);
      if (job.cycleAttemptCount >= 3 || job.totalAttemptCount >= 9) {
        await tx.processingJob.update({ where: { id: jobId }, data: { state: 'FAILED', leaseOwner: null, leaseUntil: null,
          nextAttemptAt: null, lastErrorCode: 'PROCESSOR_TIMEOUT', retryable: job.retryRevision < 2 && job.totalAttemptCount < 9,
          finishedAt: now, updatedAt: now } });
        return null;
      }
      const fence = job.fence + 1n; const attemptId = randomUUID(); const deadline = add(now, LEASE_MS);
      await tx.processingJob.update({ where: { id: jobId }, data: { state: 'RUNNING', fence,
        cycleAttemptCount: job.cycleAttemptCount + 1, totalAttemptCount: job.totalAttemptCount + 1,
        leaseOwner, leaseUntil: deadline, nextAttemptAt: null, lastErrorCode: null, retryable: false, finishedAt: null, updatedAt: now } });
      await tx.processingAttempt.create({ data: { id: attemptId, ownerId, fileObjectId: fileId, jobId, fence,
        ordinal: job.totalAttemptCount + 1, candidateKey: derivedStorageKey(ownerId, fileId, jobId, attemptId),
        phase: 'PREPARING', reservedBytes: 0n, createdAt: now, updatedAt: now } });
      await this.beforeCommit(tx, deadline);
      return { ownerId, fileId, jobId, attemptId, leaseOwner, fence, implementationFingerprint: this.policy.implementationFingerprint };
    });
  }

  async heartbeat(claim: Claim): Promise<void> {
    claim = this.snapshotClaim(claim);
    await this.locked(claim.ownerId, claim.fileId, claim.jobId, async (tx, view) => {
      const now = await this.now(tx); const live = this.live(view, claim, now);
      await tx.processingJob.update({ where: { id: claim.jobId }, data: { leaseUntil: add(now, LEASE_MS), updatedAt: now } });
      await this.beforeCommit(tx, live.deadline);
    });
  }

  async retry(ownerId: string, fileId: string, jobId: string, expectedRetryRevision: number): Promise<ProcessingJob> {
    if (!Number.isSafeInteger(expectedRetryRevision) || expectedRetryRevision < 0 || expectedRetryRevision > 2) {
      error('PROCESSING_INVALID_ARGUMENT');
    }
    return this.locked(ownerId, fileId, jobId, async (tx, view) => {
      const job = this.job(view); const now = await this.now(tx);
      if (expectedRetryRevision > job.retryRevision) error('PROCESSING_STATE_CONFLICT');
      if (expectedRetryRevision < job.retryRevision || job.state === 'SUCCEEDED') return job;
      if (!job.retryable || !['FAILED', 'BLOCKED_QUOTA', 'CANCELLED'].includes(job.state)) error('PROCESSING_STATE_CONFLICT');
      if (job.retryRevision >= 2 || job.totalAttemptCount >= 9) error('PROCESSING_RETRY_EXHAUSTED');
      for (const attempt of view.attempts) await this.retire(tx, attempt, now);
      return tx.processingJob.update({ where: { id: jobId }, data: { state: 'QUEUED', cycleAttemptCount: 0,
        recoveryProbeCount: 0, retryRevision: job.retryRevision + 1, fence: job.fence + 1n,
        nextAttemptAt: null, lastErrorCode: null, retryable: false, finishedAt: null, leaseOwner: null, leaseUntil: null, updatedAt: now } });
    });
  }

  async fail(claim: Claim, safeFailureCode: ProcessingFailureCode): Promise<ProcessingJob> {
    claim = this.snapshotClaim(claim);
    if (!(PROCESSING_FAILURE_CODES as readonly string[]).includes(safeFailureCode)) error('PROCESSING_INVALID_ARGUMENT');
    return this.locked(claim.ownerId, claim.fileId, claim.jobId, async (tx, view) => {
      const now = await this.now(tx); const live = this.live(view, claim, now, safeFailureCode === 'SOURCE_CHANGED' || safeFailureCode === 'SOURCE_NOT_ACTIVE');
      if (safeFailureCode === 'SOURCE_NOT_ACTIVE' && view.file.status === 'ACTIVE' && view.file.deletedAt === null) {
        error('PROCESSING_STATE_CONFLICT');
      }
      await this.retire(tx, live.attempt, now);
      if (safeFailureCode === 'SOURCE_NOT_ACTIVE') {
        const cancelled = await tx.processingJob.update({ where: { id: claim.jobId }, data: { state: 'CANCELLED',
          fence: live.job.fence + 1n, leaseOwner: null, leaseUntil: null, nextAttemptAt: null, finishedAt: now,
          lastErrorCode: 'SOURCE_NOT_ACTIVE', retryable: live.job.retryRevision < 2 && live.job.totalAttemptCount < 9, updatedAt: now } });
        await this.beforeCommit(tx, live.deadline); return cancelled;
      }
      const retry = !permanent.has(safeFailureCode) && live.job.cycleAttemptCount < 3 && live.job.totalAttemptCount < 9;
      const result = await tx.processingJob.update({ where: { id: claim.jobId }, data: { state: retry ? 'RETRY_WAIT' : 'FAILED',
        nextAttemptAt: retry ? add(now, live.job.cycleAttemptCount === 1 ? 5000 : 30000) : null,
        finishedAt: retry ? null : now, lastErrorCode: safeFailureCode, leaseOwner: null, leaseUntil: null,
        retryable: !retry && !permanent.has(safeFailureCode) && live.job.retryRevision < 2 && live.job.totalAttemptCount < 9, updatedAt: now } });
      await this.beforeCommit(tx, live.deadline); return result;
    });
  }

  async cancel(ownerId: string, fileId: string, jobId: string): Promise<ProcessingJob> {
    return this.locked(ownerId, fileId, jobId, async (tx, view) => {
      const job = view.job!;
      if (view.file.status === 'ACTIVE' && view.file.deletedAt === null) error('PROCESSING_STATE_CONFLICT');
      if (job.state === 'SUCCEEDED' || job.state === 'CANCELLED') return job;
      const now = await this.now(tx);
      for (const attempt of view.attempts) await this.retire(tx, attempt, now);
      return tx.processingJob.update({ where: { id: jobId }, data: { state: 'CANCELLED', fence: job.fence + 1n,
        nextAttemptAt: null, leaseOwner: null, leaseUntil: null, finishedAt: now,
        lastErrorCode: 'SOURCE_NOT_ACTIVE', retryable: job.retryRevision < 2 && job.totalAttemptCount < 9, updatedAt: now } });
    });
  }

  private candidate(input: CandidateMetadata): CandidateMetadata {
    if (!input || typeof input !== 'object') error('PROCESSING_INVALID_ARGUMENT');
    input = Object.freeze({ sourceSha256: input.sourceSha256, sourceETag: input.sourceETag,
      outputSha256: input.outputSha256, sizeBytes: input.sizeBytes, width: input.width, height: input.height,
      implementationFingerprint: input.implementationFingerprint });
    if (!this.matches(hash, input.sourceSha256) || !this.matches(hash, input.outputSha256) ||
        input.implementationFingerprint !== this.policy.implementationFingerprint ||
        !this.matches(/^"[^"\x00-\x20\x7f]{1,254}"$/, input.sourceETag) ||
        !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 524288 ||
        !Number.isSafeInteger(input.width) || input.width < 1 || input.width > 512 ||
        !Number.isSafeInteger(input.height) || input.height < 1 || input.height > 512) error('PROCESSING_INVALID_ARGUMENT');
    return input;
  }
  private sameCandidate(attempt: ProcessingAttempt, candidate: CandidateMetadata): void {
    if (attempt.sourceSha256 !== candidate.sourceSha256 || attempt.sourceETag !== candidate.sourceETag) error('SOURCE_CHANGED');
    if (attempt.outputSha256 !== candidate.outputSha256 || attempt.outputBytes !== BigInt(candidate.sizeBytes) ||
        attempt.width !== candidate.width || attempt.height !== candidate.height || attempt.mimeType !== 'image/webp') {
      error('PROCESSING_STATE_CONFLICT');
    }
  }
  private async winner(tx: Tx, view: View, claim: Claim): Promise<DerivedObject> {
    const job = this.job(view);
    await tx.$queryRaw`SELECT "id" FROM "DerivedObject" WHERE "jobId" = ${job.id}::uuid FOR UPDATE`;
    const result = await tx.derivedObject.findFirst({ where: { jobId: job.id, kind: 'THUMBNAIL' } });
    const attempt = view.attempts.find((entry) => entry.id === claim.attemptId);
    if (!result || job.state !== 'SUCCEEDED' || result.state !== 'READY' || result.ownerId !== claim.ownerId ||
        result.fileObjectId !== claim.fileId || result.attemptId !== claim.attemptId || result.publicationFence !== claim.fence ||
        result.implementationFingerprint !== this.policy.implementationFingerprint || result.sourceFingerprint !== job.sourceFingerprint ||
        result.processorVersion !== this.policy.version || !attempt || attempt.phase !== 'PUBLISHED' || !attempt.finalizedAt ||
        result.storageKey !== attempt.candidateKey || result.sourceSha256 !== attempt.sourceSha256 ||
        result.sha256 !== attempt.outputSha256 || result.sizeBytes !== attempt.outputBytes || result.width !== attempt.width || result.height !== attempt.height) {
      error('PROCESSING_STATE_CONFLICT');
    }
    return result;
  }

  async reserve(claim: Claim, input: CandidateMetadata): Promise<Reservation> {
    claim = this.snapshotClaim(claim); const candidate = this.candidate(input);
    return this.locked(claim.ownerId, claim.fileId, claim.jobId, async (tx, view) => {
      const job = this.job(view);
      if (job.state === 'SUCCEEDED') {
        const result = await this.winner(tx, view, claim);
        this.sameCandidate(view.attempts.find((attempt) => attempt.id === result.attemptId)!, candidate);
        return { kind: 'succeeded', result };
      }
      if (job.state === 'BLOCKED_QUOTA') {
        const blocked = view.attempts.find((entry) => entry.id === claim.attemptId && entry.fence === claim.fence);
        if (!blocked || blocked.phase !== 'RELEASED' || blocked.reservedBytes !== 0n || job.fence !== claim.fence + 1n) {
          error('PROCESSING_LEASE_LOST');
        }
        return { kind: 'blocked', attempt: blocked };
      }
      const now = await this.now(tx); const live = this.live(view, claim, now); const attempt = live.attempt;
      if (view.attempts.some((entry) => entry.sourceSha256 !== null && entry.sourceSha256 !== candidate.sourceSha256)) error('SOURCE_CHANGED');
      if (attempt.phase === 'WRITE_PENDING' || attempt.phase === 'STORED') {
        this.sameCandidate(attempt, candidate); await this.beforeCommit(tx, live.deadline);
        return { kind: attempt.phase === 'WRITE_PENDING' ? 'pending' : 'stored', attempt };
      }
      if (attempt.phase !== 'PREPARING' || attempt.reservedBytes !== 0n) error('PROCESSING_STATE_CONFLICT');
      const bytes = BigInt(candidate.sizeBytes);
      if (view.user.usedStorageBytes < 0n || view.user.reservedStorageBytes < 0n) error('PROCESSING_STATE_CONFLICT');
      if (view.user.usedStorageBytes + view.user.reservedStorageBytes + bytes > view.user.storageLimitBytes) {
        const blocked = await this.retire(tx, attempt, now);
        await tx.processingJob.update({ where: { id: claim.jobId }, data: { state: 'BLOCKED_QUOTA', fence: job.fence + 1n,
          leaseOwner: null, leaseUntil: null, nextAttemptAt: null, finishedAt: null, lastErrorCode: 'DERIVED_QUOTA_EXCEEDED',
          retryable: job.retryRevision < 2 && job.totalAttemptCount < 9, updatedAt: now } });
        await this.beforeCommit(tx, live.deadline); return { kind: 'blocked', attempt: blocked };
      }
      const reserved = await tx.processingAttempt.update({ where: { id: attempt.id }, data: {
        phase: 'WRITE_PENDING', sourceSha256: candidate.sourceSha256, sourceETag: candidate.sourceETag,
        outputSha256: candidate.outputSha256, mimeType: 'image/webp', width: candidate.width, height: candidate.height,
        outputBytes: bytes, reservedBytes: bytes, writeStartedAt: now, updatedAt: now } });
      await tx.user.update({ where: { id: claim.ownerId }, data: { reservedStorageBytes: { increment: bytes }, updatedAt: now } });
      await this.beforeCommit(tx, live.deadline); return { kind: 'reserved', attempt: reserved };
    });
  }

  async markStored(claim: Claim): Promise<ProcessingAttempt> {
    claim = this.snapshotClaim(claim);
    return this.locked(claim.ownerId, claim.fileId, claim.jobId, async (tx, view) => {
      if (this.job(view).state === 'SUCCEEDED') {
        const winner = await this.winner(tx, view, claim); return view.attempts.find((attempt) => attempt.id === winner.attemptId)!;
      }
      const now = await this.now(tx); const live = this.live(view, claim, now);
      if (!['WRITE_PENDING', 'STORED'].includes(live.attempt.phase)) error('PROCESSING_STATE_CONFLICT');
      const attempt = live.attempt.phase === 'STORED' ? live.attempt : await tx.processingAttempt.update({ where: { id: claim.attemptId },
        data: { phase: 'STORED', writeSettledAt: now, updatedAt: now } });
      await this.beforeCommit(tx, live.deadline); return attempt;
    });
  }

  async finalize(claim: Claim, requestId?: string): Promise<DerivedObject> {
    claim = this.snapshotClaim(claim);
    if (requestId !== undefined && !this.matches(/^[A-Za-z0-9_-]{1,64}$/, requestId)) error('PROCESSING_INVALID_ARGUMENT');
    return this.locked(claim.ownerId, claim.fileId, claim.jobId, async (tx, view) => {
      if (this.job(view).state === 'SUCCEEDED') return this.winner(tx, view, claim);
      const now = await this.now(tx); const live = this.live(view, claim, now); const attempt = live.attempt;
      if (attempt.phase !== 'STORED' || !attempt.writeSettledAt || attempt.reservationReleasedAt || attempt.finalizedAt ||
          !attempt.outputBytes || attempt.reservedBytes !== attempt.outputBytes || !attempt.sourceSha256 || !attempt.outputSha256 ||
          !attempt.width || !attempt.height || attempt.mimeType !== 'image/webp' || view.user.reservedStorageBytes < attempt.reservedBytes ||
          attempt.candidateKey !== derivedStorageKey(claim.ownerId, claim.fileId, claim.jobId, claim.attemptId)) error('PROCESSING_STATE_CONFLICT');
      if (view.attempts.some((entry) => entry.sourceSha256 !== null && entry.sourceSha256 !== attempt.sourceSha256)) error('SOURCE_CHANGED');
      await tx.$queryRaw`SELECT "id" FROM "DerivedObject" WHERE "jobId" = ${claim.jobId}::uuid FOR UPDATE`;
      if (await tx.derivedObject.findFirst({ where: { jobId: claim.jobId, kind: 'THUMBNAIL' } })) error('PROCESSING_STATE_CONFLICT');
      const result = await tx.derivedObject.create({ data: { id: randomUUID(), ownerId: claim.ownerId, fileObjectId: claim.fileId,
        jobId: claim.jobId, attemptId: claim.attemptId, kind: 'THUMBNAIL', processorVersion: this.policy.version,
        sourceFingerprint: live.job.sourceFingerprint, sourceSha256: attempt.sourceSha256,
        implementationFingerprint: this.policy.implementationFingerprint, publicationFence: claim.fence,
        storageKey: attempt.candidateKey, mimeType: 'image/webp', sizeBytes: attempt.outputBytes, sha256: attempt.outputSha256,
        width: attempt.width, height: attempt.height, state: 'READY', createdAt: now } });
      await tx.processingAttempt.update({ where: { id: attempt.id }, data: { phase: 'PUBLISHED', finalizedAt: now, cleanupRetryAfter: null, updatedAt: now } });
      await tx.processingJob.update({ where: { id: claim.jobId }, data: { state: 'SUCCEEDED', leaseOwner: null, leaseUntil: null,
        nextAttemptAt: null, lastErrorCode: null, retryable: false, finishedAt: now, updatedAt: now } });
      await tx.user.update({ where: { id: claim.ownerId }, data: { reservedStorageBytes: { decrement: attempt.reservedBytes },
        usedStorageBytes: { increment: attempt.reservedBytes }, updatedAt: now } });
      await tx.auditEvent.create({ data: { actorUserId: claim.ownerId, action: 'PROCESSING_SUCCEEDED', resourceType: 'FILE_OBJECT',
        resourceId: claim.fileId, requestId: requestId ?? randomUUID(), metadata: { jobId: claim.jobId, attemptId: claim.attemptId, processorKey: this.policy.key,
          processorVersion: this.policy.version, ...(requestId ? { requestId } : {}) }, createdAt: now } });
      await this.beforeCommit(tx, live.deadline); return result;
    });
  }

  async blockCleanup(ownerId: string, fileId: string, jobId: string, attemptId: string): Promise<ProcessingAttempt> {
    this.ids(attemptId);
    return this.locked(ownerId, fileId, jobId, async (tx, view) => {
      const job = view.job!; const attempt = view.attempts.find((entry) => entry.id === attemptId);
      if (!attempt) error('PROCESSING_NOT_FOUND');
      if (['PUBLISHED', 'RELEASED', 'CLEANUP_BLOCKED'].includes(attempt.phase)) return attempt;
      const now = await this.now(tx);
      if (job.state === 'RUNNING' && job.fence === attempt.fence && job.leaseUntil && job.leaseUntil.getTime() > now.getTime()) {
        error('PROCESSING_STATE_CONFLICT');
      }
      return this.retire(tx, attempt, now);
    });
  }
}
