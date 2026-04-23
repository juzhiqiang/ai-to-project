import { Controller, Get } from '@nestjs/common';
import { HealthResponse, HelloResponse } from '@repo/contracts';

@Controller()
export class AppController {
  @Get('health')
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('hello')
  getHello(): HelloResponse {
    return {
      message: 'Hello from NestJS API!',
    };
  }
}
