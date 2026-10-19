import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';
import { PasswordService } from '../src/auth/password.service';
import { RegisterDto, RegisterValidationPipe } from '../src/auth/register.dto';
import { RegistrationGuard } from '../src/auth/registration.guard';

const config = { getOrThrow: jest.fn().mockReturnValue({
  frontendPublicUrl: 'http://127.0.0.1:5173', defaultUserStorageLimitBytes: 1073741824,
}) } as unknown as ConfigService;
const valid = () => ({ email: ' Test.User+tag@Example.test ', displayName: ' Teszt User ', password: 'long test passphrase' });
const pipe = new RegisterValidationPipe();
const context = (origin: unknown = 'http://127.0.0.1:5173', peer = '127.0.0.1', forwarded = 'spoofed') => ({
  switchToHttp: () => ({ getRequest: () => ({
    headers: { origin, 'x-forwarded-for': forwarded }, socket: { remoteAddress: peer },
  }) }),
}) as unknown as ExecutionContext;
const uniqueError = (target: string[] = ['email']) => new Prisma.PrismaClientKnownRequestError('private query', {
  code: 'P2002', clientVersion: '7.10.1', meta: { target },
});

describe('RegisterValidationPipe', () => {
  it('normalizes email and name while preserving the password', () => {
    const input = { ...valid(), password: '  Árvíztűrő test passphrase  ' };
    expect(pipe.transform(input)).toEqual(new RegisterDto('test.user+tag@example.test', 'Teszt User', input.password));
  });

  it.each([
    null, undefined, [], 'invalid', {}, { ...valid(), email: null }, { ...valid(), password: 123 },
    { ...valid(), storageLimitBytes: 999999 }, { ...valid(), passwordHash: 'injected' },
    { ...valid(), email: 'x@@example.test' }, { ...valid(), email: 'x@localhost' },
    { ...valid(), email: '.x@example.test' }, { ...valid(), email: 'x..y@example.test' },
    { ...valid(), email: 'x@-example.test' }, { ...valid(), email: 'ü@example.test' },
    { ...valid(), email: `${'x'.repeat(65)}@example.test` },
    { ...valid(), email: `x@${'a'.repeat(64)}.test` },
    { ...valid(), email: `x@${['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(62)].join('.')}` },
    { ...valid(), displayName: '   ' }, { ...valid(), displayName: 'a'.repeat(101) },
    { ...valid(), displayName: 'name\u0000' }, { ...valid(), displayName: 'bad\ud800' },
    { ...valid(), password: 'a'.repeat(14) }, { ...valid(), password: '😀'.repeat(14) },
    { ...valid(), password: 'a'.repeat(1025) }, { ...valid(), password: '😀'.repeat(257) },
    { ...valid(), password: 'a'.repeat(20) + '\ud800' },
  ])('rejects invalid shape or unsafe input without echoing values %#', (input) => {
    try { pipe.transform(input); throw new Error('Expected rejection'); }
    catch (error) { expect(error).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 }); }
  });

  it.each(['a'.repeat(15), '😀'.repeat(15), 'a'.repeat(1024), '😀'.repeat(256), ' '.repeat(15)])
    ('accepts Unicode/whitespace and documented password boundaries %#', (password) => {
      expect(pipe.transform({ ...valid(), password }).password).toBe(password);
    });

  it('accepts a 100-code-point display name and a 254-character email', () => {
    const email = `${'l'.repeat(64)}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(61)}`;
    expect(email).toHaveLength(254);
    expect(pipe.transform({ ...valid(), email, displayName: '😀'.repeat(100) }).displayName).toHaveLength(200);
  });
});

describe('RegistrationGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([undefined, '', 'null', 'http://localhost:5173', 'http://127.0.0.1:5173.evil', ['http://127.0.0.1:5173']])
    ('rejects missing or non-exact Origin %#', (origin) => {
      expect(() => new RegistrationGuard(config).canActivate(({ switchToHttp: () => ({ getRequest: () => ({ headers: { origin }, socket: {} }) }) } as unknown as ExecutionContext)))
        .toThrow(expect.objectContaining({ code: 'ORIGIN_NOT_ALLOWED', status: 403 }));
    });

  it('limits direct peers to five attempts per minute, ignoring spoofed forwarded headers', () => {
    const guard = new RegistrationGuard(config);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    for (let i = 0; i < 5; i++) expect(guard.canActivate(context(undefined, 'peer', String(i)))).toBe(true);
    expect(() => guard.canActivate(context(undefined, 'peer'))).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    expect(guard.canActivate(context(undefined, 'other'))).toBe(true);
    jest.spyOn(Date, 'now').mockReturnValue(61_000);
    expect(guard.canActivate(context(undefined, 'peer'))).toBe(true);
  });

  it('does not let rejected origins consume the valid-origin allowance', () => {
    const guard = new RegistrationGuard(config);
    for (let i = 0; i < 6; i++) expect(() => guard.canActivate(context('https://evil.test'))).toThrow();
    expect(guard.canActivate(context())).toBe(true);
  });

  it('bounds peer state and reclaims expired entries without evicting live limits', () => {
    const guard = new RegistrationGuard(config);
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    for (let i = 0; i < 1024; i++) expect(guard.canActivate(context(undefined, `peer${i}`))).toBe(true);
    expect(() => guard.canActivate(context(undefined, 'extra'))).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    jest.spyOn(Date, 'now').mockReturnValue(61_000);
    expect(guard.canActivate(context(undefined, 'extra'))).toBe(true);
  });
});

