import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(protected readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.origin !== this.config.getOrThrow<AppConfig>('app').frontendPublicUrl) {
      throw new ApiError('ORIGIN_NOT_ALLOWED');
    }
    return true;
  }
}
