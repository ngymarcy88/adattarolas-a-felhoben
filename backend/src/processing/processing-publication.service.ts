import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DerivedObject } from '../generated/prisma/client';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';
import { ProcessingStateService } from './processing-state.service';
import { ProcessingStateError, type CandidateMetadata, type Claim, type Reservation } from './processing-state.types';
import type { ThumbnailResult } from './thumbnail-processor';
import { assertWebpOutput } from './webp-output';

export class ProcessingPublicationError extends Error {
  constructor(readonly code: 'PROCESSING_STORAGE_UNAVAILABLE' | 'PROCESSOR_ABORTED') {
    super('Processing publication failed.'); this.name = 'ProcessingPublicationError';
  }
}
export type PublicationOutcome = { state: 'succeeded'; result: DerivedObject } | { state: 'pending' | 'blocked' };

/** Explicit application service only: no polling, processor invocation, startup hook or HTTP wiring. */
@Injectable()
export class ProcessingPublicationService {
  constructor(private readonly state: ProcessingStateService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async publish(claim: Claim, output: ThumbnailResult, source: { sha256: string; etag: string },
    signal?: AbortSignal): Promise<PublicationOutcome> {
    // Capture all caller-owned data before the first await. TS readonly alone is not an ownership boundary.
    const token: Claim = Object.freeze({ ownerId: claim.ownerId, fileId: claim.fileId, jobId: claim.jobId,
      attemptId: claim.attemptId, leaseOwner: claim.leaseOwner, fence: claim.fence,
      implementationFingerprint: claim.implementationFingerprint });
    if (!output || !(output.bytes instanceof Uint8Array) || output.bytes.byteLength < 1 || output.bytes.byteLength > 524288 ||
        output.kind !== 'artifact' || output.mimeType !== 'image/webp' || output.selectedFrame !== 0 ||
        output.sizeBytes !== output.bytes.byteLength || output.implementationFingerprint !== token.implementationFingerprint) {
      throw new ProcessingStateError('PROCESSING_INVALID_ARGUMENT');
    }
    const bytes = Buffer.from(output.bytes);
    const metadata: CandidateMetadata = Object.freeze({ sourceSha256: source.sha256, sourceETag: source.etag,
      outputSha256: output.sha256, sizeBytes: bytes.length, width: output.width, height: output.height,
      implementationFingerprint: output.implementationFingerprint });
    if (createHash('sha256').update(bytes).digest('hex') !== metadata.outputSha256) {
      throw new ProcessingStateError('PROCESSING_INVALID_ARGUMENT');
    }
    try { assertWebpOutput(bytes, metadata.width, metadata.height); }
    catch { throw new ProcessingStateError('PROCESSING_INVALID_ARGUMENT'); }
    if (signal?.aborted) throw new ProcessingPublicationError('PROCESSOR_ABORTED');

    // A lost commit response deliberately grants no write authority. Never retry reserve/PUT blindly.
    let reservation: Reservation;
    try { reservation = await this.state.reserve(token, metadata); }
    catch (error) {
      // A known source/state observation is safe to persist with the same current token.
      // Never compensate an unknown DB commit outcome or a policy/operator conflict.
      if (error instanceof ProcessingStateError && (error.code === 'SOURCE_CHANGED' || error.code === 'SOURCE_NOT_ACTIVE')) {
        await this.state.fail(token, error.code).catch(() => undefined);
      }
      throw error;
    }
    if (reservation.kind === 'succeeded') return { state: 'succeeded', result: reservation.result };
    if (reservation.kind === 'pending') return { state: 'pending' };
    if (reservation.kind === 'blocked') return { state: 'blocked' };
    if (reservation.kind === 'stored') return { state: 'succeeded', result: await this.state.finalize(token) };

    try {
      if (signal?.aborted) throw new ProcessingPublicationError('PROCESSOR_ABORTED');
      const receipt = await this.storage.writeDerived({ key: reservation.attempt.candidateKey, bytes, signal });
      if (receipt.sizeBytes !== metadata.sizeBytes || receipt.sha256 !== metadata.outputSha256 || receipt.contentType !== 'image/webp' ||
          typeof receipt.etag !== 'string' || !receipt.etag || receipt.etag.length > 256 || /[\u0000-\u001f\u007f]/.test(receipt.etag)) {
        throw new ProcessingPublicationError('PROCESSING_STORAGE_UNAVAILABLE');
      }
      const head = await this.storage.head(reservation.attempt.candidateKey);
      if (!head || head.sizeBytes !== metadata.sizeBytes || head.contentType !== 'image/webp' || head.etag !== receipt.etag) {
        throw new ProcessingPublicationError('PROCESSING_STORAGE_UNAVAILABLE');
      }
    } catch (error) {
      // A timeout, 409/412, bad acknowledgement or HEAD failure may still leave an object.
      // fail() never releases R and cannot overwrite a concurrent winner. Even if DB is unavailable,
      // the committed WRITE_PENDING reservation remains the authoritative conservative fallback.
      const aborted = signal?.aborted || error instanceof ProcessingPublicationError && error.code === 'PROCESSOR_ABORTED';
      await this.state.fail(token, aborted ? 'PROCESSOR_ABORTED' : 'PROCESSING_STORAGE_UNAVAILABLE').catch(() => undefined);
      throw new ProcessingPublicationError(aborted ? 'PROCESSOR_ABORTED' : 'PROCESSING_STORAGE_UNAVAILABLE');
    }
    // These errors are deliberately outside the storage catch: a DB response may be lost AFTER commit.
    // Do not fail/delete/rewrite a possibly STORED or PUBLISHED candidate; retry observes durable state.
    await this.state.markStored(token);
    return { state: 'succeeded', result: await this.state.finalize(token) };
  }
}
