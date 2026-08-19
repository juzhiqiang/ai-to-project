import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  resolveBudgetAction,
  type BudgetPolicyInput,
  type BudgetPolicyResult,
} from '../../src/llm/cost/budget-policy';
import type { RagAnswer } from '../pipeline/rag-pipeline';

/**
 * 9.6 / 11.10 —— 把 RAG 能力包装成 LangChain Tool。
 *
 * 关键设计（与任务约束一致）：
 * 1. 预算检查放在最前面：先 resolveBudgetAction，reject 直接返回 { error: 'budget_exceeded' }，
 *    避免先调用昂贵的 ragAsk 后才发现超预算。
 * 2. LangChain 工具返回必须是 string，所以用 JSON.stringify 序列化。
 * 3. description 写明"适用 / 不适用"场景，让 LLM 能据此判断该不该调。
 * 4. deps 注入 ragAsk / resolveBudgetAction，保持工具本身可单测。
 */

const RAG_TOOL_DESCRIPTION = [
  '知识库检索工具（RAG）。',
  '适用：用户询问产品文档、退货政策、客服流程、帮助中心等需要查阅知识库才能回答的问题。',
  '不适用：闲聊、寒暄、通用常识、与业务文档无关的开放性问题，以及用户没有明确信息检索意图的场景。',
  '调用时请提供清晰的 question（要检索的问题），可选 topK（返回文档数量）。',
].join('\n');

/** createRagTool 依赖注入接口。 */
export interface RagToolDeps {
  /** 真正执行 RAG 检索（+可选生成）的函数。 */
  ragAsk: (question: string, topK?: number) => Promise<RagAnswer>;
  /** 预算检查入参；决定工具是否被允许执行。 */
  budgetInput: BudgetPolicyInput;
  /** 可选：覆盖默认的预算决策函数（测试时 mock）。 */
  resolveBudgetAction?: (input: BudgetPolicyInput) => BudgetPolicyResult;
}

/** 预算检查被拒绝时的返回体。 */
export interface BudgetExceededResult {
  error: 'budget_exceeded';
  reason: string;
}

/**
 * 创建 RAG 知识库检索工具。
 *
 * @returns StructuredTool，可直接加入 Functional Expert 等工具池。
 */
export function createRagTool(deps: RagToolDeps) {
  const decide = deps.resolveBudgetAction ?? resolveBudgetAction;

  return tool(
    async ({ question, topK }: { question: string; topK?: number }) => {
      // 1. 预算检查放在最前面
      const decision = decide(deps.budgetInput);
      if (decision.action === 'reject') {
        const exceeded: BudgetExceededResult = {
          error: 'budget_exceeded',
          reason: decision.reason,
        };
        return JSON.stringify(exceeded);
      }

      // 2. 调用 RAG 检索，结果序列化为 JSON 字符串（LangChain 工具返回必须是 string）
      const result = await deps.ragAsk(question, topK);
      return JSON.stringify(result);
    },
    {
      name: 'rag_knowledge_search',
      description: RAG_TOOL_DESCRIPTION,
      schema: z.object({
        question: z
          .string()
          .min(1)
          .describe('要检索到知识库的问题，例如「退货政策是什么？」'),
        topK: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('返回的文档数量，默认 4'),
      }),
    },
  );
}

export { RAG_TOOL_DESCRIPTION };

