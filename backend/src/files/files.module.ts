import { ProcessingController } from './processing.controller';
import { ProcessingApiService } from './processing-api.service';
import { ProcessingStatusPipe, ProcessingRetryPipe } from './processing.dto';
import { ProcessingStatusGuard, ProcessingRetryGuard, ThumbnailUrlGuard } from './processing.guard';
import { UploadStateService } from './upload-state.service';
import { UploadConfirmService } from './upload-confirm.service';
import { FileIdPipe, UploadConfirmGuard } from './upload-confirm.guard';
import { UploadCleanupService } from './upload-cleanup.service';
import { UploadCleanupWorker } from './upload-cleanup.worker';
import { Module } from '@nestjs/common';
import { ProcessingModule } from '../processing/processing.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './files.controller';
import { UploadInitService } from './upload-init.service';
import { UploadInitValidationPipe } from './upload-init.dto';
import { UploadInitGuard } from './upload-init.guard';
import { FileListService } from './file-list.service';
import { FileListQueryPipe } from './file-list.query';
import { FileListGuard } from './file-list.guard';
import { FilePreviewService } from './file-preview.service';
import { FilePreviewGuard } from './file-preview.guard';

@Module({ imports: [AuthModule, PrismaModule, StorageModule, ProcessingModule], controllers: [FilesController, ProcessingController],
  providers: [ProcessingApiService, ProcessingStatusPipe, ProcessingRetryPipe, ProcessingStatusGuard, ProcessingRetryGuard, ThumbnailUrlGuard, FilePreviewService, FilePreviewGuard, FileListService, FileListQueryPipe, FileListGuard, UploadStateService, UploadConfirmService, FileIdPipe, UploadConfirmGuard, UploadCleanupService, UploadCleanupWorker, UploadInitService, UploadInitValidationPipe, UploadInitGuard] })
export class FilesModule {}
