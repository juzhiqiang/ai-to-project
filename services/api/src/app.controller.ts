import { Controller, Get } from '@nestjs/common';
import { APP_NAME } from '@repo/contracts';

@Controller()
export class AppController {
  @Get("/health")
  health() {
    return { ok: true };
  }

  @Get("/hello")
  hello() {
    return { message: `Hello from API, shared APP_NAME=${APP_NAME}` };
  }
}
