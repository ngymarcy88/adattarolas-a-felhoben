import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config';
import { S3StorageAdapter } from './s3-storage.adapter';
import { OBJECT_STORAGE } from './storage.interface';

@Module({
  providers: [{ provide: OBJECT_STORAGE, inject: [ConfigService],
    useFactory: (config: ConfigService) => new S3StorageAdapter(config.getOrThrow<AppConfig>('app')) }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
