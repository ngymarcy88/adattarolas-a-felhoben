import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UploadCleanupService } from './files/upload-cleanup.service';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  try { console.log(JSON.stringify(await app.get(UploadCleanupService).runBatch())); }
  finally { await app.close(); }
}
void run().catch(() => { console.error('Upload cleanup failed. Verify local services and configuration.'); process.exitCode = 1; });
