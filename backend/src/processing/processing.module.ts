import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { ProcessingStateService } from './processing-state.service';
import { ProcessingPublicationService } from './processing-publication.service';
import { thumbnailProcessingPolicy } from './thumbnail-processor';

/** Shared application services; importing this module never starts processing. */
@Module({ imports: [PrismaModule, StorageModule], providers: [
  { provide: ProcessingStateService, inject: [PrismaService, ConfigService],
    useFactory: (prisma: PrismaService, config: ConfigService) => new ProcessingStateService(prisma, config, thumbnailProcessingPolicy) },
  ProcessingPublicationService,
], exports: [ProcessingStateService, ProcessingPublicationService] })
export class ProcessingModule {}
