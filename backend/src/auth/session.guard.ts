import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type PublicUser } from './auth.service';
import { SessionService } from './session.service';

export interface AuthenticatedRequest extends Request { user: PublicUser }

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const subject = this.sessions.subject(request.headers.cookie);
    request.user = (await this.auth.currentUser(subject)).user;
    return true;
  }
}
