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

export interface OrchestratorInput {
  input: string;
  policyContext?: string;
}

@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(CHAT_MODEL_FACTORY)
    private readonly createChatModel: ChatModelFactory,
  ) { }

  async orchestrate(request: string | OrchestratorInput): Promise<OrchestratorResult> {
    const steps: AgentStep[] = [];
    const { input, policyContext } = normalizeOrchestratorInput(request);

    try {
      const agents = this.buildAgents();
      const extractionOutput = await agents.extractAgent.invoke({ input });
      const extraction = completeExtraction(parseExtraction(extractionOutput), input);
      steps.push({ agent: 'extractAgent', output: JSON.stringify(extraction) });

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
        agents.policyCheckAgent.invoke({ extraction: extractionText, policyContext }),
        agents.riskReviewAgent.invoke({ input, extraction: extractionText, policyContext }),
      ]);
      steps.push(
        { agent: 'policyCheckAgent', output: policyCheck },
        { agent: 'riskReviewAgent', output: riskReview },
      );

      const qa = await agents.qaAgent.invoke({
        extraction: extractionText,
        policyContext,
        policyCheck,
        riskReview,
      });
      steps.push({ agent: 'qaAgent', output: qa });

      const report = await agents.summaryAgent.invoke({
        input,
        extraction: extractionText,
        policyContext,
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

function normalizeOrchestratorInput(request: string | OrchestratorInput): Required<OrchestratorInput> {
  if (typeof request === 'string') {
    return { input: request, policyContext: '无相关政策文档' };
  }

  return {
    input: request.input,
    policyContext: request.policyContext?.trim() || '无相关政策文档',
  };
}

function parseExtraction(output: string): CustomerServiceExtraction {
  const jsonText = stripJsonFence(output);
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error('extractAgent output must be a JSON object');
  }

  return parsed as CustomerServiceExtraction;
}

function completeExtraction(extraction: CustomerServiceExtraction, input: string): CustomerServiceExtraction {
  return {
    ...extraction,
    requestType: hasExtractionValue(extraction.requestType) ? extraction.requestType : inferRequestType(input),
    receivedDate: hasExtractionValue(extraction.receivedDate) ? extraction.receivedDate : inferReceivedDate(input),
    isUnopened: hasExtractionValue(extraction.isUnopened) ? extraction.isUnopened : inferIsUnopened(input),
  };
}

function inferRequestType(input: string) {
  if (/(退货|退掉|退回|能不能退|可以退)/.test(input)) {
    return 'return';
  }

  if (/(退款|退钱)/.test(input)) {
    return 'refund';
  }

  if (/(换货|更换|换一个)/.test(input)) {
    return 'exchange';
  }

  return null;
}

function inferReceivedDate(input: string) {
  const relativeBeforeVerb = input.match(/(今天|昨天|前天|刚刚|刚|当天).{0,12}(收到|签收|收货)/);
  const verbBeforeRelative = input.match(/(收到|签收|收货).{0,12}(今天|昨天|前天|刚刚|刚|当天)/);
  const absoluteDate = input.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|\d{1,2}月\d{1,2}日)/);

  return relativeBeforeVerb?.[1] ?? verbBeforeRelative?.[2] ?? absoluteDate?.[1] ?? null;
}

function inferIsUnopened(input: string) {
  if (/(没拆封|未拆封|没有拆封|还没拆|全新未拆)/.test(input)) {
    return true;
  }

  if (/(已拆封|拆开了|拆过|使用过|用过)/.test(input)) {
    return false;
  }

  return null;
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
