import { UploadStateService } from './upload-state.service';
import { UploadConfirmService } from './upload-confirm.service';
import { FileIdPipe, UploadConfirmGuard } from './upload-confirm.guard';
import { UploadCleanupService } from './upload-cleanup.service';
import { UploadCleanupWorker } from './upload-cleanup.worker';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './files.controller';
import { UploadInitService } from './upload-init.service';
import { UploadInitValidationPipe } from './upload-init.dto';
import { UploadInitGuard } from './upload-init.guard';

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [FilesController],
  providers: [UploadStateService, UploadConfirmService, FileIdPipe, UploadConfirmGuard, UploadCleanupService, UploadCleanupWorker, UploadInitService, UploadInitValidationPipe, UploadInitGuard] })
export class FilesModule {}
