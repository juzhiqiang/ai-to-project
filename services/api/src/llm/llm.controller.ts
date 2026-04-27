import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  LlmService,
  type BatchLlmDto,
  type InvokeLlmDto,
  type RequirementChainBatchDto,
  type RequirementPromptDto,
} from './llm.service';

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

  @Post('prompt-preview')
  promptPreview(@Body() body: RequirementPromptDto) {
    return this.llmService.promptPreview(body);
  }

  @Post('prompt-to-model')
  promptToModel(@Body() body: RequirementPromptDto) {
    return this.llmService.promptToModel(body);
  }

  @Post('chain-invoke')
  chainInvoke(@Body() body: RequirementPromptDto) {
    return this.llmService.chainInvoke(body);
  }

  @Post('chain-stream')
  chainStream(@Body() body: RequirementPromptDto, @Res() response: Response) {
    return this.llmService.chainStream(body, response);
  }

  @Post('chain-batch')
  chainBatch(@Body() body: RequirementChainBatchDto) {
    return this.llmService.chainBatch(body);
  }
}
