import { StorageError } from './storage-error';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${uuid}$`, 'i');
const keyPattern = new RegExp(`^originals/${uuid}/${uuid}$`);

/** IDs must be server-owned; this validates shape, not ownership. Never use a filename here. */
export function originalStorageKey(ownerId: string, fileId: string): string {
  if (typeof ownerId !== 'string' || typeof fileId !== 'string' || uuidPattern.exec(ownerId)?.[0] !== ownerId || uuidPattern.exec(fileId)?.[0] !== fileId) throw new StorageError('INVALID_ARGUMENT');
  return `originals/${ownerId.toLowerCase()}/${fileId.toLowerCase()}`;
}
export function assertOriginalKey(key: string): void {
  if (typeof key !== 'string' || keyPattern.exec(key)?.[0] !== key) throw new StorageError('INVALID_ARGUMENT');
}

const derivedKeyPattern = new RegExp(`^derived/${uuid}/${uuid}/${uuid}/${uuid}\\.webp$`);
const canonicalUuidPattern = new RegExp(`^${uuid}$`);

/** Server-owned immutable attempt identity; filenames are never accepted. */
export function derivedStorageKey(ownerId: string, fileId: string, jobId: string, attemptId: string): string {
  if (![ownerId, fileId, jobId, attemptId].every((id) => typeof id === 'string' && canonicalUuidPattern.exec(id)?.[0] === id)) {
    throw new StorageError('INVALID_ARGUMENT');
  }
  return `derived/${ownerId}/${fileId}/${jobId}/${attemptId}.webp`;
}
export function assertDerivedKey(key: string): void {
  if (typeof key !== 'string' || derivedKeyPattern.exec(key)?.[0] !== key) throw new StorageError('INVALID_ARGUMENT');
}
export function assertStorageKey(key: string): 'original' | 'derived' {
  if (typeof key === 'string' && keyPattern.exec(key)?.[0] === key) return 'original';
  assertDerivedKey(key);
  return 'derived';
}
