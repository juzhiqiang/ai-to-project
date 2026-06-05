import { aiUIResponseSchema, uiActionSchema, uiResponseSchema } from '../../../src/llm/ui-protocol/ui-schemas';

describe('UI protocol schemas', () => {
  it('validates all supported UI component variants by type', () => {
    const components = [
      { type: 'text', id: 'text-1', content: '## 需求分析结果' },
      {
        type: 'selection',
        id: 'selection-1',
        title: '选择需求类型',
        mode: 'single',
        options: [{ label: '新功能', value: 'feature', description: '创建新功能需求' }],
      },
      {
        type: 'form',
        id: 'form-1',
        title: '填写需求信息',
        submitLabel: '提交需求分析',
        fields: [
          { type: 'input', name: 'title', label: '需求标题', required: true },
          { type: 'select', name: 'priority', label: '优先级', options: [{ label: '高', value: 'high' }] },
          { type: 'textarea', name: 'description', label: '需求描述' },
          { type: 'date', name: 'dueDate', label: '期望日期' },
          { type: 'number', name: 'estimate', label: '预估人天' },
        ],
      },
      {
        type: 'confirmation',
        id: 'confirm-1',
        title: '确认提交分析',
        summary: ['需求类型：新功能'],
        confirmLabel: '确认提交',
        cancelLabel: '取消',
        action: { type: 'confirmation', componentId: 'confirm-1', value: true },
      },
      {
        type: 'card',
        id: 'card-1',
        title: 'REQ-20240315-001',
        subtitle: '需求详情',
        fields: [{ label: '状态', value: '分析中' }],
      },
      {
        type: 'steps',
        id: 'steps-1',
        current: 1,
        steps: [
          { label: '提交', status: 'completed' },
          { label: '分析', status: 'current' },
        ],
      },
      {
        type: 'table',
        id: 'table-1',
        columns: [{ key: 'id', label: '编号' }],
        rows: [{ id: 'REQ-1' }],
      },
      {
        type: 'action_buttons',
        id: 'actions-1',
        actions: [{ label: '提交分析', action: { type: 'button_click', componentId: 'actions-1', value: 'submit' } }],
      },
    ];

    for (const component of components) {
      expect(uiResponseSchema.parse(component)).toEqual(component);
    }
  });

  it('validates an AI UI response with multiple components', () => {
    expect(
      aiUIResponseSchema.parse({
        message: '请选择需求类型',
        components: [
          {
            type: 'selection',
            id: 'requirement-type',
            title: '选择需求类型',
            mode: 'single',
            options: [{ label: '新功能', value: 'feature' }],
          },
        ],
      }),
    ).toEqual({
      message: '请选择需求类型',
      components: [
        {
          type: 'selection',
          id: 'requirement-type',
          title: '选择需求类型',
          mode: 'single',
          options: [{ label: '新功能', value: 'feature' }],
        },
      ],
    });
  });

  it('validates user actions returned from UI components', () => {
    expect(
      uiActionSchema.parse({
        type: 'form_submit',
        componentId: 'requirement-form',
        value: { title: '支付流程优化', priority: 'high' },
      }),
    ).toEqual({
      type: 'form_submit',
      componentId: 'requirement-form',
      value: { title: '支付流程优化', priority: 'high' },
    });
  });
});
