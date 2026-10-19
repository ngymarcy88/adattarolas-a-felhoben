import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, RegisterValidationPipe } from './register.dto';
import { RegistrationGuard } from './registration.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RegistrationGuard)
  register(@Body(RegisterValidationPipe) input: RegisterDto) {
    return this.auth.register(input);
  }
}
