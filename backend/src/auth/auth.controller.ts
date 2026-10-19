import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { LoginDto, LoginValidationPipe } from './login.dto';
import { OriginGuard } from './origin.guard';
import { SessionService } from './session.service';
import { SessionGuard, type AuthenticatedRequest } from './session.guard';
import { AuthService } from './auth.service';
import { RegisterDto, RegisterValidationPipe } from './register.dto';
import { RegistrationGuard } from './registration.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RegistrationGuard)
  register(@Body(RegisterValidationPipe) input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(RegistrationGuard)
  async login(@Body(LoginValidationPipe) input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(input);
    this.sessions.issue(response, result.user.id);
    return result;
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(OriginGuard)
  logout(@Res({ passthrough: true }) response: Response): void {
    // Clear even expired/missing credentials; no server-side JWT revocation.
    this.sessions.clear(response);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

}
