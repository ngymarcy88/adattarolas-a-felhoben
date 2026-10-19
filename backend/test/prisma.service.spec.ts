import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';

jest.mock('../src/generated/prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);
  },
}));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

const createService = () => new PrismaService({
  getOrThrow: jest.fn().mockReturnValue({ databaseUrl: 'postgresql://unit:private@localhost/test' }),
} as unknown as ConfigService);

describe('PrismaService lifecycle', () => {
  it('connects and disconnects through the application lifecycle', async () => {
    const service = createService();
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(service.$connect).toHaveBeenCalledTimes(1);
    expect(service.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('sanitizes driver connection failures', async () => {
    const service = createService();
    (service.$connect as jest.Mock).mockRejectedValueOnce(new Error('postgresql://unit:private@host/test'));
    await expect(service.onModuleInit()).rejects.toThrow('Database connection failed. Verify local infrastructure and configuration.');
  });

  it('sanitizes driver shutdown failures', async () => {
    const service = createService();
    (service.$disconnect as jest.Mock).mockRejectedValueOnce(new Error('private driver state'));
    await expect(service.onModuleDestroy()).rejects.toThrow('Database shutdown failed.');
  });
});
