import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnvironment } from './environment';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    envFilePath: resolve(__dirname, '../../../.env'),
    validate: (env: Record<string, unknown>) => ({ app: validateEnvironment(env) }),
  })],
})
export class AppConfigModule {}
