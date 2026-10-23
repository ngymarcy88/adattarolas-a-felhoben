import { Body, Controller, Header, Headers, Post, Res, Req, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OriginGuard } from '../auth/origin.guard';
import { SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import { UploadInitDto, UploadInitValidationPipe, uploadKey } from './upload-init.dto';
import { UploadInitGuard } from './upload-init.guard';
import { UploadInitService } from './upload-init.service';

@Controller('files')
export class FilesController {
  constructor(private readonly uploads: UploadInitService) {}
  @Post('uploads/init')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard, SessionGuard, UploadInitGuard)
  async initiate(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string,
    @Body(UploadInitValidationPipe) input: UploadInitDto, @Res() response: Response) {
    const result = await this.uploads.initiate(request.user.id, uploadKey(key), input);
    response.status(result.created ? 201 : 200).json(result.body);
  }
}
