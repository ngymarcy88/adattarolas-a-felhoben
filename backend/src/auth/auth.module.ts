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
  providers: [AuthService, PasswordService, RegisterValidationPipe, RegistrationGuard],
})
export class AuthModule {}
