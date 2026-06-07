import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatModelFactory } from '../../../src/llm/model.factory';
import { UIFlowService } from '../../../src/llm/ui-protocol/ui-flow.service';
import { UIResponseService } from '../../../src/llm/ui-protocol/ui-response.service';
import { aiUIResponseSchema } from '../../../src/llm/ui-protocol/ui-schemas';

const MODEL_RESULT = {
  message: '请选择需求类型',
  components: [
    {
      type: 'selection',
      id: 'requirement-type',
      title: '选择需求类型',
      mode: 'single',
      options: [
        { label: '新功能', value: 'feature', description: '创建新的业务能力' },
        { label: '缺陷修复', value: 'bugfix', description: '修复已有问题' },
      ],
    },
  ],
};

class FakeStructuredModel {
  public readonly invokeStructured = jest.fn(async () => MODEL_RESULT);

  public readonly withStructuredOutput = jest.fn(() => ({
    invoke: this.invokeStructured,
  }));
}

describe('UIResponseService', () => {
  function createService(model: FakeStructuredModel) {
    return new UIResponseService((() => model) as unknown as ChatModelFactory, new UIFlowService());
  }

  it('generates a structured UI response through model.withStructuredOutput', async () => {
    const model = new FakeStructuredModel();
    const service = createService(model);

    const result = await service.generateUIResponse('我要提一个新需求');

    expect(result).toEqual(MODEL_RESULT);
    expect(aiUIResponseSchema.parse(result)).toEqual(MODEL_RESULT);
    expect(model.withStructuredOutput).toHaveBeenCalledWith(aiUIResponseSchema);

    const [messages] = model.invokeStructured.mock.calls[0] as unknown as [BaseMessage[]];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect(messages[0].content).toContain('selection');
    expect(messages[0].content).toContain('form');
    expect(messages[0].content).toContain('confirmation');
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect(messages[1].content).toContain('我要提一个新需求');
  });

  it('falls back to a selection component for new requirement intents', async () => {
    const model = new FakeStructuredModel();
    model.invokeStructured.mockRejectedValue(new Error('model unavailable'));
    const service = createService(model);

    await expect(service.generateUIResponse('我要提一个新需求')).resolves.toEqual(
      expect.objectContaining({
        components: [expect.objectContaining({ type: 'selection', id: 'requirement-type' })],
      }),
    );
  });

  it('falls back to a requirement detail card when querying a requirement id', async () => {
    const model = new FakeStructuredModel();
    model.invokeStructured.mockRejectedValue(new Error('model unavailable'));
    const service = createService(model);

    await expect(service.generateUIResponse('查看需求 REQ-20240315-001')).resolves.toEqual(
      expect.objectContaining({
        components: [expect.objectContaining({ type: 'card', title: 'REQ-20240315-001' })],
      }),
    );
  });

  it('falls back to common service action buttons for initial greetings', async () => {
    const model = new FakeStructuredModel();
    model.invokeStructured.mockRejectedValue(new Error('model unavailable'));
    const service = createService(model);

    await expect(service.generateUIResponse('你好')).resolves.toEqual(
      expect.objectContaining({
        components: [
          expect.objectContaining({
            type: 'action_buttons',
            id: 'common-service-actions',
            actions: expect.arrayContaining([
              expect.objectContaining({ label: '提交新需求' }),
              expect.objectContaining({ label: '查看需求进度' }),
              expect.objectContaining({ label: '提交需求分析' }),
            ]),
          }),
        ],
      }),
    );
  });
});
