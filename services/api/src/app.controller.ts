import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { APP_NAME } from '@repo/contracts';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get("/health")
  health() {
    return { ok: true };
  }
  @Get("/hello")
  hello() {
    return { message: `Hello from API, shared APP_NAME=${APP_NAME}` };
  }
}

