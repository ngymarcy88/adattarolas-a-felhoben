import { Body, Controller, Head, Header, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OriginGuard } from '../auth/origin.guard';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { ApiError } from '../common/errors/api-error';
import { FileIdPipe } from '../files/upload-confirm.guard';
import { record } from './multipart.dto';
import { MultipartLimits } from './multipart.limit';
import { TusStagingService } from './tus-staging.service';
import { TUS_VERSION } from './tus-staging.policy';

@Controller('tus')
@UseGuards(SessionGuard)
export class TusStagingController {
  constructor(private readonly staging: TusStagingService, private readonly limits: MultipartLimits) {}

  @Post(':id/prepare')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  async prepare(@Req() req: AuthenticatedRequest, @Param('id', FileIdPipe) id: string,
    @Body() input: unknown, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    this.limits.consume(req.user.id, 'resume', res);
    record(query, []);
    record(input, []);
    await this.staging.prepare(req.user.id, id);
    return { ready: true };
  }

  @Head(':id')
  async head(@Req() req: AuthenticatedRequest, @Param('id', FileIdPipe) id: string,
    @Query() query: unknown, @Res() res: Response) {
    this.limits.consume(req.user.id, 'read', res);
    record(query, []);
    if (req.header('Tus-Resumable') !== TUS_VERSION || req.headers['transfer-encoding'] !== undefined ||
        (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) {
      throw new ApiError('VALIDATION_ERROR');
    }
    await this.staging.head(req.user.id, id, res);
  }

  @Patch(':id')
  @UseGuards(OriginGuard)
  async patch(@Req() req: AuthenticatedRequest, @Param('id', FileIdPipe) id: string,
    @Query() query: unknown, @Res() res: Response) {
    this.limits.consume(req.user.id, 'sign', res);
    record(query, []);
    await this.staging.patch(req.user.id, id, req, res);
  }

  @Post(':id/complete')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard)
  async complete(@Req() req: AuthenticatedRequest, @Param('id', FileIdPipe) id: string,
    @Body() input: unknown, @Query() query: unknown, @Res() res: Response) {
    this.limits.consume(req.user.id, 'complete', res);
    record(query, []);
    record(input, []);
    const result = await this.staging.complete(req.user.id, id);
    if (result.status === 202) res.setHeader('Retry-After', '2');
    res.status(result.status).json(result.body);
  }
}
