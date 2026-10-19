import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { AppConfig } from '../config/app-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AppConfig>('app');
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 }) });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      // Close partially initialized pools before reporting a safe startup failure.
      await this.$disconnect().catch(() => undefined);
      throw new Error('Database connection failed. Verify local infrastructure and configuration.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch {
      throw new Error('Database shutdown failed.');
    }
  }
}
