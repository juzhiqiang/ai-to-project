import { Injectable } from '@nestjs/common';
import { type AIUIResponse, type UIAction } from './ui-schemas';
import type { UIFlowContext, UIFlowStage } from './ui-types';

const DEFAULT_SESSION_STAGE: UIFlowStage = 'select_type';

@Injectable()
export class UIFlowService {
  // 当前先用内存保存会话状态；后续如果要跨进程/重启保留，可替换为 Redis 或数据库。
  private readonly contexts = new Map<string, UIFlowContext>();

  /** 初始化需求分析闭环：用户输入新需求后，先进入“选择需求类型”阶段。 */
  startRequirementFlow(sessionId: string, input: string): AIUIResponse {
    const context = this.setContext(sessionId, DEFAULT_SESSION_STAGE, {
      initialInput: input,
    });

    return this.renderSelectType(context);
  }

  /**
   * 根据当前 sessionStage 和 UIAction 推进状态机。
   * 状态流：select_type -> fill_detail -> confirm -> result。
   */
  advance(sessionId: string, action: UIAction): AIUIResponse {
    const context = this.ensureContext(sessionId);
    const payload = actionPayload(action);

    // Stage 1: 用户选择需求类型后，进入详情表单阶段。
    if (context.sessionStage === 'select_type' && action.type === 'selection') {
      const next = this.setContext(sessionId, 'fill_detail', {
        ...context.collectedData,
        requirementType: String(payload),
      });

      return this.renderFillDetail(next);
    }

    // Stage 2: 表单提交后，合并用户填写的数据并进入确认阶段。
    if (context.sessionStage === 'fill_detail' && action.type === 'form_submit') {
      const formData = isRecord(payload) ? payload : {};
      const next = this.setContext(sessionId, 'confirm', {
        ...context.collectedData,
        ...formData,
      });

      return this.renderConfirm(next);
    }

    // Stage 3: 确认提交进入结果页；取消则回退到表单，保留已填写数据。
    if (context.sessionStage === 'confirm' && action.type === 'confirmation') {
      if (!Boolean(payload)) {
        const previous = this.setContext(sessionId, 'fill_detail', context.collectedData);
        return this.renderFillDetail(previous);
      }

      const next = this.setContext(sessionId, 'result', context.collectedData);
      return this.renderResult(next);
    }

    // Result 后续动作：查看报告、返回摘要、继续补充信息。
    if (context.sessionStage === 'result' && action.type === 'button_click') {
      const command = String(payload);

      if (command === 'view_report') {
        return this.renderAnalysisReport(context);
      }

      if (command === 'edit_detail') {
        const previous = this.setContext(sessionId, 'fill_detail', context.collectedData);
        return this.renderFillDetail(previous);
      }

      if (command === 'back_to_result') {
        return this.renderResult(context);
      }
    }

    return this.renderForStage(context);
  }

  /** 主要给测试和调试使用，用来查看当前 session 的状态与收集数据。 */
  getContext(sessionId: string) {
    return this.contexts.get(sessionId);
  }

  /** 清理单个 session 状态，避免测试或新流程之间互相污染。 */
  clearSession(sessionId: string) {
    this.contexts.delete(sessionId);
  }

  /** 若 action 先于 chat 到达，则创建一个默认 select_type 上下文兜底。 */
  private ensureContext(sessionId: string) {
    return this.contexts.get(sessionId) ?? this.setContext(sessionId, DEFAULT_SESSION_STAGE, {});
  }

  /** 集中写入上下文，保证 stage 和 collectedData 总是一起更新。 */
  private setContext(
    sessionId: string,
    sessionStage: UIFlowStage,
    collectedData: Record<string, unknown>,
  ): UIFlowContext {
    const context = { sessionId, sessionStage, collectedData };
    this.contexts.set(sessionId, context);

    return context;
  }

  /** 非预期 action 不强行推进状态，而是重渲染当前阶段，保持前端可恢复。 */
  private renderForStage(context: UIFlowContext): AIUIResponse {
    switch (context.sessionStage) {
      case 'fill_detail':
        return this.renderFillDetail(context);
      case 'confirm':
        return this.renderConfirm(context);
      case 'result':
        return this.renderResult(context);
      default:
        return this.renderSelectType(context);
    }
  }

