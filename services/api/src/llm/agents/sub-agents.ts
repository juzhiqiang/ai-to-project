import type { BaseMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { ChatPromptValueInterface } from '@langchain/core/prompt_values';
import type { Runnable, RunnableLike } from '@langchain/core/runnables';

export const CUSTOMER_SERVICE_AGENT_NAMES = [
  'extractAgent',
  'policyCheckAgent',
  'riskReviewAgent',
  'qaAgent',
  'summaryAgent',
] as const;

export type CustomerServiceAgentName = (typeof CUSTOMER_SERVICE_AGENT_NAMES)[number];
export type CustomerServiceAgentModel = RunnableLike<ChatPromptValueInterface, string | BaseMessage>;

export interface ExtractAgentInput {
  input: string;
}

export interface PolicyCheckAgentInput {
  extraction: string;
  policyContext: string;
}

export interface RiskReviewAgentInput {
  input: string;
  extraction: string;
  policyContext: string;
}

export interface QaAgentInput {
  extraction: string;
  policyContext: string;
  policyCheck: string;
  riskReview: string;
}

export interface SummaryAgentInput {
  input: string;
  extraction: string;
  policyContext: string;
  policyCheck: string;
  riskReview: string;
  qa: string;
}

export interface CustomerServiceAgents {
  extractAgent: Runnable<ExtractAgentInput, string>;
  policyCheckAgent: Runnable<PolicyCheckAgentInput, string>;
  riskReviewAgent: Runnable<RiskReviewAgentInput, string>;
  qaAgent: Runnable<QaAgentInput, string>;
  summaryAgent: Runnable<SummaryAgentInput, string>;
}

export function buildCustomerServiceAgents(model: CustomerServiceAgentModel): CustomerServiceAgents {
  return {
    extractAgent: buildAgent<ExtractAgentInput>(
      [
        `你是需求抽取专家。从电商客服对话中提取以下字段并输出 JSON：
        - orderId: 订单号
        - productId: 商品 ID（如 headphone-x1）
        - requestType: 退货 | 换货 | 退款
        - receivedDate: 收货日期或相对签收时间（如 YYYY-MM-DD、昨天、今天）
        - isUnopened: 是否未拆封（true/false）
        如果某字段在对话中未提及，设为 null。`,
      ].join('\n'),
      '{input}',
      model,
    ),
    policyCheckAgent: buildAgent<PolicyCheckAgentInput>(
      [
        '你是 policyCheckAgent，专门根据上传的政策文档判断退货与退款条件。',
        '必须优先使用「参考政策文档」中的条款；如果没有参考文档，再说明只能按默认规则初判。',
      ].join('\n'),
      ['参考政策文档：', '{policyContext}', '抽取结果：{extraction}'].join('\n'),
      model,
    ),
    riskReviewAgent: buildAgent<RiskReviewAgentInput>(
      [
        '你是 riskReviewAgent，专门识别客服退货咨询中的歧义、冲突或缺失信息。',
        '请列出风险点；如果没有明显风险，也要明确说明低风险。',
      ].join('\n'),
      ['参考政策文档：', '{policyContext}', '客服对话：{input}', '抽取结果：{extraction}'].join('\n'),
      model,
    ),
    qaAgent: buildAgent<QaAgentInput>(
      [
        '你是 qaAgent，专门根据抽取、政策校验和风控结果生成验收条件。',
        '必须使用 Given-When-Then 格式，至少输出一条可验证的条件。',
      ].join('\n'),
      ['参考政策文档：', '{policyContext}', '抽取结果：{extraction}', '政策校验：{policyCheck}', '风控结果：{riskReview}'].join('\n'),
      model,
    ),
    summaryAgent: buildAgent<SummaryAgentInput>(
      [
        '你是 summaryAgent，专门汇总所有 Agent 输出，生成最终退货判断报告。',
        '报告应包含订单摘要、政策判断、风险点、验收条件和最终建议。',
      ].join('\n'),
      [
        '参考政策文档：',
        '{policyContext}',
        '客服对话：{input}',
        '抽取结果：{extraction}',
        '政策校验：{policyCheck}',
        '风控结果：{riskReview}',
        '验收条件：{qa}',
      ].join('\n'),
      model,
    ),
  };
}

function buildAgent<Input extends object>(
  systemPrompt: string,
  humanPrompt: string,
  model: CustomerServiceAgentModel,
): Runnable<Input, string> {
  return ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', humanPrompt],
  ])
    .pipe(model)
    .pipe(new StringOutputParser()) as Runnable<Input, string>;
}
