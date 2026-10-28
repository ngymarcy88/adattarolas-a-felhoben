import { UploadConfirmService } from './upload-confirm.service';
import { FileIdPipe, UploadConfirmGuard } from './upload-confirm.guard';
import { Body, Param, Controller, Get, Query, Header, Headers, Post, Res, Req, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OriginGuard } from '../auth/origin.guard';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { UploadInitDto, UploadInitValidationPipe, uploadKey } from './upload-init.dto';
import { UploadInitGuard } from './upload-init.guard';
import { UploadInitService } from './upload-init.service';
import { FileListService } from './file-list.service';
import { FileListQuery, FileListQueryPipe } from './file-list.query';
import { FileListGuard } from './file-list.guard';
import { FilePreviewService } from './file-preview.service';
import { FilePreviewGuard } from './file-preview.guard';

@Controller('files')
export class FilesController {
  constructor(private readonly uploads: UploadInitService, private readonly confirmation: UploadConfirmService,
    private readonly listing: FileListService, private readonly preview: FilePreviewService) {}
  @Get(':fileId/preview-url')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard, FilePreviewGuard)
  previewUrl(@Req() request: AuthenticatedRequest, @Param('fileId', FileIdPipe) id: string) {
    return this.preview.create(request.user.id, id);
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard, FileListGuard)
  list(@Req() request: AuthenticatedRequest, @Query(FileListQueryPipe) query: FileListQuery) {
    return this.listing.list(request.user.id, query);
  }
  @Post(':fileId/confirm')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, SessionGuard, UploadConfirmGuard)
  async confirm(@Req() request: AuthenticatedRequest & { requestId?: string }, @Param('fileId', FileIdPipe) id: string, @Res() response: Response) {
    response.status(200).json(await this.confirmation.confirm(request.user.id, id, request.requestId));
  }

  @Post('uploads/init')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, SessionGuard, UploadInitGuard)
  async initiate(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string,
    @Body(UploadInitValidationPipe) input: UploadInitDto, @Res() response: Response) {
    const result = await this.uploads.initiate(request.user.id, uploadKey(key), input);
    response.status(result.created ? 201 : 200).json(result.body);
  }
}
