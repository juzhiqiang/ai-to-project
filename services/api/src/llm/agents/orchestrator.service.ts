import { Inject, Injectable } from '@nestjs/common';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../model.factory';
import {
  buildCustomerServiceAgents,
  type CustomerServiceAgentName,
  type CustomerServiceAgents,
  type CustomerServiceAgentModel,
} from './sub-agents';

const REQUIRED_EXTRACTION_FIELDS = ['orderId', 'requestType', 'receivedDate', 'isUnopened'] as const;

export interface CustomerServiceExtraction {
  orderId?: string | null;
  productId?: string | null;
  requestType?: string | null;
  receivedDate?: string | null;
  isUnopened?: boolean | null;
}

export interface AgentStep {
  agent: CustomerServiceAgentName;
  output: string;
}

export interface OrchestratorResult {
  mode: 'completed' | 'clarification' | 'fallback';
  clarificationQuestions: string[];
  usedAgents: CustomerServiceAgentName[];
  fallback: 'manual_review' | null;
  steps: AgentStep[];
  report: string;
}

@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) { }

  async orchestrate(input: string): Promise<OrchestratorResult> {
    const steps: AgentStep[] = [];

    try {
      const agents = this.buildAgents();
      const extractionOutput = await agents.extractAgent.invoke({ input });
      const extraction = parseExtraction(extractionOutput);
      steps.push({ agent: 'extractAgent', output: extractionOutput });

      const clarificationQuestions = buildClarificationQuestions(extraction);

      if (clarificationQuestions.length > 0) {
        return {
          mode: 'clarification',
          clarificationQuestions,
          usedAgents: steps.map((step) => step.agent),
          fallback: null,
          steps,
          report: '',
        };
      }

      const extractionText = JSON.stringify(extraction);
      const [policyCheck, riskReview] = await Promise.all([
        agents.policyCheckAgent.invoke({ extraction: extractionText }),
        agents.riskReviewAgent.invoke({ input, extraction: extractionText }),
      ]);
      steps.push(
        { agent: 'policyCheckAgent', output: policyCheck },
        { agent: 'riskReviewAgent', output: riskReview },
      );

      const qa = await agents.qaAgent.invoke({
        extraction: extractionText,
        policyCheck,
        riskReview,
      });
      steps.push({ agent: 'qaAgent', output: qa });

      const report = await agents.summaryAgent.invoke({
        input,
        extraction: extractionText,
        policyCheck,
        riskReview,
        qa,
      });
      steps.push({ agent: 'summaryAgent', output: report });

      return {
        mode: 'completed',
        clarificationQuestions: [],
        usedAgents: steps.map((step) => step.agent),
        fallback: null,
        steps,
        report,
      };
    } catch {
      return {
        mode: 'fallback',
        clarificationQuestions: [],
        usedAgents: steps.map((step) => step.agent),
        fallback: 'manual_review',
        steps,
        report: '',
      };
    }
  }

  private buildAgents(): CustomerServiceAgents {
    return buildCustomerServiceAgents(this.createChatModel() as unknown as CustomerServiceAgentModel);
  }
}

function parseExtraction(output: string): CustomerServiceExtraction {
  const jsonText = stripJsonFence(output);
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error('extractAgent output must be a JSON object');
  }

  return parsed as CustomerServiceExtraction;
}

function stripJsonFence(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced ? fenced[1].trim() : trimmed;
}

function buildClarificationQuestions(extraction: CustomerServiceExtraction) {
  return REQUIRED_EXTRACTION_FIELDS.flatMap((field) => {
    if (hasExtractionValue(extraction[field])) {
      return [];
    }

    return [questionForField(field)];
  });
}

function hasExtractionValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function questionForField(field: (typeof REQUIRED_EXTRACTION_FIELDS)[number]) {
  const questions = {
    orderId: '请提供订单号。',
    requestType: '请说明诉求类型，例如退货、退款或换货。',
    receivedDate: '请说明收货日期或签收时间。',
    isUnopened: '请确认商品是否未拆封。',
  };

  return questions[field];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
