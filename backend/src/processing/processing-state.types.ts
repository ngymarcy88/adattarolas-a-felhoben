import type { DerivedObject, FileObject, ProcessingAttempt, ProcessingJob } from '../generated/prisma/client';

/** Snapshot of an explicitly provided processor descriptor; never instantiate a processor here. */
export interface ProcessingPolicy {
  readonly key: string;
  readonly version: string;
  readonly implementationFingerprint: string;
  readonly supportedMimeTypes: readonly string[];
}
export interface Claim {
  readonly ownerId: string;
  readonly fileId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly leaseOwner: string;
  readonly fence: bigint;
  readonly implementationFingerprint: string;
}
export interface CandidateMetadata {
  readonly sourceSha256: string;
  readonly sourceETag: string;
  readonly outputSha256: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly implementationFingerprint: string;
}
export type Reservation =
  | { kind: 'reserved' | 'pending' | 'stored'; attempt: ProcessingAttempt }
  | { kind: 'succeeded'; result: DerivedObject }
  | { kind: 'blocked'; attempt: ProcessingAttempt };
export interface ProcessingSource { file: FileObject; job: ProcessingJob; attempt: ProcessingAttempt }
export const PROCESSING_FAILURE_CODES = [
  'SOURCE_CHANGED', 'SOURCE_NOT_ACTIVE', 'PROCESSOR_INPUT_UNSUPPORTED', 'PROCESSOR_INPUT_INVALID',
  'PROCESSOR_INPUT_LIMIT', 'PROCESSOR_OUTPUT_LIMIT', 'PROCESSOR_TIMEOUT', 'PROCESSOR_RESOURCE_LIMIT',
  'PROCESSOR_ABORTED', 'PROCESSOR_INTERNAL_ERROR', 'STORAGE_UNAVAILABLE', 'STORAGE_INVALID_RESPONSE',
  'STORAGE_OBJECT_EXISTS', 'STORAGE_WRITE_CONFLICT', 'PROCESSING_STORAGE_UNAVAILABLE', 'PROCESSING_DATABASE_UNAVAILABLE',
] as const;
export type ProcessingFailureCode = typeof PROCESSING_FAILURE_CODES[number];
export type ProcessingStateErrorCode = 'PROCESSING_INVALID_ARGUMENT' | 'PROCESSING_NOT_FOUND' |
  'SOURCE_NOT_ACTIVE' | 'SOURCE_CHANGED' | 'PROCESSING_POLICY_MISMATCH' | 'PROCESSING_LEASE_LOST' |
  'PROCESSING_STATE_CONFLICT' | 'PROCESSING_RETRY_EXHAUSTED' | 'PROCESSING_DATABASE_UNAVAILABLE';
export class ProcessingStateError extends Error {
  constructor(readonly code: ProcessingStateErrorCode) {
    super('Processing state operation failed.'); this.name = 'ProcessingStateError';
  }
}
