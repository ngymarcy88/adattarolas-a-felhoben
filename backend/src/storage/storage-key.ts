import { StorageError } from './storage-error';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${uuid}$`, 'i');
const keyPattern = new RegExp(`^originals/${uuid}/${uuid}$`);

/** IDs must be server-owned; this validates shape, not ownership. Never use a filename here. */
export function originalStorageKey(ownerId: string, fileId: string): string {
  if (!uuidPattern.test(ownerId) || !uuidPattern.test(fileId)) throw new StorageError('INVALID_ARGUMENT');
  return `originals/${ownerId.toLowerCase()}/${fileId.toLowerCase()}`;
}
export function assertOriginalKey(key: string): void {
  if (typeof key !== 'string' || !keyPattern.test(key)) throw new StorageError('INVALID_ARGUMENT');
}
