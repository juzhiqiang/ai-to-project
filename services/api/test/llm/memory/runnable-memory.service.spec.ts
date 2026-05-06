import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { RunnableMemoryService } from '../../../src/llm/memory/runnable-memory.service';
import type { ChatModelFactory } from '../../../src/llm/model.factory';

const FIRST_INPUT = '我买的蓝牙耳机降噪效果不好，想退货';
const SECOND_INPUT = '订单号是 EC20240315001';
const THIRD_INPUT = '帮我判断一下这个订单能不能退';

function createFakeModelFactory() {
  const seenMessages: BaseMessage[][] = [];
  const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
    const messages = promptValue.toChatMessages();
    seenMessages.push(messages);
    const humanMessages = messages.filter((message) => message.getType() === 'human').map((message) => message.content);

    return new AIMessage(`已记录：${humanMessages.join(' | ')}`);
  });

  return {
    createModel: (() => model) as unknown as ChatModelFactory,
    seenMessages,
  };
}

describe('RunnableMemoryService', () => {
  it('keeps multi-turn e-commerce support context by session id', async () => {
    const { createModel, seenMessages } = createFakeModelFactory();
    const service = new RunnableMemoryService(createModel);

    const first = await service.chat('s1', FIRST_INPUT);
    const second = await service.chat('s1', SECOND_INPUT);
    const third = await service.chat('s1', THIRD_INPUT);

    expect(first.content).toContain(FIRST_INPUT);
    expect(second.content).toContain(FIRST_INPUT);
    expect(second.content).toContain(SECOND_INPUT);
    expect(third.content).toContain(FIRST_INPUT);
    expect(third.content).toContain(SECOND_INPUT);
    expect(third.content).toContain(THIRD_INPUT);

    const thirdTurnHumanMessages = seenMessages[2]
      .filter((message) => message.getType() === 'human')
      .map((message) => message.content);
    expect(thirdTurnHumanMessages).toEqual([FIRST_INPUT, SECOND_INPUT, THIRD_INPUT]);

    await expect(service.getHistory('s1')).resolves.toEqual([
      { type: 'human', content: FIRST_INPUT },
      { type: 'ai', content: expect.stringContaining(FIRST_INPUT) },
      { type: 'human', content: SECOND_INPUT },
      { type: 'ai', content: expect.stringContaining(SECOND_INPUT) },
      { type: 'human', content: THIRD_INPUT },
      { type: 'ai', content: expect.stringContaining(THIRD_INPUT) },
    ]);
  });

  it('isolates histories across sessions', async () => {
    const { createModel, seenMessages } = createFakeModelFactory();
    const service = new RunnableMemoryService(createModel);

    await service.chat('s1', FIRST_INPUT);
    await service.chat('s2', THIRD_INPUT);

    const s2HumanMessages = seenMessages[1]
      .filter((message) => message.getType() === 'human')
      .map((message) => message.content);
    expect(s2HumanMessages).toEqual([THIRD_INPUT]);
    await expect(service.getHistory('s1')).resolves.toHaveLength(2);
    await expect(service.getHistory('s2')).resolves.toHaveLength(2);
  });

  it('appends and clears a session manually', async () => {
    const { createModel } = createFakeModelFactory();
    const service = new RunnableMemoryService(createModel);

    await service.appendMessage('manual', '用户说想退货', '客服说请提供订单号');
    await expect(service.getHistory('manual')).resolves.toEqual([
      { type: 'human', content: '用户说想退货' },
      { type: 'ai', content: '客服说请提供订单号' },
    ]);

    await service.clearSession('manual');

    await expect(service.getHistory('manual')).resolves.toEqual([]);
  });

  it('trims old history messages with the last-message strategy before model invocation', async () => {
    const seenMessages: BaseMessage[][] = [];
    const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
      const messages = promptValue.toChatMessages();
      seenMessages.push(messages);

      return new AIMessage('trimmed');
    });
    const service = new RunnableMemoryService((() => model) as unknown as ChatModelFactory);

    for (let index = 0; index < 1005; index += 1) {
      await service.appendMessage('s1', `old-human-${index}`, `old-ai-${index}`);
    }

    await service.chat('s1', THIRD_INPUT);

    const humanMessages = seenMessages[0].filter((message) => message.getType() === 'human');
    const firstVisibleHuman = humanMessages[0].content;
    const lastVisibleHuman = humanMessages[humanMessages.length - 1].content;
    expect(firstVisibleHuman).not.toBe('old-human-0');
    expect(firstVisibleHuman).toBe('old-human-5');
    expect(lastVisibleHuman).toBe(THIRD_INPUT);
  });
});