  /** Stage 1 UI：让用户先选需求类型，决定后续表单文案和上下文。 */
  private renderSelectType(_context: UIFlowContext): AIUIResponse {
    return {
      message: '请选择需求类型，系统会根据类型生成后续表单。',
      components: [
        {
          type: 'selection',
          id: 'requirement-type',
          title: '选择需求类型',
          description: '请选择最接近的需求分类。',
          mode: 'single',
          options: [
            { label: '功能需求', value: 'functional', description: '新增或扩展业务功能' },
            { label: '缺陷修复', value: 'bugfix', description: '修复已有流程或系统问题' },
            { label: '体验优化', value: 'optimization', description: '提升效率、易用性或展示效果' },
          ],
        },
      ],
    };
  }

  /** Stage 2 UI：收集需求标题、描述、优先级、日期和估算。 */
  private renderFillDetail(context: UIFlowContext): AIUIResponse {
    const data = context.collectedData;

    return {
      message: '请补充需求详情。',
      components: [
        {
          type: 'form',
          id: 'requirement-detail-form',
          title: '填写需求详情',
          description: `需求类型：${requirementTypeLabel(String(data.requirementType ?? 'functional'))}`,
          submitLabel: '提交需求分析',
          fields: [
            {
              type: 'input',
              name: 'title',
              label: '需求标题',
              required: true,
              defaultValue: typeof data.title === 'string' ? data.title : undefined,
              placeholder: '例如：批量导入 Excel 数据',
            },
            {
              type: 'textarea',
              name: 'description',
              label: '需求描述',
              required: true,
              defaultValue: typeof data.description === 'string' ? data.description : String(data.initialInput ?? ''),
            },
            {
              type: 'textarea',
              name: 'acceptanceCriteria',
              label: '验收标准',
              defaultValue: typeof data.acceptanceCriteria === 'string' ? data.acceptanceCriteria : undefined,
              placeholder: '例如：支持 1 万行以内数据导入，异常数据自动标记',
            },
            {
              type: 'select',
              name: 'priority',
              label: '优先级',
              required: true,
              defaultValue: typeof data.priority === 'string' ? data.priority : 'medium',
              options: [
                { label: '高', value: 'high' },
                { label: '中', value: 'medium' },
                { label: '低', value: 'low' },
              ],
            },
            { type: 'date', name: 'dueDate', label: '期望完成日期' },
            { type: 'number', name: 'estimate', label: '预估人天', min: 1, max: 60 },
          ],
        },
      ],
    };
  }

  /** Stage 3 UI：在真正提交前，用 confirmation + card 给用户复核信息。 */
  private renderConfirm(context: UIFlowContext): AIUIResponse {
    const data = context.collectedData;
    const title = String(data.title ?? '未命名需求');
    const description = String(data.description ?? data.initialInput ?? '未填写');

    return {
      message: '请确认提交需求分析。',
      components: [
        {
          type: 'confirmation',
          id: 'confirm-requirement-analysis',
          title: '确认提交分析',
          summary: [
            `需求类型：${requirementTypeLabel(String(data.requirementType ?? 'functional'))}`,
            `需求标题：${title}`,
            `优先级：${priorityLabel(String(data.priority ?? 'medium'))}`,
          ],
          confirmLabel: '确认提交',
          cancelLabel: '返回修改',
          action: {
            type: 'confirmation',
            componentType: 'confirmation',
            componentId: 'confirm-requirement-analysis',
            payload: true,
          },
        },
        {
          type: 'card',
          id: 'requirement-preview-card',
          title,
          subtitle: '需求提交预览',
          fields: [
            { label: '需求描述', value: description },
            { label: '需求类型', value: requirementTypeLabel(String(data.requirementType ?? 'functional')) },
            { label: '优先级', value: priorityLabel(String(data.priority ?? 'medium')) },
          ],
        },
      ],
    };
  }

