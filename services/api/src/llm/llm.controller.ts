import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LlmService, type BatchLlmDto, type InvokeLlmDto } from './llm.service';

@Controller('api/langchain')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('invoke')
  invoke(@Body() body: InvokeLlmDto) {
    return this.llmService.invoke(body);
  }

  @Post('stream')
  stream(@Body() body: InvokeLlmDto, @Res() response: Response) {
    return this.llmService.stream(body, response);
  }

  @Post('batch')
  batch(@Body() body: BatchLlmDto) {
    return this.llmService.batch(body);
  }
}
