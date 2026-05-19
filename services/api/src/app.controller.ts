import { Body, Controller, Get, Post } from '@nestjs/common';
import { APP_NAME } from '@repo/contracts';
import { RequirementService } from './llm/requirement.service';

interface RequirementExtractDto {
  input: string;
}

@Controller()
export class AppController {
  constructor(private readonly requirementService: RequirementService) { }

  @Get("/health")
  health() {
    return { ok: true };
  }

  @Get("/hello")
  hello() {
    return { message: `Hello from API, shared APP_NAME=${APP_NAME}` };
  }

  @Post('/requirement/extract')
  extractRequirement(@Body() body: RequirementExtractDto) {
    return this.requirementService.extract(body.input);
  }
}
