import { Inject, Injectable } from '@nestjs/common';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../model.factory';
import {
  runAnalysisGraph,
  type OrchestratorInput,
  type OrchestratorResult,
} from '../graph/requirement-analysis-graph';
import {
  runPlanExecutePipeline,
  type PlanExecutePipelineResult,
} from '../graph/plan-execute-pipeline';
import {
  buildCustomerServiceAgents,
  type CustomerServiceAgents,
  type CustomerServiceAgentModel,
} from './sub-agents';

export type {
  AgentStep,
  CustomerServiceExtraction,
  OrchestratorInput,
  OrchestratorResult,
} from '../graph/requirement-analysis-graph';
export type { PlanExecutePipelineResult } from '../graph/plan-execute-pipeline';

@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) { }

  async orchestrate(request: string | OrchestratorInput): Promise<OrchestratorResult> {
    const { input, policyContext } = normalizeOrchestratorInput(request);
    const model = this.createChatModel();

    return runAnalysisGraph({
      input,
      policyContext,
      agents: this.buildAgents(model),
      model,
    });
  }

  async planAndExecute(request: string | OrchestratorInput): Promise<PlanExecutePipelineResult> {
    const { input, policyContext } = normalizeOrchestratorInput(request);
    const model = this.createChatModel();

    return runPlanExecutePipeline({
      input,
      policyContext,
      agents: this.buildAgents(model),
      model,
      parentThreadId: `pipeline-${Date.now()}`,
    });
  }

  private buildAgents(model: ReturnType<ChatModelFactory>): CustomerServiceAgents {
    return buildCustomerServiceAgents(model as unknown as CustomerServiceAgentModel);
  }
}

function normalizeOrchestratorInput(request: string | OrchestratorInput): Required<OrchestratorInput> {
  if (typeof request === 'string') {
    return { input: request, policyContext: '无相关政策文档' };
  }

  return {
    input: request.input,
    policyContext: request.policyContext?.trim() || '无相关政策文档',
  };
}