describe('AuthService registration', () => {
  const user = { id: 'unit-user-id', email: 'test.user+tag@example.test', displayName: 'Teszt User', createdAt: new Date('2026-10-19T10:00:00Z') };
  const create = jest.fn();
  const hash = jest.fn();
  let service: AuthService;
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ ...user, passwordHash: 'private hash', storageLimitBytes: 1n });
    hash.mockReset().mockResolvedValue('salted hash');
    service = new AuthService({ user: { create } } as unknown as PrismaService, { hash } as unknown as PasswordService, config);
  });

  it('persists only a password hash, assigns server quota and returns a strict public projection', async () => {
    const input = pipe.transform(valid());
    expect(await service.register(input)).toEqual({ user: { ...user, createdAt: '2026-10-19T10:00:00.000Z' } });
    expect(hash).toHaveBeenCalledWith(input.password);
    expect(create).toHaveBeenCalledWith({ data: {
      email: input.email, displayName: input.displayName, passwordHash: 'salted hash', storageLimitBytes: 1073741824n,
    }, select: { id: true, email: true, displayName: true, createdAt: true } });
    expect(JSON.stringify(create.mock.calls, (_, value) => typeof value === 'bigint' ? value.toString() : value)).not.toContain(input.password);
  });

  it('maps the database email unique conflict, including an insert race', async () => {
    create.mockRejectedValueOnce(uniqueError());
    await expect(service.register(pipe.transform(valid()))).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', status: 409 });
    await expect(service.register(pipe.transform(valid()))).resolves.toHaveProperty('user');
  });

  it.each([
    { kind: 'UniqueConstraintViolation', table: 'User', constraint: { index: 'User_email_key' } },
    { kind: 'UniqueConstraintViolation', table: 'User', constraint: { fields: ['email'] } },
  ])('handles Prisma 7 adapter-pg structured conflict metadata %#', async (cause) => {
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('private query', {
      code: 'P2002', clientVersion: '7.10.1', meta: { modelName: 'User', driverAdapterError: { cause } },
    }));
    await expect(service.register(pipe.transform(valid()))).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', status: 409 });
  });

  it.each([new Error('private DB query'), uniqueError(['id']), { code: 'P2002', meta: { target: ['email'] } },
    new Prisma.PrismaClientKnownRequestError('private query', { code: 'P2002', clientVersion: '7.10.1',
      meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', table: 'Other', constraint: { fields: ['email'] } } } } }),
  ])
    ('sanitizes other database failures and releases capacity %#', async (error) => {
      create.mockRejectedValueOnce(error);
      await expect(service.register(pipe.transform(valid()))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
      await expect(service.register(pipe.transform(valid()))).resolves.toHaveProperty('user');
    });

  it('does not write when hashing fails and releases capacity', async () => {
    hash.mockRejectedValueOnce(new Error('private password details'));
    await expect(service.register(pipe.transform(valid()))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(create).not.toHaveBeenCalled();
    await expect(service.register(pipe.transform(valid()))).resolves.toHaveProperty('user');
  });

  it('rejects overlapping expensive work without a queue, then permits the next request', async () => {
    let finish!: (value: string) => void;
    hash.mockReturnValueOnce(new Promise<string>((resolve) => { finish = resolve; }));
    const pending = service.register(pipe.transform(valid()));
    await expect(service.register(pipe.transform(valid()))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(hash).toHaveBeenCalledTimes(1);
    finish('salted hash');
    await pending;
    await expect(service.register(pipe.transform(valid()))).resolves.toHaveProperty('user');
  });

  it('controller delegates validated registration without creating a token', async () => {
    const input = pipe.transform(valid());
    const controller = new AuthController(service, {} as SessionService);
    expect(await controller.register(input)).toEqual({ user: { ...user, createdAt: user.createdAt.toISOString() } });
  });
});