  /** Stage 4 UI：展示流程进度和后续动作入口。 */
  private renderResult(context: UIFlowContext): AIUIResponse {
    const data = context.collectedData;
    const title = String(data.title ?? '未命名需求');
    const description = String(data.description ?? data.initialInput ?? '未填写');
    const requirementType = requirementTypeLabel(String(data.requirementType ?? 'functional'));
    const priority = priorityLabel(String(data.priority ?? 'medium'));
    const acceptanceCriteria = String(data.acceptanceCriteria ?? '待补充');

    return {
      message: '需求分析已提交，系统已生成后续处理入口。',
      components: [
        {
          type: 'steps',
          id: 'requirement-analysis-result-steps',
          current: 3,
          steps: [
            { label: '选择类型', status: 'completed' },
            { label: '填写详情', status: 'completed' },
            { label: '确认提交', status: 'completed' },
            { label: '生成结果', status: 'current', description: `已生成「${title}」的分析入口` },
          ],
        },
        {
          type: 'card',
          id: 'requirement-result-card',
          title,
          subtitle: '需求分析结果摘要',
          fields: [
            { label: '需求描述', value: description },
            { label: '需求类型', value: requirementType },
            { label: '优先级', value: priority },
            { label: '验收标准', value: acceptanceCriteria },
          ],
        },
        {
          type: 'action_buttons',
          id: 'requirement-result-actions',
          actions: [
            {
              label: '查看分析报告',
              variant: 'primary',
              action: { type: 'button_click', componentType: 'action_buttons', componentId: 'requirement-result-actions', payload: 'view_report' },
            },
            {
              label: '继续补充信息',
              variant: 'secondary',
              action: { type: 'button_click', componentType: 'action_buttons', componentId: 'requirement-result-actions', payload: 'edit_detail' },
            },
          ],
        },
      ],
    };
  }

  /** Result 后续：查看完整分析报告，包含摘要、风险和回退动作。 */
  private renderAnalysisReport(context: UIFlowContext): AIUIResponse {
    const data = context.collectedData;
    const title = String(data.title ?? '未命名需求');
    const description = String(data.description ?? data.initialInput ?? '未填写');
    const requirementType = requirementTypeLabel(String(data.requirementType ?? 'functional'));
    const priority = priorityLabel(String(data.priority ?? 'medium'));
    const acceptanceCriteria = String(data.acceptanceCriteria ?? '待补充');

    return {
      message: '已生成需求分析报告。',
      components: [
        {
          type: 'card',
          id: 'requirement-analysis-report-card',
          title: `${title} 分析报告`,
          subtitle: '需求分析结论',
          fields: [
            { label: '需求类型', value: requirementType },
            { label: '优先级', value: priority },
            { label: '需求描述', value: description },
            { label: '验收标准', value: acceptanceCriteria },
            { label: '建议下一步', value: '进入需求澄清，确认导入模板、字段映射和异常数据处理策略。' },
          ],
        },
        {
          type: 'table',
          id: 'requirement-analysis-risk-table',
          title: '关键风险与建议',
          columns: [
            { key: 'risk', label: '风险点' },
            { key: 'impact', label: '影响' },
            { key: 'suggestion', label: '建议' },
          ],
          rows: [
            {
              risk: '导入模板不一致',
              impact: '字段错位或导入失败',
              suggestion: '提供模板下载，并在导入前校验列名和必填字段',
            },
            {
              risk: '异常数据混入',
              impact: '影响批量导入成功率',
              suggestion: '按行标记异常数据，允许用户下载错误清单后重新提交',
            },
            {
              risk: '大文件处理耗时',
              impact: '用户等待时间长，难以判断进度',
              suggestion: '使用异步任务展示导入进度，并在完成后通知用户',
            },
          ],
        },
        {
          type: 'action_buttons',
          id: 'requirement-report-actions',
          actions: [
            {
              label: '返回结果摘要',
              variant: 'secondary',
              action: { type: 'button_click', componentType: 'action_buttons', componentId: 'requirement-report-actions', payload: 'back_to_result' },
            },
            {
              label: '继续补充信息',
              variant: 'primary',
              action: { type: 'button_click', componentType: 'action_buttons', componentId: 'requirement-report-actions', payload: 'edit_detail' },
            },
          ],
        },
      ],
    };
  }
}

/** 兼容 6.0 的 value 和 6.1 的 payload，优先读取新协议 payload。 */
export function actionPayload(action: UIAction) {
  return action.payload !== undefined ? action.payload : action.value;
}

/** 安全判断表单 payload，避免 unknown 直接展开。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 把内部需求类型枚举转成用户可读文案。 */
function requirementTypeLabel(type: string) {
  const labels: Record<string, string> = {
    functional: '功能需求',
    feature: '功能需求',
    bugfix: '缺陷修复',
    optimization: '体验优化',
  };

  return labels[type] ?? type;
}

/** 把优先级枚举转成用户可读文案。 */
function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return labels[priority] ?? priority;
}
