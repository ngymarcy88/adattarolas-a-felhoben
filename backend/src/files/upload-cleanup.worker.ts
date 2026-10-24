import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UploadCleanupService } from './upload-cleanup.service';

@Injectable()
export class UploadCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private active?: Promise<unknown>;
  private readonly shutdown = new AbortController();
  private readonly logger = new Logger(UploadCleanupWorker.name);
  constructor(private readonly cleanup: UploadCleanupService) {}
  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.active) return;
      this.active = this.cleanup.runBatch(this.shutdown.signal).catch(() => {
        this.logger.warn({ event: 'upload_cleanup_failed', code: 'DATABASE_UNAVAILABLE' });
      }).finally(() => { this.active = undefined; });
    }, 60000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> { this.shutdown.abort(); if (this.timer) clearInterval(this.timer); await this.active; }
}
