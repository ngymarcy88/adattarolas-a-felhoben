import { UploadStateService } from './upload-state.service';
import { UploadConfirmService } from './upload-confirm.service';
import { FileIdPipe, UploadConfirmGuard } from './upload-confirm.guard';
import { UploadCleanupService } from './upload-cleanup.service';
import { UploadCleanupWorker } from './upload-cleanup.worker';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingStateService } from '../processing/processing-state.service';
import { thumbnailProcessingPolicy } from '../processing/thumbnail-processor';
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

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [FilesController],
  providers: [{ provide: ProcessingStateService, inject: [PrismaService, ConfigService],
    useFactory: (prisma: PrismaService, config: ConfigService) => new ProcessingStateService(prisma, config, thumbnailProcessingPolicy) },
    FilePreviewService, FilePreviewGuard, FileListService, FileListQueryPipe, FileListGuard, UploadStateService, UploadConfirmService, FileIdPipe, UploadConfirmGuard, UploadCleanupService, UploadCleanupWorker, UploadInitService, UploadInitValidationPipe, UploadInitGuard] })
export class FilesModule {}
