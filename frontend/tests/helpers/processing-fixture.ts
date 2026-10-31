import type { ProcessingState, ProcessingStatus } from '../../src/api/processing';
import { galleryFile } from './gallery-fixture';
export function processingStatus(n = 1, state: ProcessingState = 'QUEUED', patch: Partial<ProcessingStatus> = {}): ProcessingStatus {
  return { fileId: galleryFile(n).id, processorKey: 'thumbnail', processorVersion: '1.0.0', state, retryRevision: 0, attemptCount: 1,
    nextAttemptAt: null, errorCode: null, retryable: ['FAILED', 'BLOCKED_QUOTA', 'CANCELLED'].includes(state), cleanupPending: false,
    result: state === 'SUCCEEDED' ? { id: galleryFile(1000 + n).id, mimeType: 'image/webp', sizeBytes: 200, width: 32, height: 16, createdAt: '2026-10-31T12:00:00.000Z' } : null, ...patch };
}
