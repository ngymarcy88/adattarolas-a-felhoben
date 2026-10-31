import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { OriginGuard } from '../auth/origin.guard';
import { ProcessingApiService } from './processing-api.service';
import { ProcessingRetryPipe, ProcessingStatusPipe } from './processing.dto';
import { ProcessingRetryGuard, ProcessingStatusGuard, ThumbnailUrlGuard } from './processing.guard';
import { FileIdPipe } from './upload-confirm.guard';

@Controller('files')
export class ProcessingController {
  constructor(private readonly processing: ProcessingApiService) {}
  @Post('processing/status')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, SessionGuard, ProcessingStatusGuard)
  status(@Req() request: AuthenticatedRequest, @Body(ProcessingStatusPipe) input: { fileIds: string[] }) {
    return this.processing.status(request.user.id, input.fileIds);
  }
  @Get(':fileId/thumbnail-url')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard, ThumbnailUrlGuard)
  thumbnailUrl(@Req() request: AuthenticatedRequest, @Param('fileId', FileIdPipe) id: string) {
    return this.processing.thumbnailUrl(request.user.id, id);
  }
  @Post(':fileId/processing/thumbnail/retry')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, SessionGuard, ProcessingRetryGuard)
  async retry(@Req() request: AuthenticatedRequest, @Param('fileId', FileIdPipe) id: string,
    @Body(ProcessingRetryPipe) input: { expectedRetryRevision: number }, @Res() response: Response) {
    const result = await this.processing.retry(request.user.id, id, input.expectedRetryRevision);
    response.status(result.changed ? 202 : 200).json(result.body);
  }
}
