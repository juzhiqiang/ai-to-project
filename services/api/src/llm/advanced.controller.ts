import { Body, Controller, Post } from '@nestjs/common';
import { AdvancedAnalysisService } from './advanced-analysis.service';

interface AnalyzeDto {
  sessionId: string;
  input: string;
}

@Controller('api/advanced')
export class AdvancedController {
  constructor(private readonly advancedAnalysisService: AdvancedAnalysisService) {}

  @Post('analyze')
  analyze(@Body() body: AnalyzeDto) {
    return this.advancedAnalysisService.analyze(body.sessionId, body.input);
  }
}
