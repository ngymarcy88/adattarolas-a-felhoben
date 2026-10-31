import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { ProcessingModule } from './processing.module';
import { StorageModule } from '../storage/storage.module';
import { ThumbnailProcessor } from './thumbnail-processor';
import { THUMBNAIL_PROCESSOR, ThumbnailWorker } from './thumbnail.worker';

@Module({ imports: [AppConfigModule, ProcessingModule, StorageModule], providers: [
  { provide: THUMBNAIL_PROCESSOR, useFactory: () => new ThumbnailProcessor() }, ThumbnailWorker,
] })
export class ThumbnailWorkerModule {}
