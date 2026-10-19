import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';
import { PasswordService } from './password.service';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';

export interface PublicUser { id: string; email: string; displayName: string; createdAt: string }
const publicSelect = { id: true, email: true, displayName: true, createdAt: true } as const;
// A valid fixed-cost record forces a real scrypt comparison for absent users.
// It is synthetic, not an account credential; absence always fails afterwards.
const DUMMY_HASH = `scrypt$v1$131072$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;
function publicUser(user: { id: string; email: string; displayName: string; createdAt: Date }): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString() };
}

function isEmailConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (Array.isArray(target) && target.length === 1 && target[0] === 'email') return true;
  // Prisma 7's pg adapter preserves its structured driver cause instead of
  // always populating the older meta.target field. Never parse error messages.
  const cause = (error.meta?.driverAdapterError as { cause?: {
    kind?: string; table?: string; constraint?: { index?: string; fields?: string[] };
  } } | undefined)?.cause;
  const fields = cause?.constraint?.fields;
  return cause?.kind === 'UniqueConstraintViolation' &&
    (cause.constraint?.index === 'User_email_key' ||
      ((cause.table === 'User' || error.meta?.modelName === 'User') &&
        Array.isArray(fields) && fields.length === 1 && fields[0] === 'email'));
}

@Injectable()
export class AuthService {
  private credentialOperationInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    // Bound expensive scrypt work: one registration/login per process, no queue.
    if (this.credentialOperationInProgress) throw new ApiError('SERVICE_UNAVAILABLE');
    this.credentialOperationInProgress = true;
    try {
      const passwordHash = await this.passwords.hash(input.password);
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          storageLimitBytes: BigInt(this.config.getOrThrow<AppConfig>('app').defaultUserStorageLimitBytes),
        },
        select: publicSelect,
      });
      return { user: publicUser(user) };
    } catch (error) {
      // The unique index is authoritative, including competing requests/processes.
      if (isEmailConflict(error)) {
        throw new ApiError('EMAIL_ALREADY_EXISTS');
      }
      // Do not propagate database messages, query parameters or password data.
      throw new ApiError('SERVICE_UNAVAILABLE');
    } finally {
      this.credentialOperationInProgress = false;
    }
  }

  async login(input: LoginDto): Promise<{ user: PublicUser }> {
    if (this.credentialOperationInProgress) throw new ApiError('SERVICE_UNAVAILABLE');
    this.credentialOperationInProgress = true;
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: input.email }, select: { ...publicSelect, passwordHash: true },
      });
      const matches = await this.passwords.verify(input.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !matches) throw new ApiError('INVALID_CREDENTIALS');
      return { user: publicUser(user) };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') throw error;
      throw new ApiError('SERVICE_UNAVAILABLE');
    } finally {
      this.credentialOperationInProgress = false;
    }
  }

  async currentUser(id: string): Promise<{ user: PublicUser }> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id }, select: publicSelect });
      if (!user) throw new ApiError('AUTH_REQUIRED');
      return { user: publicUser(user) };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') throw error;
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
  }

}
