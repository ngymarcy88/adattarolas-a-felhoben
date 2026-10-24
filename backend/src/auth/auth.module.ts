import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';
import { OriginGuard } from './origin.guard';
import { LoginValidationPipe } from './login.dto';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RegisterValidationPipe } from './register.dto';
import { RegistrationGuard } from './registration.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  exports: [SessionGuard, OriginGuard, SessionService, AuthService],
  providers: [AuthService, PasswordService, RegisterValidationPipe, RegistrationGuard, SessionService, SessionGuard, OriginGuard, LoginValidationPipe],
})
export class AuthModule {}
