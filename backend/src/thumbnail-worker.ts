import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ThumbnailWorkerModule } from './processing/thumbnail-worker.module';
import { ThumbnailWorker } from './processing/thumbnail.worker';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ThumbnailWorkerModule, { logger: false, abortOnError: false });
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= app.get(ThumbnailWorker).stop().then(() => app.close()).catch(() => {
      console.error('Thumbnail worker shutdown failed.'); process.exitCode = 1;
    });
  };
  // Drain worker/heartbeats/decoder BEFORE Prisma and storage lifecycle teardown.
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
void run().catch(() => { console.error('Thumbnail worker startup failed. Verify local configuration and services.'); process.exitCode = 1; });
