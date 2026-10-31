import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';
import { StorageError } from '../storage/storage-error';
import { ProcessingStateService } from './processing-state.service';
import { PROCESSING_FAILURE_CODES, ProcessingStateError, type Claim, type ProcessingFailureCode } from './processing-state.types';
import { ProcessorError } from './processor-error';
import type { Processor } from './processor.interface';
import type { ThumbnailResult } from './thumbnail-processor';
import { ProcessingPublicationError, ProcessingPublicationService } from './processing-publication.service';
import { assertWebpOutput } from './webp-output';

export const THUMBNAIL_PROCESSOR = Symbol('THUMBNAIL_PROCESSOR');
export const THUMBNAIL_WORKER_LIMITS = Object.freeze({ concurrency: 1, pollMs: 2000, heartbeatMs: 15000, attemptMs: 60000 });
class InvalidCandidate extends Error {}
const sourceFailures = new Set(['SOURCE_CHANGED', 'SOURCE_NOT_ACTIVE', 'PROCESSING_POLICY_MISMATCH']);

/** One slot per worker process. PostgreSQL claims/fences coordinate distinct processes. */
@Injectable()
export class ThumbnailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly leaseOwner = randomUUID();
  private readonly shutdown = new AbortController();
  // Independent of Nest startup logging; never pass raw exceptions or object identifiers.
  private readonly logger = { warn: (event: { event: string; code: string }) => console.warn(JSON.stringify(event)) };
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;
  constructor(private readonly state: ProcessingStateService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(THUMBNAIL_PROCESSOR) private readonly processor: Processor<ThumbnailResult>,
    private readonly publication: ProcessingPublicationService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.runOnce(); }, THUMBNAIL_WORKER_LIMITS.pollMs);
    // Keep the standalone context alive while idle; stop() clears this timer before app.close().
    void this.runOnce();
  }
  runOnce(): Promise<void> {
    if (this.shutdown.signal.aborted) return Promise.resolve();
    if (this.active) return this.active;
    this.active = this.tick().catch(() => { this.logger.warn({ event: 'thumbnail_poll_failed', code: 'PROCESSING_DATABASE_UNAVAILABLE' }); })
      .finally(() => { this.active = undefined; });
    return this.active;
  }
  async stop(): Promise<void> {
    this.shutdown.abort(); if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  async onModuleDestroy(): Promise<void> { await this.stop(); }

  private async tick(): Promise<void> {
    const candidates = await this.state.listReady(1);
    for (const candidate of candidates) {
      if (this.shutdown.signal.aborted) return;
      let claim: Claim | null;
      let recovery = true;
      try {
        claim = await this.state.claimRecovery(candidate.ownerId, candidate.fileObjectId, candidate.id, this.leaseOwner);
        if (!claim) { recovery = false; claim = await this.state.claim(candidate.ownerId, candidate.fileObjectId, candidate.id, this.leaseOwner, true); }
      } catch (error) {
        if (error instanceof ProcessingStateError && sourceFailures.has(error.code)) {
          await this.state.reconcileSource(candidate.ownerId, candidate.fileObjectId, candidate.id);
          return;
        }
        throw error;
      }
      if (!claim || this.shutdown.signal.aborted) return;
      await this.execute(Object.freeze({ ...claim }), recovery);
    }
  }

  private code(error: unknown): ProcessingFailureCode {
    const value = error instanceof ProcessorError || error instanceof ProcessingStateError || error instanceof ProcessingPublicationError ? error.code : '';
    if ((PROCESSING_FAILURE_CODES as readonly string[]).includes(value)) return value as ProcessingFailureCode;
    return error instanceof StorageError ? 'PROCESSING_STORAGE_UNAVAILABLE' : 'PROCESSOR_INTERNAL_ERROR';
  }
  private async execute(claim: Claim, recovery: boolean): Promise<void> {
    const controller = new AbortController(); const abort = () => controller.abort();
    this.shutdown.signal.addEventListener('abort', abort, { once: true });
    if (this.shutdown.signal.aborted) controller.abort();
    const deadline = setTimeout(abort, THUMBNAIL_WORKER_LIMITS.attemptMs);
    let heartbeat: Promise<void> | undefined; let leaseLost = false; let publishing = false;
    const beat = setInterval(() => {
      if (heartbeat || controller.signal.aborted) return;
      heartbeat = this.state.heartbeat(claim).catch(() => { leaseLost = true; abort(); })
        .finally(() => { heartbeat = undefined; });
    }, THUMBNAIL_WORKER_LIMITS.heartbeatMs);
    const check = async () => {
      if (controller.signal.aborted) throw new ProcessorError('PROCESSOR_ABORTED');
      const view = await this.state.loadClaim(claim);
      if (controller.signal.aborted) throw new ProcessorError('PROCESSOR_ABORTED');
      return view;
    };
    try {
      const view = await check();
      if (claim.implementationFingerprint !== this.processor.implementationFingerprint) throw new ProcessingStateError('PROCESSING_POLICY_MISMATCH');
      if (view.file.sizeBytes > BigInt(this.processor.limits.maxInputBytes)) throw new ProcessorError('PROCESSOR_INPUT_LIMIT');
      const head = await this.storage.head(view.file.storageKey); await check();
      if (!head || BigInt(head.sizeBytes) !== view.file.sizeBytes) throw new ProcessingStateError('SOURCE_CHANGED');
      if (view.attempt.sourceETag && head.etag !== view.attempt.sourceETag) throw new ProcessingStateError('SOURCE_CHANGED');
      const input = await this.storage.readOriginal(view.file.storageKey, head, Number(view.file.sizeBytes), controller.signal); await check();
      const sha256 = createHash('sha256').update(input).digest('hex');
      if (view.attempt.sourceSha256 && sha256 !== view.attempt.sourceSha256) throw new ProcessingStateError('SOURCE_CHANGED');
      if (recovery) {
        const attempt = view.attempt;
        const candidate = await this.storage.head(attempt.candidateKey); await check();
        if (!candidate || candidate.contentType !== 'image/webp' || BigInt(candidate.sizeBytes) !== attempt.outputBytes) throw new InvalidCandidate();
        let bytes: Uint8Array;
        try { bytes = await this.storage.readDerived(attempt.candidateKey, candidate, controller.signal); }
        catch (error) {
          if (error instanceof StorageError && ['OBJECT_CHANGED', 'NOT_FOUND', 'INVALID_RESPONSE', 'INVALID_ARGUMENT'].includes(error.code)) throw new InvalidCandidate();
          throw error;
        }
        await check();
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (digest !== attempt.outputSha256 || BigInt(bytes.byteLength) !== attempt.outputBytes) throw new InvalidCandidate();
        try { assertWebpOutput(bytes, attempt.width!, attempt.height!); } catch { throw new InvalidCandidate(); }
        publishing = true;
        await this.state.finalizeRecovered(claim, { sourceSha256: sha256, sourceETag: head.etag, outputSha256: digest,
          sizeBytes: bytes.byteLength, width: attempt.width!, height: attempt.height!, implementationFingerprint: claim.implementationFingerprint });
      } else {
        await this.state.captureSource(claim, sha256, head.etag); await check();
        const output = await this.processor.process(input, view.file.detectedMimeType!, controller.signal); await check();
        publishing = true;
        await this.publication.publish(claim, output, { sha256, etag: head.etag }, controller.signal, true);
      }
    } catch (error) {
      // Shutdown/lease loss and unknown publication commits retain their durable state for restart.
      if (this.shutdown.signal.aborted || leaseLost || error instanceof ProcessingStateError && error.code === 'PROCESSING_LEASE_LOST') return;
      const code = controller.signal.aborted ? 'PROCESSOR_TIMEOUT' : this.code(error);
      if (publishing && (error instanceof ProcessingPublicationError ||
          error instanceof ProcessingStateError && error.code === 'PROCESSING_DATABASE_UNAVAILABLE')) return;
      try {
        if (recovery) await this.state.failRecovery(claim, error instanceof InvalidCandidate ? 'PROCESSING_STORAGE_UNAVAILABLE' : code, error instanceof InvalidCandidate);
        else await this.state.fail(claim, code);
      } catch { /* Stale fence/unknown DB outcome: the persisted reservation and lease remain authoritative. */ }
      this.logger.warn({ event: 'thumbnail_attempt_failed', code: error instanceof InvalidCandidate ? 'PROCESSING_STORAGE_UNAVAILABLE' : code });
    } finally {
      clearInterval(beat); clearTimeout(deadline); this.shutdown.signal.removeEventListener('abort', abort);
      // Never release the physical slot while a heartbeat/decoder/I/O is still completing.
      await heartbeat;
    }
  }
}
