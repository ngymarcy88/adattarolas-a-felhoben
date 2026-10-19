import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';
import { PasswordService } from './password.service';
import { RegisterDto } from './register.dto';

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
  private registrationInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    // Bound expensive scrypt work: one registration per process, no queue.
    if (this.registrationInProgress) throw new ApiError('SERVICE_UNAVAILABLE');
    this.registrationInProgress = true;
    try {
      const passwordHash = await this.passwords.hash(input.password);
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          storageLimitBytes: BigInt(this.config.getOrThrow<AppConfig>('app').defaultUserStorageLimitBytes),
        },
        select: { id: true, email: true, displayName: true, createdAt: true },
      });
      return { user: {
        id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString(),
      } };
    } catch (error) {
      // The unique index is authoritative, including competing requests/processes.
      if (isEmailConflict(error)) {
        throw new ApiError('EMAIL_ALREADY_EXISTS');
      }
      // Do not propagate database messages, query parameters or password data.
      throw new ApiError('SERVICE_UNAVAILABLE');
    } finally {
      this.registrationInProgress = false;
    }
  }
}
