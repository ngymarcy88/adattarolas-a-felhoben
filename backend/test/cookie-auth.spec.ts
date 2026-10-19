import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { LoginDto, LoginValidationPipe } from '../src/auth/login.dto';
import { PasswordService } from '../src/auth/password.service';
import { SessionService, AUTH_COOKIE } from '../src/auth/session.service';
import { SessionGuard, AuthenticatedRequest } from '../src/auth/session.guard';
import { OriginGuard } from '../src/auth/origin.guard';
import { RegistrationGuard } from '../src/auth/registration.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const id = '00000000-0000-4000-8000-000000000001';
const settings = { jwtSecret: 'synthetic-test-secret-at-least-32-characters', jwtTtlSeconds: 3600,
  environment: 'local', frontendPublicUrl: 'http://127.0.0.1:5173', defaultUserStorageLimitBytes: 1073741824 };
const config = (values = {}) => ({ getOrThrow: () => ({ ...settings, ...values }) }) as unknown as ConfigService;
const requestContext = (request: object) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;
const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as unknown as Response;
const signed = (claims: object = {}, options: jwt.SignOptions = {}) => jwt.sign({ sub: id, ...claims }, settings.jwtSecret,
  { algorithm: 'HS256', issuer: 'cloudvault', audience: 'cloudvault-api', expiresIn: 3600, ...options });
const cookie = (token: string) => `${AUTH_COOKIE}=${token}`;

describe('LoginValidationPipe', () => {
  const pipe = new LoginValidationPipe();
  const input = { email: ' Test+tag@EXAMPLE.test ', password: '  unchanged password  ' };
  it('reuses registration email normalization without changing the password', () => {
    expect(pipe.transform(input)).toEqual(new LoginDto('test+tag@example.test', input.password));
  });
  it('permits existing short passwords instead of applying registration strength rules', () => {
    expect(pipe.transform({ ...input, password: 'x' }).password).toBe('x');
  });
  it.each([null, [], {}, 'invalid', { ...input, password: '' }, { ...input, password: null },
    { ...input, email: 'invalid' }, { ...input, userId: id }, { ...input, password: 'a'.repeat(1025) },
    { ...input, password: '😀'.repeat(257) }, { ...input, password: 'bad\ud800' }])('rejects malformed input %#', (value) => {
      expect(() => pipe.transform(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR', status: 400 }));
    });
});

describe('SessionService', () => {
  afterEach(() => jest.restoreAllMocks());
  it('issues a verifiable HS256 token only through a host-only HttpOnly cookie', () => {
    const service = new SessionService(config());
    const res = response();
    expect(service.issue(res, id)).toBeUndefined();
    const [name, token, options] = (res.cookie as jest.Mock).mock.calls[0];
    expect(name).toBe(AUTH_COOKIE);
    expect(options).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/api/v1', maxAge: 3600000 });
    const claims = jwt.verify(token, settings.jwtSecret, { algorithms: ['HS256'], issuer: 'cloudvault', audience: 'cloudvault-api' }) as jwt.JwtPayload;
    expect(claims.sub).toBe(id);
    expect(claims.exp! - claims.iat!).toBe(3600);
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
    expect(service.subject(`unrelated=x; ${cookie(token)}; other=y`)).toBe(id);
  });
  it.each(['local', 'production'])('clears with matching attributes and no maxAge override in %s', (environment) => {
    const service = new SessionService(config({ environment, jwtTtlSeconds: 1800 }));
    const res = response();
    service.issue(res, id);
    service.clear(res);
    const issueOptions = (res.cookie as jest.Mock).mock.calls[0][2];
    const { maxAge, ...sameOptions } = issueOptions;
    expect(maxAge).toBe(1800000);
    expect(sameOptions.secure).toBe(environment === 'production');
    expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE, sameOptions);
  });
  it.each([undefined, '', 'unrelated=x', cookie(''), cookie('invalid'), cookie('x'.repeat(4097)),
    'x'.repeat(8193), `${cookie('a')}; ${cookie('b')}`])('rejects absent, malformed, oversized or ambiguous cookies %#', (value) => {
    expect(() => new SessionService(config()).subject(value)).toThrow(expect.objectContaining({ code: 'AUTH_REQUIRED', status: 401 }));
  });
  it.each([
    () => signed({}, { expiresIn: -1 }),
    () => signed({}, { issuer: 'other' }),
    () => signed({}, { audience: 'other' }),
    () => signed({}, { algorithm: 'HS384' }),
    () => jwt.sign({ sub: id, iss: 'cloudvault', aud: 'cloudvault-api' }, settings.jwtSecret),
    () => signed({ sub: 'invalid-uuid' }),
    () => signed({ sub: 123 }),
    () => signed({ iat: Math.floor(Date.now() / 1000) + 100 }),
    () => signed({}, { expiresIn: 86400 }),
    () => signed({}, { notBefore: 100 }),
    () => signed({}, { noTimestamp: true }),
    () => jwt.sign({ sub: id }, 'different-synthetic-secret', { expiresIn: 3600, issuer: 'cloudvault', audience: 'cloudvault-api' }),
    () => jwt.sign({ sub: id }, '', { algorithm: 'none' }),
  ])('rejects invalid signatures, algorithms or required claims %#', (makeToken) => {
    expect(() => new SessionService(config()).subject(cookie(makeToken())))
      .toThrow(expect.objectContaining({ code: 'AUTH_REQUIRED', status: 401 }));
  });
  it('rejects a token exactly at expiry', () => {
    const token = signed();
    const claims = jwt.decode(token) as jwt.JwtPayload;
    jest.spyOn(Date, 'now').mockReturnValue(claims.exp! * 1000);
    expect(() => new SessionService(config()).subject(cookie(token))).toThrow(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
  });
  it('sanitizes signing failures and does not set a cookie', () => {
    jest.spyOn(jwt, 'sign').mockImplementation(() => { throw new Error('private JWT secret'); });
    const res = response();
    expect(() => new SessionService(config()).issue(res, id)).toThrow(expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }));
    expect(res.cookie).not.toHaveBeenCalled();
  });
});

