import { Injectable } from '@nestjs/common';
import { type AIUIResponse, type UIAction, uiActionSchema } from './ui-schemas';
import { requirementSubmitResponse, requirementTypeSelectionResponse } from './ui-response.service';
import type { UISessionContext } from './ui-types';

@Injectable()
export class UIActionService {
  async handleAction(action: UIAction, sessionContext: UISessionContext): Promise<AIUIResponse> {
    const parsedAction = uiActionSchema.parse(action);

    if (parsedAction.type === 'selection' && parsedAction.componentId === 'requirement-type') {
      return requirementFormResponse(String(parsedAction.value), sessionContext.sessionId);
    }

    if (parsedAction.type === 'form_submit' && parsedAction.componentId === 'requirement-form') {
      return requirementSubmitResponse(formTitle(parsedAction.value));
    }

    if (parsedAction.type === 'confirmation') {
      return confirmationNextStepResponse(Boolean(parsedAction.value));
    }

    if (parsedAction.type === 'button_click' && parsedAction.value === 'submit_analysis') {
      return requirementSubmitResponse('已选需求');
    }

    return requirementTypeSelectionResponse();
  }
}

function requirementFormResponse(requirementType: string, sessionId: string): AIUIResponse {
  return {
    message: '请补充需求信息，我会据此生成结构化分析。',
    components: [
      {
        type: 'form',
        id: 'requirement-form',
        title: '填写需求信息',
        description: `当前会话：${sessionId}，需求类型：${requirementTypeLabel(requirementType)}`,
        submitLabel: '提交需求分析',
        fields: [
          { type: 'input', name: 'title', label: '需求标题', required: true, placeholder: '例如：优化退款流程' },
          {
            type: 'select',
            name: 'priority',
            label: '优先级',
            required: true,
            options: [
              { label: '高', value: 'high' },
              { label: '中', value: 'medium' },
              { label: '低', value: 'low' },
            ],
          },
          { type: 'textarea', name: 'description', label: '需求描述', required: true },
          { type: 'date', name: 'dueDate', label: '期望完成日期' },
          { type: 'number', name: 'estimate', label: '预估人天', min: 1, max: 60 },
        ],
      },
    ],
  };
}

function confirmationNextStepResponse(confirmed: boolean): AIUIResponse {
  if (!confirmed) {
    return {
      message: '已取消提交，你可以继续修改需求信息。',
      components: [
        {
          type: 'action_buttons',
          id: 'cancel-actions',
          actions: [
            {
              label: '重新选择需求类型',
              variant: 'secondary',
              action: { type: 'button_click', componentId: 'cancel-actions', value: 'restart' },
            },
          ],
        },
      ],
    };
  }

  return {
    message: '需求分析已提交，系统正在生成分析结果。',
    components: [
      {
        type: 'steps',
        id: 'requirement-analysis-steps',
        current: 2,
        steps: [
          { label: '填写需求', status: 'completed' },
          { label: '提交确认', status: 'completed' },
          { label: '智能分析', status: 'current' },
          { label: '生成报告', status: 'pending' },
        ],
      },
      {
        type: 'text',
        id: 'submitted-message',
        content: '我会继续检查需求完整性、约束条件和潜在风险。',
      },
    ],
  };
}

function formTitle(value: unknown): string {
  if (value && typeof value === 'object' && 'title' in value && typeof value.title === 'string') {
    return value.title;
  }

  return '未命名需求';
}

function requirementTypeLabel(type: string) {
  const labels: Record<string, string> = {
    feature: '新功能',
    bugfix: '缺陷修复',
    optimization: '体验优化',
  };

  return labels[type] ?? type;
}
