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
import type { AIUIResponse, UIResponse } from '../ui-protocol/ui-schemas';
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

type UiExpertName = NonNullable<OrchestratorResult['activeExperts']>[number];

const EXPERT_RESULT_FIELD: Record<UiExpertName, keyof OrchestratorResult> = {
  functional: 'functionalAnalysis',
  performance: 'performanceAnalysis',
  security: 'securityAnalysis',
  compliance: 'complianceAnalysis',
};

export interface ToUIResponseOptions {
  interrupted?: boolean;
}

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

export function toUIResponse(
  result: OrchestratorResult,
  options: ToUIResponseOptions = {},
): AIUIResponse {
  const components: UIResponse[] = [
    {
      type: 'text',
      id: 'orchestrator-report',
      content: result.report || result.errorMessage || '暂无分析报告。',
    },
    buildExpertSteps(result),
  ];

  if (options.interrupted) {
    components.unshift({
      type: 'confirmation',
      id: 'human-in-the-loop-confirmation',
      title: '需要人工确认',
      summary: [
        '当前 Multi-Agent 流程已暂停。',
        '确认后继续执行；取消后保留当前分析结果供人工处理。',
      ],
      confirmLabel: '继续执行',
      cancelLabel: '转人工处理',
      action: {
        type: 'confirmation',
        componentType: 'confirmation',
        componentId: 'human-in-the-loop-confirmation',
        payload: true,
      },
    });
  }

  return {
    message: result.mode === 'fallback' ? '分析已降级到人工处理。' : '分析流程状态已更新。',
    components,
  };
}

function buildExpertSteps(result: OrchestratorResult): UIResponse {
  const activeExperts = (result.activeExperts?.length ? result.activeExperts : ['functional']) as UiExpertName[];
  const baseSteps = [
    { label: 'triage', status: 'completed' as const },
    { label: 'extract', status: stepStatus(Boolean(result.steps.find((step) => step.agent === 'extractAgent'))) },
  ];
  const expertSteps = activeExperts.map((expert) => ({
    label: `${expert}_expert`,
    status: expertStatus(result, expert),
  }));
  const summaryDone = Boolean(result.report);
  const steps = [
    ...baseSteps,
    ...expertSteps,
    { label: 'summary', status: stepStatus(summaryDone) },
  ];

  return {
    type: 'steps',
    id: 'multi-agent-production-steps',
    current: Math.max(0, steps.findIndex((step) => step.status === 'running')),
    steps,
  };
}

function expertStatus(result: OrchestratorResult, expert: UiExpertName) {
  const field = EXPERT_RESULT_FIELD[expert];
  const output = result[field];

  if (typeof output === 'string' && output.trim()) {
    return 'completed' as const;
  }

  return 'running' as const;
}

function stepStatus(done: boolean) {
  return done ? 'completed' as const : 'pending' as const;
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
