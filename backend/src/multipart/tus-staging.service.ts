import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';
import { detectImageMime } from '../files/image-signature';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.interface';
import { MultipartService } from './multipart.service';
import { MultipartStore, type Transfer, type TransferContext } from './multipart.store';
import { TUS_MAX_BYTES, TUS_STAGE_ID, TUS_VERSION, tusAwaitingStorage } from './tus-staging.policy';

const DECIMAL = /^(?:0|[1-9][0-9]{0,6})$/;
const VERSION_HEADER = { 'Tus-Resumable': TUS_VERSION };
const providerFailure = () => new ApiError('STORAGE_UNAVAILABLE');
const writeFailure = () => new ApiError('UPLOAD_VERIFICATION_UNAVAILABLE');

@Injectable()
export class TusStagingService {
  private readonly publishing = new Set<string>();
  private readonly forwarding = new Set<string>();
  constructor(private readonly store: MultipartStore, private readonly transfers: MultipartService,
    private readonly config: ConfigService, @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  private origin(): string {
    const value = this.config.getOrThrow<AppConfig>('app').tusStagingOrigin;
    if (!value) throw new ApiError('TRANSFER_NOT_FOUND');
    return value;
  }

  private checked(c: TransferContext, requireOpen = true): Transfer {
    const t = c.transfer;
    if (!t.tusStaged) throw new ApiError('TRANSFER_NOT_FOUND');
    if (t.state === 'CANCELLED') throw new ApiError('UPLOAD_CANCELLED');
    if (t.state === 'REJECTED') throw new ApiError('UPLOAD_VALIDATION_FAILED');
    if (t.state === 'EXPIRED' || (t.state !== 'SUCCEEDED' && +c.now >= +t.expiresAt)) throw new ApiError('UPLOAD_EXPIRED');
    if (requireOpen && t.state !== 'OPEN' && !(t.state === 'CREATING' && tusAwaitingStorage(t))) {
      throw new ApiError('TRANSFER_STATE_CONFLICT');
    }
    return t;
  }

  private providerUrl(t: Transfer): URL {
    if (!t.tusUploadId || !TUS_STAGE_ID.test(t.tusUploadId)) throw new ApiError('UPLOAD_NOT_READY');
    return new URL('/files/' + t.tusUploadId, this.origin());
  }

  private async provider(url: URL, init: RequestInit) {
    try {
      return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
    } catch { throw providerFailure(); }
  }

  async prepare(owner: string, id: string) {
    const origin = this.origin();
    const t = await this.store.locked(owner, id, async c => {
      const view = this.checked(c);
      if (view.tusUploadId) return null;
      // Commit intent before I/O. Lost creation ACK cannot allocate another staging resource.
      if (view.tusCreateStarted) throw new ApiError('UPLOAD_NOT_READY');
      await c.tx.multipartTransfer.update({ where: { id }, data: { tusCreateStarted: true } });
      return view;
    });
    if (!t) return;
    const created = await this.provider(new URL('/files/', origin), {
      method: 'POST', headers: { ...VERSION_HEADER, 'Upload-Length': String(t.sizeBytes) },
    });
    if (created.status !== 201) throw providerFailure();
    let location: URL;
    try { location = new URL(created.headers.get('Location') ?? '', origin); }
    catch { throw providerFailure(); }
    const idFromProvider = location.pathname.split('/').at(-1);
    if (!idFromProvider || !TUS_STAGE_ID.test(idFromProvider) || location.pathname !== '/files/' + idFromProvider) throw providerFailure();
    await this.store.locked(owner, id, async c => {
      await c.tx.multipartTransfer.update({ where: { id }, data: { tusUploadId: idFromProvider } });
    });
  }

  private async headStage(t: Transfer): Promise<number> {
    const r = await this.provider(this.providerUrl(t), { method: 'HEAD', headers: VERSION_HEADER });
    const offset = r.headers.get('Upload-Offset');
    if (r.status !== 200 || r.headers.get('Upload-Length') !== String(t.sizeBytes) ||
        !offset || !DECIMAL.test(offset) || BigInt(offset) > t.sizeBytes) throw providerFailure();
    return Number(offset);
  }

  async head(owner: string, id: string, res: Response) {
    this.origin();
    const t = await this.store.locked(owner, id, async c => this.checked(c));
    const offset = await this.headStage(t);
    await this.store.locked(owner, id, async c => this.checked(c));
    res.set({ ...VERSION_HEADER, 'Cache-Control': 'no-store', 'Upload-Length': String(t.sizeBytes), 'Upload-Offset': String(offset) }).status(200).end();
  }

  async patch(owner: string, id: string, req: Request, res: Response) {
    this.origin();
    const t = await this.store.locked(owner, id, async c => this.checked(c));
    const target = this.providerUrl(t);
    const offset = req.header('Upload-Offset');
    const length = req.header('Content-Length');
    if (req.header('Tus-Resumable') !== TUS_VERSION || req.header('Content-Type') !== 'application/offset+octet-stream' ||
        req.headers['transfer-encoding'] !== undefined || !offset || !DECIMAL.test(offset) ||
        !length || !DECIMAL.test(length) || Number(length) < 1 || BigInt(offset) + BigInt(length) > t.sizeBytes) {
      throw new ApiError('VALIDATION_ERROR');
    }
    if (this.forwarding.has(id) || this.forwarding.size >= 8) {
      res.setHeader('Retry-After', '2');
      throw new ApiError('RATE_LIMITED');
    }
    this.forwarding.add(id);
    try {
      const observed = await this.forwardPatch(target, offset, length, req, res);
      if (!observed || res.destroyed) return;
      const next = observed.offset;
      if (observed.status === 409 || observed.status === 423) {
        res.set(VERSION_HEADER).status(409).end();
        return;
      }
      if (observed.status !== 204 || typeof next !== 'string' || !DECIMAL.test(next) ||
          BigInt(next) !== BigInt(offset) + BigInt(length)) throw providerFailure();
      await this.store.locked(owner, id, async c => this.checked(c));
      res.set({ ...VERSION_HEADER, 'Cache-Control': 'no-store', 'Upload-Offset': next }).status(204).end();
    } finally { this.forwarding.delete(id); }
  }

  private forwardPatch(target: URL, offset: string, length: string, req: Request, res: Response) {
    return new Promise<{ status: number; offset?: string | string[] } | null>((resolve, reject) => {
      const upstream = request(target, { method: 'PATCH', headers: {
        ...VERSION_HEADER, 'Upload-Offset': offset, 'Content-Length': length, 'Content-Type': 'application/offset+octet-stream',
      } }, answer => {
        answer.resume();
        answer.once('end', () => done({ status: answer.statusCode ?? 502, offset: answer.headers['upload-offset'] }));
        answer.once('error', () => done(null, providerFailure()));
      });
      const deadline = setTimeout(() => abandon(providerFailure()), 90000);
      const clientClosed = () => abandon();
      let settled = false;
      function done(value: { status: number; offset?: string | string[] } | null, error?: ApiError) {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        req.off('aborted', clientClosed);
        res.off('close', clientClosed);
        if (error) reject(error); else resolve(value);
      }
      function abandon(error?: ApiError) {
        req.unpipe(upstream);
        upstream.destroy();
        done(null, error);
      }
      upstream.once('error', () => done(null, res.destroyed ? undefined : providerFailure()));
      req.once('aborted', clientClosed);
      res.once('close', clientClosed);
      if (req.aborted || res.destroyed) { abandon(); return; }
      req.pipe(upstream);
    });
  }

  private async readVerified(t: Transfer): Promise<Buffer> {
    if (await this.headStage(t) !== Number(t.sizeBytes)) throw new ApiError('UPLOAD_NOT_READY');
    const r = await this.provider(this.providerUrl(t), { method: 'GET' });
    if (!r.ok || !r.body || r.headers.get('Content-Length') !== String(t.sizeBytes) || t.sizeBytes > BigInt(TUS_MAX_BYTES)) throw providerFailure();
    const reader = r.body.getReader();
    const data = Buffer.alloc(Number(t.sizeBytes));
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (size + chunk.value.byteLength > data.length) throw providerFailure();
        data.set(chunk.value, size);
        size += chunk.value.byteLength;
      }
    } catch { throw providerFailure(); }
    finally { await reader.cancel().catch(() => {}); }
    if (size !== data.length || createHash('sha256').update(data).digest('hex') !== t.contentSha256 ||
        detectImageMime(data.subarray(0, 16)) !== t.uploadOperation.fileObject.mimeType) throw new ApiError('UPLOAD_VALIDATION_FAILED');
    return data;
  }

  async complete(owner: string, id: string) {
    this.origin();
    const t = await this.store.locked(owner, id, async c => this.checked(c, false));
    if (t.state !== 'OPEN' && !(t.tusDeferred && ['CREATING', 'CREATE_UNKNOWN'].includes(t.state))) return this.transfers.complete(owner, id);
    if (this.publishing.has(id) || this.publishing.size >= 2) throw new ApiError('UPLOAD_NOT_READY');
    if (t.providerNamespace !== this.config.getOrThrow<AppConfig>('app').storage.bucket) throw providerFailure();

    this.publishing.add(id);
    try {
      const bytes = await this.readVerified(t);
      if (t.tusDeferred && !t.providerUploadId) await this.transfers.prepareVerifiedStaging(owner, id);
      const current = await this.store.locked(owner, id, async c => this.checked(c, false));
      if (!current.providerUploadId) throw new ApiError('UPLOAD_NOT_READY');
      if (current.state !== 'OPEN') return this.transfers.complete(owner, id);
      const session = { key: current.uploadOperation.fileObject.storageKey, uploadId: current.providerUploadId,
        sizeBytes: Number(current.sizeBytes), partSizeBytes: current.partSizeBytes };
      try {
        const parts = await this.storage.listMultipartParts(session);
        // Only this route can supply the staged part, and every retry verifies identical bytes.
        if (!parts.length) await this.storage.uploadStagedPart({ ...session, bytes });
      } catch { throw writeFailure(); }
      return await this.transfers.complete(owner, id);
    } finally { this.publishing.delete(id); }
  }
}
