import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, HttpCode, Injectable, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { OriginGuard } from '../auth/origin.guard';
import { ApiError } from '../common/errors/api-error';
import type { AppConfig } from '../config/app-config';
import { MultipartService } from './multipart.service';
import { MultipartStore } from './multipart.store';
import { MultipartLimits } from './multipart.limit';
import { record, uuid } from './multipart.dto';

/** Companion fetch uses same-origin cookies; reject cross-site GET signing, even with a valid cookie. */
@Injectable()
export class UppySameOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(c: ExecutionContext) {
    const r = c.switchToHttp().getRequest<AuthenticatedRequest>();
    if (r.headers['sec-fetch-site'] !== 'same-origin' || (r.headers.origin && r.headers.origin !== this.config.getOrThrow<AppConfig>('app').frontendPublicUrl)) throw new ApiError('ORIGIN_NOT_ALLOWED');
    if (['GET','DELETE'].includes(r.method) && (r.body!==undefined || r.headers['transfer-encoding']!==undefined || (r.headers['content-length']!==undefined && r.headers['content-length']!=='0')))throw new ApiError('VALIDATION_ERROR');
    if(r.method==='POST' && (typeof r.headers['content-type']!=='string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(r.headers['content-type'])))throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
    return true;
  }
}
@Controller('uppy/s3/multipart')
@UseGuards(SessionGuard, UppySameOriginGuard)
export class UppyController {
  constructor(private readonly transfers: MultipartService, private readonly store: MultipartStore, private readonly limits: MultipartLimits,
    private readonly config: ConfigService) {}
  private query(id: string, value: unknown) {
    id = uuid(id); const q = record(value, ['key']); if (q.key !== id) throw new ApiError('VALIDATION_ERROR'); return id;
  }
  private budget(r: AuthenticatedRequest, budget: 'read'|'sign'|'complete'|'cancel', response: Response) { response.setHeader('Cache-Control','no-store'); this.limits.consume(r.user.id, budget, response); }
  @Post() @HttpCode(200) @UseGuards(OriginGuard)
  async create(@Req() r: AuthenticatedRequest, @Body() body: unknown, @Query() query: unknown, @Res() response: Response) {
    record(query, []); const b = record(body, ['filename','type','metadata']); record(b.metadata, []);
    const id = uuid(b.filename); this.budget(r, 'read', response);
    const mime = await this.store.locked(r.user.id, id, async c => c.transfer.uploadOperation.fileObject.mimeType);
    if (b.type !== mime) throw new ApiError('VALIDATION_ERROR');
    const t = await this.transfers.prepare(r.user.id, id);
    if (t.state !== 'OPEN') throw new ApiError('UPLOAD_NOT_READY');
    return response.json({ key: id, uploadId: id });
  }
  @Get(':id')
  async parts(@Req() r: AuthenticatedRequest, @Param('id') input: string, @Query() query: unknown, @Res() response: Response) {
    const id = this.query(input, query); this.budget(r, 'read', response);
    const snapshot = await this.transfers.status(r.user.id, id);
    const parts = await this.store.locked(r.user.id, id, async c => {
      if (c.transfer.state !== 'OPEN' || c.transfer.revision !== snapshot.revision || +c.now >= +c.transfer.expiresAt) throw new ApiError('TRANSFER_STATE_CONFLICT');
      const observed=c.transfer.parts.filter(p=>p.observedETag!==null&&p.observedSizeBytes!==null);
      if(observed.length!==snapshot.parts.length || observed.some((p,i)=>p.partNumber!==snapshot.parts[i]?.partNumber||p.observedSizeBytes!==snapshot.parts[i]?.sizeBytes))throw new ApiError('TRANSFER_STATE_CONFLICT');
      return c.transfer.parts.filter(p => p.observedETag !== null && p.observedSizeBytes !== null).map(p => ({ PartNumber:p.partNumber, ETag:p.observedETag! }));
    });
    return response.json(parts);
  }
  @Get(':id/:partNumber')
  async sign(@Req() r: AuthenticatedRequest, @Param('id') input: string, @Param('partNumber') n: string, @Query() query: unknown, @Res() response: Response) {
    const id = this.query(input, query); this.budget(r, 'sign', response);
    if (!/^[1-9][0-9]?$/.test(n) || String(Number(n)) !== n) throw new ApiError('VALIDATION_ERROR');
    const access = await this.transfers.sign(r.user.id, id, Number(n));
    try {
      const url=new URL(access.url);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.origin===this.config.getOrThrow<AppConfig>('app').frontendPublicUrl)throw new Error();
    } catch {throw new ApiError('STORAGE_UNAVAILABLE');}
    return response.json({url:access.url});
  }
  @Post(':id/complete') @HttpCode(200) @UseGuards(OriginGuard)
  async complete(@Req() r: AuthenticatedRequest, @Param('id') input: string, @Query() query: unknown, @Body() body: unknown, @Res() response: Response) {
    const id = this.query(input, query); this.budget(r, 'complete', response);
    const b=record(body,['parts']);
    if (!Array.isArray(b.parts) || b.parts.length < 1 || b.parts.length > 20) throw new ApiError('VALIDATION_ERROR');
    for (const part of b.parts) { const p=record(part,['PartNumber','ETag']); if (!Number.isInteger(p.PartNumber) || Number(p.PartNumber)<1 || Number(p.PartNumber)>20 || typeof p.ETag!=='string' || p.ETag.length>512) throw new ApiError('VALIDATION_ERROR'); }
    // Deliberately do not forward the client's ETags/manifest. The service re-lists and seals storage facts.
    const result=await this.transfers.complete(r.user.id,id);
    if(result.status!==200) {response.setHeader('Retry-After','2');throw new ApiError('UPLOAD_NOT_READY');}
    return response.json({key:id,location:this.config.getOrThrow<AppConfig>('app').frontendPublicUrl+'/app'});
  }
  @Delete(':id') @HttpCode(204) @UseGuards(OriginGuard)
  async detach(@Req() r: AuthenticatedRequest, @Param('id') input: string, @Query() query: unknown, @Body() body: unknown, @Res() response: Response) {
    const id=this.query(input,query);this.budget(r,'cancel',response);
    if (body!==undefined) throw new ApiError('VALIDATION_ERROR');
    // Uppy destroy/remove emits abort. Treat this integration hook as client detach, preserving resume.
    // A deliberate terminal cancel uses the explicit JSON transfer/cancel endpoint instead.
    await this.store.locked(r.user.id,id,async()=>{});
    return response.status(204).end();
  }
}
