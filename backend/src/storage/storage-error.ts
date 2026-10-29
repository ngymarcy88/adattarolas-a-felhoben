export type StorageErrorCode = 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'OBJECT_CHANGED' | 'INVALID_RESPONSE' | 'UNAVAILABLE' | 'OBJECT_EXISTS' | 'WRITE_CONFLICT';

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super('Object storage operation failed.');
    this.name = 'StorageError';
  }
}

export function mapStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } } | null;
  const status = value?.$metadata?.httpStatusCode;
  if (status === 412 || status === 416) return new StorageError('OBJECT_CHANGED');
  if ((value?.name === 'NoSuchKey' || value?.name === 'NotFound') && status === 404) return new StorageError('NOT_FOUND');
  return new StorageError('UNAVAILABLE');
}

/** A conditional PUT has different conflict semantics from a conditional GET. */
export function mapStorageWriteError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const status = (error as { $metadata?: { httpStatusCode?: unknown } } | null)?.$metadata?.httpStatusCode;
  if (status === 412) return new StorageError('OBJECT_EXISTS');
  if (status === 409) return new StorageError('WRITE_CONFLICT');
  return new StorageError('UNAVAILABLE');
}
