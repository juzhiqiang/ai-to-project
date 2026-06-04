import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdvancedAnalysisService } from './advanced-analysis.service';
import { UserIdGuard } from '../auth/user-id.guard';
import { CurrentUser } from '../auth/current-user.decorator';

interface AnalyzeDto {
  conversationId: string;
  input: string;
}

@UseGuards(UserIdGuard)
@Controller('api/advanced')
export class AdvancedController {
  constructor(private readonly advancedAnalysisService: AdvancedAnalysisService) {}

  @Post('analyze')
  analyze(@CurrentUser() userId: string, @Body() body: AnalyzeDto) {
    return this.advancedAnalysisService.analyze(userId, body.conversationId, body.input);
  }
}
