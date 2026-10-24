import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './files.controller';
import { UploadInitService } from './upload-init.service';
import { UploadInitValidationPipe } from './upload-init.dto';
import { UploadInitGuard } from './upload-init.guard';

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [FilesController],
  providers: [UploadInitService, UploadInitValidationPipe, UploadInitGuard] })
export class FilesModule {}
