import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UploadCleanupService } from './upload-cleanup.service';
import { TusCleanupService } from '../multipart/tus-cleanup.service';

@Injectable()
export class UploadCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private active?: Promise<unknown>;
  private readonly shutdown = new AbortController();
  private readonly logger = new Logger(UploadCleanupWorker.name);
  constructor(private readonly cleanup: UploadCleanupService, private readonly tusCleanup: TusCleanupService) {}
  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.active) return;
      this.active = Promise.allSettled([
        this.cleanup.runBatch(this.shutdown.signal),
        this.tusCleanup.cleanSuccessfulBatch(this.shutdown.signal),
      ]).then(([original, staging]) => {
        if (original.status === 'rejected') this.logger.warn({ event: 'upload_cleanup_failed', code: 'DATABASE_UNAVAILABLE' });
        if (staging.status === 'rejected') this.logger.warn({ event: 'tus_cleanup_failed', code: 'DATABASE_UNAVAILABLE' });
      }).finally(() => { this.active = undefined; });
    }, 60000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> { this.shutdown.abort(); if (this.timer) clearInterval(this.timer); await this.active; }
}
