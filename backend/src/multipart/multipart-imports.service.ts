import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';
import { originalStorageKey } from '../storage/storage-key';
import { MultipartStore, publicImport, publicItem, transferInclude } from './multipart.store';
import { MultipartService } from './multipart.service';
import { fingerprint, importFingerprint, MultipartFilePipe, pageCursor, pageInput, uuid, type MultipartFileInput } from './multipart.dto';

const itemInclude = { fileObject: true, transfer: { include: transferInclude } } as const;
@Injectable()
export class MultipartImportsService {
  constructor(private readonly store: MultipartStore, private readonly config: ConfigService, private readonly transfers: MultipartService) {}
  async create(owner: string, key: string) {
    uuid(owner); key = uuid(key, true);
    return this.store.withUser(owner, async (tx, _user, now) => {
      const prior = await tx.importSession.findUnique({ where: { ownerId_idempotencyKey: { ownerId: owner, idempotencyKey: key } } });
      if (prior) return { status: 200, body: { import: publicImport(prior, now) } };
      if (await tx.importSession.count({ where: { ownerId: owner, state: 'OPEN', expiresAt: { gt: now } } }) >= 5) throw new ApiError('ACTIVE_IMPORT_LIMIT');
      const policy = this.config.getOrThrow<AppConfig>('app').multipart;
      const expiresAt = new Date(+now + policy.sessionTtlSeconds * 1000);
      const created = await tx.importSession.create({ data: { ownerId: owner, idempotencyKey: key, requestFingerprint: importFingerprint,
        createdAt: now, expiresAt, replayUntil: new Date(+expiresAt + 86400000), fileLimit: policy.maxFiles } });
      return { status: 201, body: { import: publicImport(created, now) } };
    });
  }
  async list(owner: string, query: unknown) {
    uuid(owner); const { limit, cursor } = pageInput(query, owner, 'imports');
    try {
      const rows = await this.store.prisma.importSession.findMany({ where: { ownerId: owner, ...(cursor ? { OR: [
        { createdAt: { lt: new Date(cursor.at as string) } }, { createdAt: new Date(cursor.at as string), id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
      const items = rows.slice(0, limit); const last = items.at(-1);
      return { items: items.map(i => publicImport(i)), nextCursor: rows.length > limit && last ? pageCursor(owner, 'imports', last.id, last.createdAt.toISOString()) : null };
    } catch { throw new ApiError('DATABASE_UNAVAILABLE'); }
  }
  async get(owner: string, id: string, query: unknown) {
    uuid(owner); id = uuid(id); const { limit, cursor } = pageInput(query, owner, id);
    try {
      const imported = await this.store.prisma.importSession.findFirst({ where: { id, ownerId: owner } });
      if (!imported) throw new ApiError('IMPORT_NOT_FOUND');
      const rows = await this.store.prisma.importFile.findMany({ where: { importId: id, ownerId: owner, ...(cursor ? { OR: [
        { ordinal: { gt: cursor.at as number } }, { ordinal: cursor.at as number, id: { gt: cursor.id } }] } : {}) },
      include: itemInclude, orderBy: [{ ordinal: 'asc' }, { id: 'asc' }], take: limit + 1 });
      const items = rows.slice(0, limit); const last = items.at(-1);
      return { import: publicImport(imported), items: items.map(publicItem), nextCursor: rows.length > limit && last ? pageCursor(owner, id, last.id, last.ordinal) : null };
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('DATABASE_UNAVAILABLE'); }
  }
  async initiate(owner: string, importId: string, key: string, value: MultipartFileInput) {
    uuid(owner); importId = uuid(importId); key = uuid(key, true);
    const input = new MultipartFilePipe(this.config).transform(value); const fp = fingerprint(importId, input);
    const result = await this.store.withUser(owner, async (tx, user, now) => {
      const [owned] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ImportSession" WHERE "id"=${importId}::uuid AND "ownerId"=${owner}::uuid FOR UPDATE`;
      if (!owned) throw new ApiError('IMPORT_NOT_FOUND');
      const imported = await tx.importSession.findFirst({ where: { id: importId, ownerId: owner } });
      if (!imported) throw new ApiError('IMPORT_NOT_FOUND');
      const receipt = await tx.uploadOperation.findUnique({ where: { ownerId_idempotencyKey: { ownerId: owner, idempotencyKey: key } } });
      if (receipt && receipt.requestFingerprint !== fp) throw new ApiError('IDEMPOTENCY_CONFLICT');
      const prior = receipt ? await tx.importFile.findUnique({ where: { fileObjectId: receipt.fileObjectId }, include: itemInclude })
        : await tx.importFile.findUnique({ where: { importId_clientFileId: { importId, clientFileId: input.clientFileId } }, include: itemInclude });
      if (prior) {
        if (!prior.transfer || prior.transfer.ownerId !== owner || prior.importId !== importId || prior.transfer.uploadOperation.requestFingerprint !== fp) throw new ApiError('IDEMPOTENCY_CONFLICT');
        return { created: false, item: prior };
      }
      if (receipt) throw new ApiError('DATABASE_UNAVAILABLE');
      if (+now >= +imported.expiresAt || imported.state !== 'OPEN') throw new ApiError('UPLOAD_EXPIRED');
      if (imported.acceptedFileCount >= imported.fileLimit) throw new ApiError('IMPORT_FILE_LIMIT');
      const size = BigInt(input.sizeBytes);
      if (user.usedStorageBytes + user.reservedStorageBytes + size > user.storageLimitBytes) throw new ApiError('QUOTA_EXCEEDED');
      const fileId = randomUUID(); const transferId = randomUUID(); const policy = this.config.getOrThrow<AppConfig>('app');
      const file = await tx.fileObject.create({ data: { id: fileId, ownerId: owner, originalName: input.originalName, mimeType: input.mimeType,
        sizeBytes: size, storageKey: originalStorageKey(owner, fileId), createdAt: now, uploadTransport: 'MULTIPART', uploadUrlExpiresAt: null, confirmBy: imported.expiresAt } });
      const operation = await tx.uploadOperation.create({ data: { ownerId: owner, fileObjectId: file.id, uploadTransport: 'MULTIPART', idempotencyKey: key,
        createdAt: now, requestFingerprint: fp, replayUntil: imported.replayUntil } });
      const item = await tx.importFile.create({ data: { importId, ownerId: owner, fileObjectId: file.id, createdAt: now, clientFileId: input.clientFileId, ordinal: imported.nextOrdinal } });
      const count = Math.ceil(input.sizeBytes / policy.multipart.partSizeBytes);
      await tx.multipartTransfer.create({ data: { id: transferId, ownerId: owner, fileObjectId: file.id, importFileId: item.id, uploadOperationId: operation.id,
        sizeBytes: size, partSizeBytes: policy.multipart.partSizeBytes, partCount: count, contentSha256: input.contentSha256,
        createdAt: now, providerNamespace: policy.storage.bucket, expiresAt: imported.expiresAt } });
      await tx.multipartPart.createMany({ data: Array.from({ length: count }, (_, i) => ({ transferId, partNumber: i + 1,
        expectedSizeBytes: Math.min(policy.multipart.partSizeBytes, input.sizeBytes - i * policy.multipart.partSizeBytes) })) });
      await tx.user.update({ where: { id: owner }, data: { reservedStorageBytes: { increment: size } } });
      await tx.importSession.update({ where: { id: importId }, data: { acceptedFileCount: { increment: 1 }, nextOrdinal: { increment: 1 } } });
      const loaded = await tx.importFile.findUnique({ where: { id: item.id }, include: itemInclude });
      if (!loaded?.transfer) throw new ApiError('DATABASE_UNAVAILABLE');
      return { created: true, item: loaded };
    });
    const transfer = await this.transfers.prepare(owner, result.item.transfer!.id);
    return { status: result.created ? 201 : 200, body: { item: { ...publicItem(result.item), transfer } } };
  }
}
