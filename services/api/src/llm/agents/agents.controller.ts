import { Body, Controller, Post } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

interface OrchestrateDto {
  input: string;
}

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post('orchestrate')
  orchestrate(@Body() body: OrchestrateDto) {
    return this.orchestratorService.orchestrate(body.input);
  }

  @Post('plan-execute')
  planAndExecute(@Body() body: OrchestrateDto) {
    return this.orchestratorService.planAndExecute(body.input);
  }
}
