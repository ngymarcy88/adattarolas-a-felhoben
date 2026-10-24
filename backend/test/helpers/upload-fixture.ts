import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UploadStateService, type UploadFile } from '../../src/files/upload-state.service';
import { UploadConfirmService } from '../../src/files/upload-confirm.service';
import { UploadCleanupService } from '../../src/files/upload-cleanup.service';
import type { ObjectStorage } from '../../src/storage/storage.interface';

export const owner = '00000000-0000-4000-8000-000000000001';
export const id = '00000000-0000-4000-8000-000000000002';
export const now = new Date('2026-10-24T13:00:00.000Z');
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export function uploadFixture() {
  const file = { id, ownerId: owner, status: 'PENDING_UPLOAD', originalName: 'fixture.png', storageKey: `originals/${owner}/${id}`,
    mimeType: 'image/png', detectedMimeType: null, sizeBytes: BigInt(png.length), uploadUrlExpiresAt: new Date(+now + 300000), confirmBy: new Date(+now + 900000),
    cleanupAttemptCount: 0, cleanupRetryAfter: null, cleanupLastErrorCode: null, uploadOperation: { id: '00000000-0000-4000-8000-000000000003',
      ownerId: owner, fileObjectId: id, state: 'OPEN', terminalErrorCode: null, closedAt: null, writesClosedAt: null, reservationReleasedAt: null },
  } as unknown as UploadFile;
  const user = { reservedStorageBytes: file.sizeBytes };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockImplementation(async (parts: TemplateStringsArray) => parts.join('').includes('FROM "User"') ? [user] : [{ id }]),
    fileObject: { findUnique: jest.fn().mockImplementation(async () => structuredClone(file)),
      update: jest.fn().mockImplementation(async ({ data }) => { Object.assign(file, data); return structuredClone(file); }) },
    uploadOperation: { update: jest.fn().mockImplementation(async ({ data }) => { Object.assign(file.uploadOperation!, data); return structuredClone(file.uploadOperation); }) },
    user: { update: jest.fn().mockResolvedValue({}) }, auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  let tail = Promise.resolve();
  const db = { $transaction: jest.fn().mockImplementation((action) => {
    const current = tail.then(async () => {
      const before = structuredClone(file); const beforeUser = structuredClone(user);
      try { return await action(tx); }
      catch (error) { Object.assign(file, before); Object.assign(user, beforeUser); throw error; }
    }); tail = current.catch(() => undefined); return current;
  }), fileObject: { findMany: jest.fn().mockResolvedValue([{ id, ownerId: owner }]) } };
  const storage = { writeClosureEvidence: 'unproven', head: jest.fn().mockResolvedValue({ sizeBytes: png.length, contentType: 'text/html', etag: '"identity"' }),
    readPrefix: jest.fn().mockResolvedValue(png.subarray(0, 16)), deleteObject: jest.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: () => ({ maxUploadBytes: 104857600, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] }) } as unknown as ConfigService;
  const prisma = db as unknown as PrismaService; const adapter = storage as unknown as ObjectStorage;
  const state = new UploadStateService(prisma);
  return { file, user, tx, db, storage, config, state,
    confirmation: new UploadConfirmService(state, config, adapter), cleanup: new UploadCleanupService(prisma, state, adapter) };
}
