import { UIActionService } from '../../../src/llm/ui-protocol/ui-action.service';

describe('UIActionService', () => {
  const service = new UIActionService();

  it('returns a requirement form after selecting a requirement type', async () => {
    await expect(
      service.handleAction(
        {
          type: 'selection',
          componentId: 'requirement-type',
          value: 'feature',
        },
        { sessionId: 'session-1' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        components: [expect.objectContaining({ type: 'form', id: 'requirement-form' })],
      }),
    );
  });

  it('returns confirmation and steps after submitting requirement analysis', async () => {
    await expect(
      service.handleAction(
        {
          type: 'form_submit',
          componentId: 'requirement-form',
          value: {
            title: '优化退款流程',
            description: '希望减少人工审核时间',
            priority: 'high',
          },
        },
        { sessionId: 'session-1' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        components: [
          expect.objectContaining({ type: 'confirmation' }),
          expect.objectContaining({ type: 'steps' }),
        ],
      }),
    );
  });
});
