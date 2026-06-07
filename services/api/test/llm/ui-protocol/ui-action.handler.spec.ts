import { UIActionHandler } from '../../../src/llm/ui-protocol/ui-action.handler';
import { UIFlowService } from '../../../src/llm/ui-protocol/ui-flow.service';

describe('UIActionHandler', () => {
  let flowService: UIFlowService;
  let handler: UIActionHandler;

  beforeEach(() => {
    flowService = new UIFlowService();
    handler = new UIActionHandler(flowService);
    flowService.startRequirementFlow('session-handler', '我要提一个新需求');
  });

  it('dispatches UI actions and updates session context', async () => {
    const response = await handler.handle(
      {
        type: 'selection',
        componentType: 'selection',
        componentId: 'requirement-type',
        payload: 'functional',
      },
      { sessionId: 'session-handler' },
    );

    expect(response.components[0]).toEqual(expect.objectContaining({ type: 'form' }));
    expect(flowService.getContext('session-handler')).toEqual(
      expect.objectContaining({
        sessionStage: 'fill_detail',
        collectedData: expect.objectContaining({ requirementType: 'functional' }),
      }),
    );
  });

  it('accepts compact componentType + payload actions from curl examples', async () => {
    const response = await handler.handle(
      {
        componentType: 'selection',
        payload: { type: 'select', selectedId: 'functional' },
      } as any,
      { sessionId: 'session-handler' },
    );

    expect(response.components[0]).toEqual(expect.objectContaining({ type: 'form' }));
    expect(flowService.getContext('session-handler')).toEqual(
      expect.objectContaining({
        sessionStage: 'fill_detail',
        collectedData: expect.objectContaining({ requirementType: 'functional' }),
      }),
    );
  });
});
