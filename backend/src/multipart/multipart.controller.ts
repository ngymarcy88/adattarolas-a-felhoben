import { applyDecorators, Body, CanActivate, Controller, ExecutionContext, Get, Header, Headers, HttpCode, Injectable, Param, Post, Query, Req, Res, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { OriginGuard } from '../auth/origin.guard';
import { ApiError } from '../common/errors/api-error';
import { FileIdPipe } from '../files/upload-confirm.guard';
import { MultipartImportsService } from './multipart-imports.service';
import { MultipartService } from './multipart.service';
import { MultipartFilePipe, record, uuid, type MultipartFileInput } from './multipart.dto';
import { MultipartLimits, type MultipartBudget } from './multipart.limit';

@Injectable()
export class MultipartGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly limits: MultipartLimits) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const budget = this.reflector.get<MultipartBudget>('multipart:budget', context.getHandler());
    this.limits.consume(request.user.id, budget, response);
    if (request.method === 'GET') {
      if (request.body !== undefined || request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) throw new ApiError('VALIDATION_ERROR');
      if (budget !== 'read') throw new ApiError('VALIDATION_ERROR');
      return true;
    }
    if (Object.keys(request.query ?? {}).length) throw new ApiError('VALIDATION_ERROR');
    if (typeof request.headers['content-type'] !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'])) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
    return true;
  }
}
const Read = () => applyDecorators(Header('Cache-Control', 'no-store'), SetMetadata('multipart:budget', 'read'), UseGuards(SessionGuard, MultipartGuard));
const Mutation = (budget: MultipartBudget) => applyDecorators(HttpCode(200), Header('Cache-Control', 'no-store'), SetMetadata('multipart:budget', budget), UseGuards(OriginGuard, SessionGuard, MultipartGuard));
function reply(response: Response, result: { status: number; body: unknown }) {
  if (result.status === 202) response.setHeader('Retry-After', '2');
  return response.status(result.status).json(result.body);
}
@Controller()
export class MultipartController {
  constructor(private readonly imports: MultipartImportsService, private readonly transfers: MultipartService) {}
  @Post('imports') @Mutation('create')
  async create(@Req() r: AuthenticatedRequest, @Headers('idempotency-key') key: string, @Body() input: unknown, @Res() response: Response) {
    record(input, []); return reply(response, await this.imports.create(r.user.id, uuid(key, true)));
  }
  @Get('imports') @Read()
  list(@Req() r: AuthenticatedRequest, @Query() query: unknown) { return this.imports.list(r.user.id, query); }
  @Get('imports/:importId') @Read()
  get(@Req() r: AuthenticatedRequest, @Param('importId', FileIdPipe) id: string, @Query() query: unknown) { return this.imports.get(r.user.id, id, query); }
  @Post('imports/:importId/files') @Mutation('init')
  async initiate(@Req() r: AuthenticatedRequest, @Param('importId', FileIdPipe) id: string, @Headers('idempotency-key') key: string,
    @Body(MultipartFilePipe) input: MultipartFileInput, @Res() response: Response) {
    return reply(response, await this.imports.initiate(r.user.id, id, uuid(key, true), input));
  }
  @Get('transfers/:transferId') @Read()
  async status(@Req() r: AuthenticatedRequest, @Param('transferId', FileIdPipe) id: string, @Query() query: unknown) {
    record(query, []); return { transfer: await this.transfers.status(r.user.id, id) };
  }
  @Post('transfers/:transferId/parts/:partNumber/sign') @Mutation('sign')
  sign(@Req() r: AuthenticatedRequest, @Param('transferId', FileIdPipe) id: string, @Param('partNumber') n: string, @Body() input: unknown) {
    record(input, []); if (typeof n !== 'string' || (!/^(?:[1-9]|1[0-9]|20)$/.test(n) || String(Number(n)) !== n)) throw new ApiError('VALIDATION_ERROR');
    return this.transfers.sign(r.user.id, id, Number(n));
  }
  @Post('transfers/:transferId/resume') @Mutation('resume')
  async resume(@Req() r: AuthenticatedRequest, @Param('transferId', FileIdPipe) id: string, @Body() input: unknown) {
    return { transfer: await this.transfers.resume(r.user.id, id, input) };
  }
  @Post('transfers/:transferId/complete') @Mutation('complete')
  async complete(@Req() r: AuthenticatedRequest, @Param('transferId', FileIdPipe) id: string, @Body() input: unknown, @Res() response: Response) {
    record(input, []); return reply(response, await this.transfers.complete(r.user.id, id));
  }
  @Post('transfers/:transferId/cancel') @Mutation('cancel')
  async cancel(@Req() r: AuthenticatedRequest, @Param('transferId', FileIdPipe) id: string, @Body() input: unknown, @Res() response: Response) {
    record(input, []); return reply(response, await this.transfers.cancel(r.user.id, id));
  }
}
