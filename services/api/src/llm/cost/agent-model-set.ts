// 10.7 节：按角色默认 + 运行时覆盖的模型分级
// 本文件只负责"声明 + 决策"，不涉及 DB 访问或真实模型调用

export type AgentName =
  | 'supervisor'
  | 'functional_expert'
  | 'performance_expert'
  | 'security_expert'
  | 'compliance_expert'
  | 'risk_agent'
  | 'summary_agent'
  | 'critic'
  | 'compressor';

export interface AgentModelSet {
  supervisorModelConfigId: string;
  functionalModelConfigId: string;
  performanceModelConfigId: string;
  securityModelConfigId: string;
  complianceModelConfigId: string;
  riskModelConfigId: string;
  summaryModelConfigId: string;
  criticModelConfigId: string;
  compressorModelConfigId: string;
}

// 高风险角色：错误会影响全局或法律敏感性，预算紧张时不允许降级
export const HIGH_RISK_AGENTS: AgentName[] = [
  'supervisor',
  'security_expert',
  'compliance_expert',
  'summary_agent',
  'critic',
];

// 将 AgentName 映射到 AgentModelSet 的字段名
export const AGENT_TO_CONFIG_KEY: Record<AgentName, keyof AgentModelSet> = {
  supervisor: 'supervisorModelConfigId',
  functional_expert: 'functionalModelConfigId',
  performance_expert: 'performanceModelConfigId',
  security_expert: 'securityModelConfigId',
  compliance_expert: 'complianceModelConfigId',
  risk_agent: 'riskModelConfigId',
  summary_agent: 'summaryModelConfigId',
  critic: 'criticModelConfigId',
  compressor: 'compressorModelConfigId',
};

// 默认模型配置：由数据库 seed 脚本预置
export const DEFAULT_AGENT_MODEL_SET: AgentModelSet = {
  supervisorModelConfigId: 'demo-gpt-4o',
  functionalModelConfigId: 'demo-gpt-4o-mini',
  performanceModelConfigId: 'demo-gpt-4o-mini',
  securityModelConfigId: 'demo-gpt-4o',
  complianceModelConfigId: 'demo-gpt-4o',
  riskModelConfigId: 'demo-gpt-4o-mini',
  summaryModelConfigId: 'demo-gpt-4o',
  criticModelConfigId: 'demo-gpt-4o',
  compressorModelConfigId: 'demo-deepseek-chat',
};

export interface ResolveModelInput {
  agentName: AgentName;
  defaultModelSet?: Partial<AgentModelSet>;
  requirementComplexity?: 'low' | 'medium' | 'high';
  budgetStatus?: { usedPercent: number };
}

export interface ResolveModelResult {
  selectedModelConfigId: string;
  overrideReason: string | null;
}

/**
 * 决策顺序（严格按此顺序）：
 * 1. budgetPercent >= 100 且 agentName === 'compressor'：返回默认 modelConfigId、reason=null（compressor 豁免）
 * 2. budgetPercent >= 100 其余 agent：返回默认 modelConfigId、reason='budget_exceeded_reject'
 * 3. budgetPercent ∈ [80,100) 且非高风险：返回 modelSet.compressorModelConfigId、reason=`budget_tight_downgrade (X%)`
 * 4. requirementComplexity === 'low' 且非高风险：返回 modelSet.compressorModelConfigId、reason='low_complexity_downgrade'
 * 5. 否则：返回默认 modelConfigId、reason=null
 */
export function resolveModelForAgent(input: ResolveModelInput): ResolveModelResult {
  const {
    agentName,
    defaultModelSet = {},
    requirementComplexity = 'medium',
    budgetStatus = { usedPercent: 0 },
  } = input;

  const modelSet: AgentModelSet = { ...DEFAULT_AGENT_MODEL_SET, ...defaultModelSet };
  const configKey = AGENT_TO_CONFIG_KEY[agentName];
  const defaultModelConfigId = modelSet[configKey];
  const budgetPercent = budgetStatus.usedPercent;
  const isHighRisk = HIGH_RISK_AGENTS.includes(agentName);

  // 1. 预算超支且 compressor：豁免，返回默认，reason=null
  if (budgetPercent >= 100 && agentName === 'compressor') {
    return { selectedModelConfigId: defaultModelConfigId, overrideReason: null };
  }

  // 2. 预算超支（其余 agent）：拒绝降级
  if (budgetPercent >= 100) {
    return {
      selectedModelConfigId: defaultModelConfigId,
      overrideReason: 'budget_exceeded_reject',
    };
  }

  // 3. 预算紧张 [80,100) 且非高风险：降级到 compressor
  if (budgetPercent >= 80 && budgetPercent < 100 && !isHighRisk) {
    return {
      selectedModelConfigId: modelSet.compressorModelConfigId,
      overrideReason: `budget_tight_downgrade (${budgetPercent}%)`,
    };
  }

  // 4. 低复杂度且非高风险：降级到 compressor
  if (requirementComplexity === 'low' && !isHighRisk) {
    return {
      selectedModelConfigId: modelSet.compressorModelConfigId,
      overrideReason: 'low_complexity_downgrade',
    };
  }

  // 5. 默认：使用角色对应的默认模型
  return { selectedModelConfigId: defaultModelConfigId, overrideReason: null };
}
