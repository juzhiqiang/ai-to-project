import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, type LoginDto } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }
}