describe('AuthService login/current user', () => {
  const storedUser = { id, email: 'test@example.test', displayName: 'Test', createdAt: new Date('2026-10-19T10:00:00Z'), passwordHash: 'stored hash' };
  const publicUser = { id, email: storedUser.email, displayName: 'Test', createdAt: storedUser.createdAt.toISOString() };
  const input = new LoginDto(storedUser.email, 'synthetic passphrase');
  let lookup: jest.Mock;
  let verify: jest.Mock;
  let hash: jest.Mock;
  let service: AuthService;
  beforeEach(() => {
    lookup = jest.fn().mockResolvedValue(storedUser);
    verify = jest.fn().mockResolvedValue(true);
    hash = jest.fn().mockResolvedValue('hash');
    service = new AuthService({ user: { findUnique: lookup, create: jest.fn().mockResolvedValue(storedUser) } } as unknown as PrismaService,
      { verify, hash } as unknown as PasswordService, config());
  });
  it('checks the stored hash and returns only a public user', async () => {
    expect(await service.login(input)).toEqual({ user: publicUser });
    expect(lookup).toHaveBeenCalledWith({ where: { email: input.email }, select: {
      id: true, email: true, displayName: true, createdAt: true, passwordHash: true,
    } });
    expect(verify).toHaveBeenCalledWith(input.password, 'stored hash');
  });
  it('uses the same failure for unknown email and wrong password, with a dummy KDF comparison', async () => {
    verify.mockResolvedValue(false);
    await expect(service.login(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    lookup.mockResolvedValue(null);
    // Even an unexpected true result from the dummy comparison cannot authenticate an absent user.
    verify.mockResolvedValue(true);
    await expect(service.login(input)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    expect(verify).toHaveBeenLastCalledWith(input.password, expect.stringMatching(/^scrypt\$v1\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/));
  });
  it.each(['lookup', 'verify'])('sanitizes %s failures and releases expensive-work capacity', async (dependency) => {
    (dependency === 'lookup' ? lookup : verify).mockRejectedValueOnce(new Error('private credential details'));
    await expect(service.login(input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    await expect(service.login(input)).resolves.toEqual({ user: publicUser });
  });
  it('shares the expensive-work limit across login and registration without a queue', async () => {
    let finish!: (result: boolean) => void;
    verify.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const first = service.login(input);
    await Promise.resolve();
    await expect(service.login(input)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(service.register({ ...input, displayName: 'Test' })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(hash).not.toHaveBeenCalled();
    finish(false);
    await expect(first).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(service.login(input)).resolves.toEqual({ user: publicUser });
  });
  it('fetches current user from the database with a public select', async () => {
    expect(await service.currentUser(id)).toEqual({ user: publicUser });
    expect(lookup).toHaveBeenCalledWith({ where: { id }, select: { id: true, email: true, displayName: true, createdAt: true } });
  });
  it('rejects a valid token whose user no longer exists', async () => {
    lookup.mockResolvedValue(null);
    await expect(service.currentUser(id)).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });
  it('distinguishes database outage from invalid authentication without leaking details', async () => {
    lookup.mockRejectedValue(new Error('private query'));
    await expect(service.currentUser(id)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  });
  it('controller sets a cookie only after successful login and keeps tokens out of JSON', async () => {
    const sessions = new SessionService(config());
    const controller = new AuthController(service, sessions);
    const res = response();
    expect(await controller.login(input, res)).toEqual({ user: publicUser });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    verify.mockResolvedValue(false);
    await expect(controller.login(input, res)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(controller.logout(res)).toBeUndefined();
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(controller.me({ user: publicUser } as AuthenticatedRequest)).toEqual({ user: publicUser });
  });
});

describe('Auth guards', () => {
  it('requires only an exact allowed Origin for idempotent logout, even without a cookie', () => {
    const guard = new OriginGuard(config());
    expect(guard.canActivate(requestContext({ headers: { origin: settings.frontendPublicUrl } }))).toBe(true);
    expect(() => guard.canActivate(requestContext({ headers: {} }))).toThrow(expect.objectContaining({ code: 'ORIGIN_NOT_ALLOWED' }));
    expect(() => guard.canActivate(requestContext({ headers: { origin: 'null' } }))).toThrow(expect.objectContaining({ code: 'ORIGIN_NOT_ALLOWED' }));
  });
  it('shares the existing attempt policy for registration and login and ignores forwarded identities', () => {
    const guard = new RegistrationGuard(config());
    const ctx = requestContext({ headers: { origin: settings.frontendPublicUrl }, socket: { remoteAddress: 'peer' } });
    for (let i = 0; i < 5; i++) expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
  });
  it('attaches the current public user only after verification and database lookup', async () => {
    const token = signed();
    const user = { id, email: 'test@example.test', displayName: 'Test', createdAt: new Date().toISOString() };
    const currentUser = jest.fn().mockResolvedValue({ user });
    const guard = new SessionGuard(new SessionService(config()), { currentUser } as unknown as AuthService);
    const request = { headers: { cookie: cookie(token) } } as AuthenticatedRequest;
    expect(await guard.canActivate(requestContext(request))).toBe(true);
    expect(currentUser).toHaveBeenCalledWith(id);
    expect(request.user).toEqual(user);
  });
  it('does not query a user for an absent cookie or a bearer token', async () => {
    const currentUser = jest.fn();
    const guard = new SessionGuard(new SessionService(config()), { currentUser } as unknown as AuthService);
    await expect(guard.canActivate(requestContext({ headers: { authorization: `Bearer ${signed()}` } })))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(currentUser).not.toHaveBeenCalled();
  });
});
