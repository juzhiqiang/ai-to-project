// 10.9 节：预算阈值 + 自动降级 + 拒绝的运行时策略
// 本文件是纯函数模块，无副作用，无 IO

import { HIGH_RISK_AGENTS, type AgentName } from './agent-model-set';

export type BudgetAction = 'allow' | 'downgrade' | 'reject';

export interface BudgetPolicyInput {
  budgetUsedPercent: number;
  agentName: string;
  requirementRiskLevel?: 'low' | 'medium' | 'high';
}

export interface BudgetPolicyResult {
  action: BudgetAction;
  reason: string;
}

/**
 * 决策顺序（严格按此顺序）：
 * 1. budgetUsedPercent < 80：action=allow
 * 2. budgetUsedPercent ∈ [80, 100)：
 *    - agent ∈ HIGH_RISK_AGENTS → allow
 *    - 否则 → downgrade
 * 3. budgetUsedPercent >= 100：
 *    - agent === 'compressor' → allow（豁免）
 *    - 否则 → reject
 */
export function resolveBudgetAction(input: BudgetPolicyInput): BudgetPolicyResult {
  const { budgetUsedPercent, agentName } = input;
  const percent = Math.round(budgetUsedPercent);

  // 1. 预算 < 80%：允许执行
  if (budgetUsedPercent < 80) {
    return {
      action: 'allow',
      reason: `budget OK (${percent}%)`,
    };
  }

  // 2. 预算 [80, 100)：
  if (budgetUsedPercent >= 80 && budgetUsedPercent < 100) {
    // 高风险角色不允许降级
    if (HIGH_RISK_AGENTS.includes(agentName as AgentName)) {
      return {
        action: 'allow',
        reason: `high-risk agent, no downgrade (${percent}%)`,
      };
    }
    // 非高风险角色可以降级
    return {
      action: 'downgrade',
      reason: `budget tight, low-risk agent can downgrade (${percent}%)`,
    };
  }

  // 3. 预算 >= 100%：
  // compressor 永远允许（省钱工具，豁免）
  if (agentName === 'compressor') {
    return {
      action: 'allow',
      reason: 'compressor allowed even over budget (cost reduction purpose)',
    };
  }

  // 其余角色拒绝执行
  return {
    action: 'reject',
    reason: `budget exceeded (${percent}%)`,
  };
}
