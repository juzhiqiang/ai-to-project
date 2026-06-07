import { UIFlowService } from '../../../src/llm/ui-protocol/ui-flow.service';

describe('UIFlowService', () => {
  const service = new UIFlowService();

  beforeEach(() => {
    service.clearSession('session-flow');
  });

  function runToResult() {
    service.startRequirementFlow('session-flow', '我要提一个新需求：用户希望能够批量导入 Excel 数据');
    service.advance('session-flow', {
      type: 'selection',
      componentType: 'selection',
      componentId: 'requirement-type',
      payload: 'functional',
    });
    service.advance('session-flow', {
      type: 'form_submit',
      componentType: 'form',
      componentId: 'requirement-detail-form',
      payload: {
        title: '批量导入 Excel 数据',
        description: '用户希望能够批量导入 Excel 数据',
        priority: 'P1',
        acceptanceCriteria: '支持 1 万行以内数据导入，异常数据自动标记',
      },
    });
    return service.advance('session-flow', {
      type: 'confirmation',
      componentType: 'confirmation',
      componentId: 'confirm-requirement-analysis',
      payload: true,
    });
  }

  it('runs select -> form -> confirmation -> result for one session', () => {
    const start = service.startRequirementFlow(
      'session-flow',
      '我要提一个新需求：用户希望能够批量导入 Excel 数据',
    );
    expect(start.components[0]).toEqual(expect.objectContaining({ type: 'selection', id: 'requirement-type' }));

    const form = service.advance('session-flow', {
      type: 'selection',
      componentType: 'selection',
      componentId: 'requirement-type',
      payload: 'functional',
    });
    expect(form.components[0]).toEqual(expect.objectContaining({ type: 'form', id: 'requirement-detail-form' }));

    const confirm = service.advance('session-flow', {
      type: 'form_submit',
      componentType: 'form',
      componentId: 'requirement-detail-form',
      payload: {
        title: '批量导入 Excel 数据',
        description: '用户希望能够批量导入 Excel 数据',
        priority: 'high',
        acceptanceCriteria: '支持 1 万行以内数据导入，异常数据自动标记',
      },
    });
    expect(confirm.components).toEqual([
      expect.objectContaining({ type: 'confirmation' }),
      expect.objectContaining({ type: 'card' }),
    ]);

    const result = service.advance('session-flow', {
      type: 'confirmation',
      componentType: 'confirmation',
      componentId: 'confirm-requirement-analysis',
      payload: true,
    });
    expect(result.components).toEqual([
      expect.objectContaining({ type: 'steps' }),
      expect.objectContaining({
        type: 'card',
        fields: expect.arrayContaining([
          expect.objectContaining({ label: '验收标准', value: '支持 1 万行以内数据导入，异常数据自动标记' }),
        ]),
      }),
      expect.objectContaining({ type: 'action_buttons' }),
    ]);
    expect(service.getContext('session-flow')).toEqual(
      expect.objectContaining({
        sessionStage: 'result',
        collectedData: expect.objectContaining({
          requirementType: 'functional',
          title: '批量导入 Excel 数据',
        }),
      }),
    );
  });

  it('goes back to fill_detail when confirmation is cancelled', () => {
    service.startRequirementFlow('session-flow', '我要提一个新需求');
    service.advance('session-flow', {
      type: 'selection',
      componentType: 'selection',
      componentId: 'requirement-type',
      payload: 'functional',
    });
    service.advance('session-flow', {
      type: 'form_submit',
      componentType: 'form',
      componentId: 'requirement-detail-form',
      payload: { title: '批量导入 Excel 数据', description: '导入 Excel', priority: 'medium' },
    });

    const back = service.advance('session-flow', {
      type: 'confirmation',
      componentType: 'confirmation',
      componentId: 'confirm-requirement-analysis',
      payload: false,
    });

    expect(back.components[0]).toEqual(expect.objectContaining({ type: 'form', id: 'requirement-detail-form' }));
    expect(service.getContext('session-flow')?.sessionStage).toBe('fill_detail');
  });

  it('opens an analysis report from the result actions', () => {
    runToResult();

    const report = service.advance('session-flow', {
      type: 'button_click',
      componentType: 'action_buttons',
      componentId: 'requirement-result-actions',
      payload: 'view_report',
    });

    expect(report.components).toEqual([
      expect.objectContaining({ type: 'card', id: 'requirement-analysis-report-card' }),
      expect.objectContaining({ type: 'table', id: 'requirement-analysis-risk-table' }),
      expect.objectContaining({ type: 'action_buttons', id: 'requirement-report-actions' }),
    ]);
  });

  it('returns to the detail form from result actions and keeps collected data', () => {
    runToResult();

    const form = service.advance('session-flow', {
      type: 'button_click',
      componentType: 'action_buttons',
      componentId: 'requirement-result-actions',
      payload: 'edit_detail',
    });

    expect(form.components[0]).toEqual(
      expect.objectContaining({
        type: 'form',
        id: 'requirement-detail-form',
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'title', defaultValue: '批量导入 Excel 数据' }),
          expect.objectContaining({ name: 'acceptanceCriteria', defaultValue: '支持 1 万行以内数据导入，异常数据自动标记' }),
        ]),
      }),
    );
    expect(service.getContext('session-flow')?.sessionStage).toBe('fill_detail');
  });
});
