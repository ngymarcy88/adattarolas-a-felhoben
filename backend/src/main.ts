import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppConfig } from './config/app-config';
import { ApiError } from './common/errors/api-error';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  app.setGlobalPrefix('api/v1');
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || origin === config.frontendPublicUrl) callback(null, true);
      else callback(new ApiError('ORIGIN_NOT_ALLOWED'));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}

void bootstrap().catch(() => {
  Logger.error('Backend startup failed. Verify configuration, generated Prisma client and local services.', 'Bootstrap');
  process.exitCode = 1;
});
