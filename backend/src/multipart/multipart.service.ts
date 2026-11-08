import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/app-config';
import { ApiError, type ApiErrorCode } from '../common/errors/api-error';
import type { MultipartIoKind, Prisma } from '../generated/prisma/client';
import { OBJECT_STORAGE, type ObjectStorage, type MultipartPartReceipt } from '../storage/storage.interface';
import { StorageError } from '../storage/storage-error';
import { ProcessingStateService } from '../processing/processing-state.service';
import { detectImageMime } from '../files/image-signature';
import { publicFile } from '../files/upload-state.service';
import { MultipartStore, publicTransfer, transferInclude, type Transfer, type TransferContext } from './multipart.store';
import { source, uuid } from './multipart.dto';
import { MultipartLimits } from './multipart.limit';

const terminal = (t: Transfer) => ['SUCCEEDED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(t.state);
const session = (t: Transfer) => ({ key: t.uploadOperation.fileObject.storageKey, uploadId: t.providerUploadId!, sizeBytes: Number(t.sizeBytes), partSizeBytes: t.partSizeBytes });
const manifest = (t: Transfer) => t.manifestParts.map(p => ({ partNumber: p.partNumber, sizeBytes: p.sizeBytes, etag: p.etag }));
const leaseLive = (t: Transfer, now: Date) => t.leaseUntil !== null && +t.leaseUntil > +now;
const sameParts = (a: readonly MultipartPartReceipt[], b: readonly MultipartPartReceipt[]) => a.length === b.length && a.every((p, i) => p.partNumber === b[i].partNumber && p.sizeBytes === b[i].sizeBytes && p.etag === b[i].etag);
const manifestHash = (parts: MultipartPartReceipt[]) => createHash('sha256').update(JSON.stringify(parts.map(p => [p.partNumber, p.sizeBytes, p.etag]))).digest('hex');
type Claim = { t: Transfer; fence: bigint; leaseOwner: string; ioId?: string; kind?: MultipartIoKind };
@Injectable()
export class MultipartService {
  constructor(private readonly store: MultipartStore, private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage, private readonly processing: ProcessingStateService, private readonly limits: MultipartLimits) {}

  private async load(c: TransferContext) {
    return (await c.tx.multipartTransfer.findUnique({ where: { id: c.transfer.id }, include: transferInclude }))!;
  }
  private async close(c: TransferContext, state: 'EXPIRED' | 'CANCELLED' | 'REJECTED', code: 'UPLOAD_EXPIRED' | 'UPLOAD_CANCELLED' | 'UPLOAD_VALIDATION_FAILED' | 'TRANSFER_PARTS_INVALID') {
    if (terminal(c.transfer)) return;
    await c.tx.uploadOperation.update({ where: { id: c.transfer.uploadOperationId }, data: { state, terminalErrorCode: code, closedAt: c.now } });
    await c.tx.multipartTransfer.update({ where: { id: c.transfer.id }, data: { state, revision: { increment: 1 }, fence: { increment: 1n }, leaseOwner: null,
      leaseUntil: null, publicationExcludedAt: c.now, cleanupState: 'CLEANUP_BLOCKED', lastErrorCode: code, recoveryAfter: null } });
  }
  private async expire(c: TransferContext) {
    if (!terminal(c.transfer) && +c.now >= +c.transfer.expiresAt) { await this.close(c, 'EXPIRED', 'UPLOAD_EXPIRED'); c.transfer = await this.load(c); }
    return c.transfer;
  }
  private error(t: Transfer): ApiErrorCode | undefined {
    if (t.state === 'EXPIRED') return 'UPLOAD_EXPIRED';
    if (t.state === 'CANCELLED') return 'UPLOAD_CANCELLED';
    if (t.state === 'REJECTED') return t.uploadOperation.terminalErrorCode === 'TRANSFER_PARTS_INVALID' ? 'TRANSFER_PARTS_INVALID' : 'UPLOAD_VALIDATION_FAILED';
    if (t.uploadOperation.fileObject.status === 'SOFT_DELETED') return 'RESOURCE_STATE_CONFLICT';
    return undefined;
  }
  private async view(owner: string, id: string) {
    return this.store.locked(owner, id, async c => publicTransfer(await this.expire(c)));
  }
  private async claim(c: TransferContext, kind?: MultipartIoKind): Promise<Claim | null> {
    const t = c.transfer;
    if (t.providerNamespace !== this.config.getOrThrow<AppConfig>('app').storage.bucket) throw new ApiError('STORAGE_UNAVAILABLE');
    if (leaseLive(t, c.now) || (t.recoveryAfter && +c.now < +t.recoveryAfter)) return null;
    if (kind === 'CREATE' && t.ioOperations.some(io => io.kind === 'CREATE')) return null;
    const attemptNo = kind ? Math.max(0, ...t.ioOperations.filter(io => io.kind === kind).map(io => io.attemptNo)) + 1 : undefined;
    if (kind === 'COMPLETE' && attemptNo! > 3) return null;
    const leaseOwner = randomUUID(); const fence = t.fence + 1n;
    await c.tx.multipartTransfer.update({ where: { id: t.id }, data: { fence, leaseOwner, leaseUntil: new Date(+c.now + 90000), revision: { increment: 1 } } });
    let ioId: string | undefined;
    if (kind) {
      ioId = randomUUID();
      await c.tx.multipartIoOperation.create({ data: { id: ioId, transferId: t.id, kind, attemptNo: attemptNo!, fence,
        state: 'DISPATCHED', startedAt: c.now, createdAt: c.now } });
    }
    return { t: await this.load(c), fence, leaseOwner, ioId, kind };
  }
  private owns(c: TransferContext, claim: Claim) {
    return !terminal(c.transfer) && c.transfer.fence === claim.fence && c.transfer.leaseOwner === claim.leaseOwner && leaseLive(c.transfer, c.now) && +c.now < +c.transfer.expiresAt;
  }
  private async settle(c: TransferContext, claim: Claim, success: boolean) {
    if (!claim.ioId) return;
    const io = await c.tx.multipartIoOperation.findUnique({ where: { id: claim.ioId } });
    if (io && ['DISPATCHED', 'UNKNOWN'].includes(io.state)) await c.tx.multipartIoOperation.update({ where: { id: io.id }, data: success ? { state: 'SUCCEEDED', settledAt: c.now, lastErrorCode: null } : { state: 'UNKNOWN', lastErrorCode: 'STORAGE_UNAVAILABLE' } });
  }
  private async failed(owner: string, claim: Claim, state?: 'CREATE_UNKNOWN' | 'COMPLETE_UNKNOWN') {
    await this.store.locked(owner, claim.t.id, async c => {
      await this.settle(c, claim, false); await this.expire(c);
      if (!this.owns(c, claim)) return;
      await c.tx.multipartTransfer.update({ where: { id: c.transfer.id }, data: { ...(state ? { state } : {}), leaseOwner: null, leaseUntil: null,
        recoveryAfter: new Date(+c.now + Math.min(30000, 2000 * 2 ** Math.min(c.transfer.recoveryAttemptCount, 4))),
        recoveryAttemptCount: { increment: 1 }, lastErrorCode: 'STORAGE_UNAVAILABLE', revision: { increment: 1 } } });
    });
  }
  async prepare(owner: string, id: string) {
    uuid(owner); id = uuid(id);
    const picked = await this.store.locked(owner, id, async c => {
      await this.expire(c); if (terminal(c.transfer)) return null;
      if (c.transfer.state !== 'CREATING' && c.transfer.state !== 'CREATE_UNKNOWN') return null;
      const prior = c.transfer.ioOperations.find(io => io.kind === 'CREATE');
      if (!prior) return this.claim(c, 'CREATE');
      if (leaseLive(c.transfer, c.now)) return null;
      if (c.transfer.state === 'CREATING') await c.tx.multipartTransfer.update({ where: { id }, data: { state: 'CREATE_UNKNOWN' } });
      c.transfer = await this.load(c);
      // No second CreateMultipartUpload, even when the first process died before dispatch.
      return this.claim(c);
    });
    if (!picked) return this.view(owner, id);
    try {
      const uploadId = picked.kind === 'CREATE' ? (await this.storage.initiateMultipart({ key: picked.t.uploadOperation.fileObject.storageKey,
        transferId: picked.t.id, mimeType: picked.t.uploadOperation.fileObject.mimeType, sizeBytes: Number(picked.t.sizeBytes), partSizeBytes: picked.t.partSizeBytes })).uploadId
        : await this.discover(picked.t);
      if (!uploadId) { await this.failed(owner, picked, 'CREATE_UNKNOWN'); return this.view(owner, id); }
      await this.store.locked(owner, id, async c => {
        await this.settle(c, picked, true); await this.expire(c);
        if (!this.owns(c, picked)) {
          // Retain a late known provider identity for manual cleanup, never reopen/publicize it.
          if (!c.transfer.providerUploadId && ['CANCELLED', 'EXPIRED', 'REJECTED'].includes(c.transfer.state)) await c.tx.multipartTransfer.update({ where: { id }, data: { providerUploadId: uploadId } });
          return;
        }
        await c.tx.multipartTransfer.update({ where: { id }, data: { state: 'OPEN', providerUploadId: uploadId, leaseOwner: null, leaseUntil: null,
          recoveryAfter: null, lastErrorCode: null, revision: { increment: 1 } } });
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      await this.failed(owner, picked, 'CREATE_UNKNOWN');
    }
    return this.view(owner, id);
  }
  private async discover(t: Transfer) {
    const ids = await this.storage.findMultipartUploads(t.uploadOperation.fileObject.storageKey);
    return ids.length === 1 ? ids[0] : undefined;
  }
  private async observe(c: TransferContext, parts: MultipartPartReceipt[]) {
    const byNumber = new Map(parts.map(p => [p.partNumber, p]));
    for (const stored of c.transfer.parts) {
      const p = byNumber.get(stored.partNumber);
      await c.tx.multipartPart.update({ where: { transferId_partNumber: { transferId: c.transfer.id, partNumber: stored.partNumber } },
        data: { observedSizeBytes: p?.sizeBytes ?? null, observedETag: p?.etag ?? null, observedAt: p ? c.now : null } });
    }
  }
  async status(owner: string, id: string) {
    uuid(owner); id = uuid(id);
    let t = await this.store.locked(owner, id, async c => this.expire(c));
    if (['CREATING', 'CREATE_UNKNOWN'].includes(t.state) && t.ioOperations.some(i => i.kind === 'CREATE')) {
      await this.prepare(owner, id); t = await this.store.locked(owner, id, async c => this.expire(c));
    }
    if (['SEALING', 'COMPLETING', 'COMPLETE_UNKNOWN'].includes(t.state) && !leaseLive(t, new Date())) {
      await this.recoverComplete(owner, id); t = await this.store.locked(owner, id, async c => this.expire(c));
    }
    if (t.state !== 'OPEN') return publicTransfer(t);
    if (t.providerNamespace !== this.config.getOrThrow<AppConfig>('app').storage.bucket) throw new ApiError('STORAGE_UNAVAILABLE');
    let parts: MultipartPartReceipt[];
    try { parts = await this.storage.listMultipartParts(session(t)); }
    catch { throw new ApiError('STORAGE_UNAVAILABLE'); }
    return this.store.locked(owner, id, async c => {
      await this.expire(c);
      if (c.transfer.state !== 'OPEN' || c.transfer.revision !== t.revision) return publicTransfer(c.transfer);
      await this.observe(c, parts); return publicTransfer(await this.load(c), c.now);
    });
  }
  async resume(owner: string, id: string, value: unknown) {
    uuid(owner); id = uuid(id); const input = source(value);
    const checked = await this.store.locked(owner, id, async c => {
      await this.expire(c); const error = this.error(c.transfer); if (error) return error;
      if (Number(c.transfer.sizeBytes) !== input.sizeBytes || c.transfer.contentSha256 !== input.contentSha256) return 'TRANSFER_SOURCE_MISMATCH';
      if (c.transfer.state !== 'OPEN') return 'TRANSFER_STATE_CONFLICT'; return null;
    });
    if (checked) throw new ApiError(checked);
    return this.status(owner, id);
  }
  async sign(owner: string, id: string, partNumber: number) {
    uuid(owner); id = uuid(id);
    const t = await this.store.locked(owner, id, async c => {
      await this.expire(c); return { t: c.transfer, error: this.error(c.transfer) };
    });
    if (t.error) throw new ApiError(t.error);
    if (t.t.providerNamespace !== this.config.getOrThrow<AppConfig>('app').storage.bucket) throw new ApiError('STORAGE_UNAVAILABLE');
    if (t.t.state !== 'OPEN') throw new ApiError('TRANSFER_STATE_CONFLICT');
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > t.t.partCount) throw new ApiError('VALIDATION_ERROR');
    const parts = await this.storage.listMultipartParts(session(t.t)).catch(() => { throw new ApiError('STORAGE_UNAVAILABLE'); });
    const policy = this.config.getOrThrow<AppConfig>('app');
    const issued = await this.store.locked(owner, id, async c => {
      await this.expire(c); const error = this.error(c.transfer); if (error) return { error };
      if (c.transfer.state !== 'OPEN' || c.transfer.revision !== t.t.revision) return { error: 'TRANSFER_STATE_CONFLICT' as const };
      if (parts.some(p => p.partNumber === partNumber)) return { error: 'PART_ALREADY_UPLOADED' as const };
      const expiresAt = new Date(Math.floor(Math.min(+c.transfer.expiresAt, +c.now + Math.min(policy.multipart.urlTtlSeconds, policy.presignedUrlTtlSeconds) * 1000) / 1000) * 1000);
      if (+expiresAt <= +c.now) return { error: 'UPLOAD_EXPIRED' as const };
      const row = c.transfer.parts.find(p => p.partNumber === partNumber)!;
      await c.tx.multipartPart.update({ where: { transferId_partNumber: { transferId: id, partNumber } }, data: {
        maxIssuedExpiresAt: row.maxIssuedExpiresAt && +row.maxIssuedExpiresAt > +expiresAt ? row.maxIssuedExpiresAt : expiresAt, lastIssuedRevision: c.transfer.revision } });
      return { t: c.transfer, expiresAt };
    });
    if (issued.error) throw new ApiError(issued.error);
    const grant = await this.storage.createMultipartPartAccess({ ...session(issued.t!), partNumber, expiresAt: issued.expiresAt! }).catch(() => { throw new ApiError('STORAGE_UNAVAILABLE'); });
    const error = await this.store.locked(owner, id, async c => {
      await this.expire(c);
      return this.error(c.transfer) ?? (c.transfer.state !== 'OPEN' || c.transfer.revision !== issued.t!.revision || c.transfer.fence !== issued.t!.fence ? 'TRANSFER_STATE_CONFLICT'
        : +grant.expiresAt <= +c.now || +grant.expiresAt > +issued.expiresAt! ? 'STORAGE_UNAVAILABLE' : undefined);
    });
    if (error) throw new ApiError(error);
    return { ...grant, expiresAt: grant.expiresAt.toISOString() };
  }
  async complete(owner: string, id: string) {
    uuid(owner); id = uuid(id);
    const start = await this.store.locked(owner, id, async c => {
      await this.expire(c); const error = this.error(c.transfer); if (error) return { error };
      if (c.transfer.state !== 'OPEN') return { claim: null };
      const claim = await this.claim(c);
      if (!claim) return { claim: null };
      await c.tx.multipartTransfer.update({ where: { id }, data: { state: 'SEALING' } });
      return { claim: { ...claim, t: await this.load(c) } };
    });
    if (start.error) throw new ApiError(start.error);
    if (!start.claim) {
      await this.recoverComplete(owner, id);
      return this.completeReply(owner, id);
    }
    const picked = start.claim;
    let parts: MultipartPartReceipt[];
    try { parts = await this.storage.listMultipartParts(session(picked.t)); }
    catch (error) {
      if (error instanceof StorageError && error.code === 'PARTS_INVALID') {
        await this.store.locked(owner, id, async c => { await this.expire(c); if (this.owns(c, picked)) await this.close(c, 'REJECTED', 'TRANSFER_PARTS_INVALID'); });
        throw new ApiError('TRANSFER_PARTS_INVALID');
      }
      await this.failed(owner, picked); throw new ApiError('STORAGE_UNAVAILABLE');
    }
    const dispatched = await this.store.locked(owner, id, async c => {
      await this.expire(c); if (!this.owns(c, picked)) return null;
      if (parts.length !== c.transfer.partCount || parts.some((p, i) => p.partNumber !== i + 1 || p.sizeBytes !== c.transfer.parts[i]?.expectedSizeBytes)) {
        await c.tx.multipartTransfer.update({ where: { id }, data: { state: 'OPEN', leaseOwner: null, leaseUntil: null, revision: { increment: 1 } } });
        return 'incomplete' as const;
      }
      await this.observe(c, parts);
      await c.tx.multipartManifestPart.createMany({ data: parts.map(p => ({ transferId: id, partNumber: p.partNumber, sizeBytes: p.sizeBytes, etag: p.etag })) });
      await c.tx.multipartTransfer.update({ where: { id }, data: { manifestHash: manifestHash(parts), manifestSealedAt: c.now, state: 'COMPLETING' } });
      c.transfer = await this.load(c);
      return this.completeIntent(c, picked);
    });
    if (dispatched === 'incomplete') throw new ApiError('UPLOAD_PARTS_INCOMPLETE');
    if (dispatched) await this.performComplete(owner, dispatched);
    return this.completeReply(owner, id);
  }
  private async completeIntent(c: TransferContext, picked: Claim): Promise<Claim | null> {
    const ordinal = Math.max(0, ...c.transfer.ioOperations.filter(io => io.kind === 'COMPLETE').map(io => io.attemptNo)) + 1;
    if (ordinal > 3) return null;
    const ioId = randomUUID();
    await c.tx.multipartIoOperation.create({ data: { id: ioId, transferId: c.transfer.id, kind: 'COMPLETE', attemptNo: ordinal,
      fence: picked.fence, state: 'DISPATCHED', createdAt: c.now, startedAt: c.now } });
    await c.tx.multipartTransfer.update({ where: { id: c.transfer.id }, data: { state: 'COMPLETING' } });
    return { ...picked, t: await this.load(c), ioId, kind: 'COMPLETE' };
  }
  private async performComplete(owner: string, picked: Claim) {
    try {
      const result = await this.storage.completeMultipart({ ...session(picked.t), parts: manifest(picked.t) });
      await this.store.locked(owner, picked.t.id, async c => {
        await this.settle(c, picked, true); await this.expire(c);
        if (!this.owns(c, picked)) return;
        await c.tx.multipartTransfer.update({ where: { id: c.transfer.id }, data: { state: 'STORED', storedAt: c.now, storedETag: result.etag,
          storedVersionId: result.versionId, leaseOwner: null, leaseUntil: null, recoveryAfter: null, lastErrorCode: null, revision: { increment: 1 } } });
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      await this.failed(owner, picked, 'COMPLETE_UNKNOWN');
    }
  }
  private async recoverComplete(owner: string, id: string) {
    const picked = await this.store.locked(owner, id, async c => {
      await this.expire(c);
      if (!['SEALING', 'COMPLETING', 'COMPLETE_UNKNOWN'].includes(c.transfer.state) || leaseLive(c.transfer, c.now)) return null;
      if (c.transfer.state === 'SEALING' && !c.transfer.manifestSealedAt) {
        await c.tx.multipartTransfer.update({ where: { id }, data: { state: 'OPEN', leaseOwner: null, leaseUntil: null, recoveryAfter: null, revision: { increment: 1 } } });
        return null;
      }
      return this.claim(c);
    });
    if (!picked) return;
    try {
      const verified = await this.storage.verifyMultipartObject({ ...session(picked.t), transferId: id });
      if (verified.sha256 !== picked.t.contentSha256 || detectImageMime(verified.prefix) !== picked.t.uploadOperation.fileObject.mimeType) {
        await this.store.locked(owner, id, async c => { await this.expire(c); if (this.owns(c, picked)) await this.close(c, 'REJECTED', 'UPLOAD_VALIDATION_FAILED'); });
        return;
      }
      await this.store.locked(owner, id, async c => {
        await this.expire(c); if (!this.owns(c, picked)) return;
        await c.tx.multipartTransfer.update({ where: { id }, data: { state: 'STORED', storedETag: verified.etag, storedAt: c.now,
          leaseOwner: null, leaseUntil: null, recoveryAfter: null, lastErrorCode: null, revision: { increment: 1 } } });
        // HEAD/full read identifies the object, not which old I/O has physically settled. Keep old unknown intents.
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof StorageError && error.code === 'CONTENT_MISMATCH') {
        await this.store.locked(owner, id, async c => { await this.expire(c); if (this.owns(c, picked)) await this.close(c, 'REJECTED', 'UPLOAD_VALIDATION_FAILED'); }); return;
      }
      if (!(error instanceof StorageError) || error.code !== 'NOT_FOUND') { await this.failed(owner, picked, 'COMPLETE_UNKNOWN'); return; }
      try {
        const observed = await this.storage.listMultipartParts(session(picked.t));
        if (!sameParts(observed, manifest(picked.t))) { await this.failed(owner, picked, 'COMPLETE_UNKNOWN'); return; }
        const retry = await this.store.locked(owner, id, async c => {
          await this.expire(c); if (!this.owns(c, picked)) return null;
          return this.completeIntent(c, picked);
        });
        if (retry) await this.performComplete(owner, retry); else await this.failed(owner, picked, 'COMPLETE_UNKNOWN');
      } catch (retryError) {
        if (retryError instanceof ApiError) throw retryError;
        await this.failed(owner, picked, 'COMPLETE_UNKNOWN');
      }
    }
  }
  private async completeReply(owner: string, id: string) {
    const result = await this.store.locked(owner, id, async c => {
      await this.expire(c); return { error: this.error(c.transfer), t: c.transfer };
    });
    if (result.error) throw new ApiError(result.error);
    return { status: ['STORED', 'SUCCEEDED'].includes(result.t.state) ? 200 : 202, body: { transfer: publicTransfer(result.t) } };
  }
  async confirmFile(owner: string, fileId: string, requestId?: string) {
    uuid(owner); fileId = uuid(fileId);
    let file;
    try { file = await this.store.prisma.fileObject.findFirst({ where: { id: fileId, ownerId: owner } }); }
    catch { throw new ApiError('DATABASE_UNAVAILABLE'); }
    if (!file) throw new ApiError('FILE_NOT_FOUND');
    if (file.uploadTransport !== 'MULTIPART') return null;
    this.limits.consume(owner, 'complete');
    if (file.status === 'ACTIVE') return { status: 200, body: { file: publicFile({ ...file, uploadOperation: null }) } };
    if (file.status === 'SOFT_DELETED') throw new ApiError('RESOURCE_STATE_CONFLICT');
    const initial = await this.store.locked(owner, fileId, async c => ({ id: c.transfer.id }), true);
    await this.recoverComplete(owner, initial.id);
    const start = await this.store.locked(owner, initial.id, async c => {
      await this.expire(c); const t = c.transfer; const error = this.error(t);
      if (error) return { error };
      if (t.state === 'SUCCEEDED' && t.uploadOperation.fileObject.status === 'ACTIVE') return { file: t.uploadOperation.fileObject };
      if (!['STORED', 'CONFIRMING'].includes(t.state)) return { error: 'UPLOAD_NOT_READY' as const };
      const claim = await this.claim(c); if (!claim) return { pending: true };
      await c.tx.multipartTransfer.update({ where: { id: t.id }, data: { state: 'CONFIRMING' } });
      return { claim: { ...claim, t: await this.load(c) } };
    });
    if (start.error) throw new ApiError(start.error);
    if (start.file) return { status: 200, body: { file: publicFile({ ...start.file, uploadOperation: null }) } };
    if (!start.claim) return { status: 202, body: { transfer: await this.view(owner, initial.id) } };
    const picked = start.claim;
    let verified: Awaited<ReturnType<ObjectStorage['verifyMultipartObject']>>;
    try {
      verified = await this.storage.verifyMultipartObject({ ...session(picked.t), transferId: picked.t.id, etag: picked.t.storedETag! });
    } catch (error) {
      if (error instanceof StorageError && error.code === 'CONTENT_MISMATCH') {
        await this.store.locked(owner, picked.t.id, async c => { await this.expire(c); if (this.owns(c, picked)) await this.close(c, 'REJECTED', 'UPLOAD_VALIDATION_FAILED'); });
        throw new ApiError('UPLOAD_VALIDATION_FAILED');
      }
      await this.failed(owner, picked); throw new ApiError('UPLOAD_VERIFICATION_UNAVAILABLE');
    }
    const mime = detectImageMime(verified.prefix);
    let finished;
    try { finished = await this.store.locked(owner, picked.t.id, async c => {
      await this.expire(c);
      if (c.transfer.state === 'SUCCEEDED' && c.transfer.uploadOperation.fileObject.status === 'ACTIVE') return { file: c.transfer.uploadOperation.fileObject };
      if (!this.owns(c, picked)) return { error: this.error(c.transfer) ?? 'TRANSFER_STATE_CONFLICT' };
      if (verified.etag !== c.transfer.storedETag || verified.sha256 !== c.transfer.contentSha256 || !mime || mime !== c.transfer.uploadOperation.fileObject.mimeType ||
          !this.config.getOrThrow<AppConfig>('app').allowedMimeTypes.includes(mime as AppConfig['allowedMimeTypes'][number])) {
        await this.close(c, 'REJECTED', 'UPLOAD_VALIDATION_FAILED'); return { error: 'UPLOAD_VALIDATION_FAILED' as const };
      }
      if (c.user.reservedStorageBytes < c.transfer.sizeBytes) throw new ApiError('DATABASE_UNAVAILABLE');
      const active = await c.tx.fileObject.update({ where: { id: c.transfer.fileObjectId }, data: { status: 'ACTIVE', detectedMimeType: mime } });
      await c.tx.uploadOperation.update({ where: { id: c.transfer.uploadOperationId }, data: { state: 'FINALIZED', closedAt: c.now } });
      await c.tx.multipartTransfer.update({ where: { id: c.transfer.id }, data: { state: 'SUCCEEDED', verifiedAt: c.now, verifiedSha256: verified.sha256,
        leaseOwner: null, leaseUntil: null, recoveryAfter: null, lastErrorCode: null, revision: { increment: 1 } } });
      await c.tx.user.update({ where: { id: owner }, data: { reservedStorageBytes: { decrement: c.transfer.sizeBytes }, usedStorageBytes: { increment: c.transfer.sizeBytes } } });
      await this.processing.enqueueConfirmedFile(c.tx, active);
      await c.tx.auditEvent.create({ data: { actorUserId: owner, action: 'UPLOAD_CONFIRMED', resourceType: 'FILE_OBJECT', resourceId: active.id,
        requestId: requestId ?? randomUUID(), metadata: { sizeBytes: String(active.sizeBytes), mimeType: mime } } });
      const [clock] = await c.tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
      if (+clock.now >= +c.transfer.expiresAt) throw new ApiError('UPLOAD_EXPIRED');
      if (+clock.now >= +picked.t.leaseUntil!) throw new ApiError('TRANSFER_STATE_CONFLICT');
      return { file: active };
    });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UPLOAD_EXPIRED') await this.store.locked(owner, picked.t.id, async c => { await this.expire(c); });
      throw error;
    }
    if (finished.error) throw new ApiError(finished.error as ApiErrorCode);
    return { status: 200, body: { file: publicFile({ ...finished.file!, uploadOperation: null }) } };
  }
  async cancel(owner: string, id: string) {
    uuid(owner); id = uuid(id);
    const picked = await this.store.locked(owner, id, async c => {
      await this.expire(c);
      if (c.transfer.state === 'SUCCEEDED') return { error: 'TRANSFER_STATE_CONFLICT' as const };
      if (!terminal(c.transfer)) await this.close(c, 'CANCELLED', 'UPLOAD_CANCELLED');
      const t = await this.load(c);
      if (!t.providerUploadId || t.providerNamespace !== this.config.getOrThrow<AppConfig>('app').storage.bucket || t.ioOperations.some(io => io.kind === 'ABORT')) return { claim: null };
      const ioId = randomUUID();
      await c.tx.multipartIoOperation.create({ data: { id: ioId, transferId: id, kind: 'ABORT', attemptNo: 1, fence: t.fence,
        state: 'DISPATCHED', createdAt: c.now, startedAt: c.now } });
      return { claim: { t, fence: t.fence, leaseOwner: '', ioId, kind: 'ABORT' as const } };
    });
    if (picked.error) throw new ApiError(picked.error);
    if (picked.claim) {
      let success = false;
      try { await this.storage.abortMultipart(session(picked.claim.t)); success = true; } catch { /* Unknown: reservation retained. */ }
      await this.store.locked(owner, id, async c => { await this.settle(c, picked.claim!, success); });
    }
    return { status: 202, body: { transfer: await this.view(owner, id) } };
  }
}
