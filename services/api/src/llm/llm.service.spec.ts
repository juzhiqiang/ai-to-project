import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { LlmService } from './llm.service';
import type { ChatModelLike } from './model.factory';
import { REQUIREMENT_SYSTEM_PROMPT } from './prompts/requirement.prompt';
import { basicTools } from './tools/basic.tools';

class FakeChatModel implements ChatModelLike {
  public readonly invoke = jest.fn(async (messages: unknown[]) => ({
    content: `invoke:${messages.length}`,
  }));

  public readonly batch = jest.fn(async (batches: unknown[][]) =>
    batches.map((messages, index) => ({
      content: `batch:${index}:${messages.length}`,
    })),
  );

  public async *stream(messages: unknown[]) {
    yield { content: `chunk:${messages.length}:1` };
    yield { content: 'chunk:2' };
  }
}

class FakeToolChatModel implements ChatModelLike {
  public readonly seenMessages: BaseMessage[][] = [];
  private responseIndex = 0;

  constructor(private readonly responses: AIMessage[]) {}

  public readonly bindTools = jest.fn(() => this);

  public readonly invoke = jest.fn(async (messages: BaseMessage[]) => {
    this.seenMessages.push(messages);
    const response = this.responses[this.responseIndex] ?? new AIMessage('');
    this.responseIndex += 1;
    return response;
  });

  public readonly batch = jest.fn(async () => []);

  public async *stream() {
    yield { content: '' };
  }
}

const createResponse = () => {
  const stream = new PassThrough();
  let body = '';

  stream.on('data', (chunk) => {
    body += chunk.toString();
  });

  const response = {
    setHeader: jest.fn(),
    write: jest.fn((chunk: string) => {
      stream.write(chunk);
    }),
    end: jest.fn(() => {
      stream.end();
    }),
  } as unknown as Response;

  return { response, getBody: () => body };
};

const TEST_INPUT = '用户注册时必须绑定手机号，密码至少8位';

function createRunnableChatModel() {
  const seenMessages: BaseMessage[][] = [];
  const model = RunnableLambda.from(async (promptValue: { toChatMessages: () => BaseMessage[] }) => {
    const messages = promptValue.toChatMessages();
    seenMessages.push(messages);

    return new AIMessage(`chain:${messages.length}:${messages[1].content}`);
  });

  return {
    model: model as unknown as ChatModelLike,
    seenMessages,
  };
}

describe('LlmService', () => {
  let service: LlmService;
  let model: FakeChatModel;

  beforeEach(() => {
    model = new FakeChatModel();
    service = new LlmService(() => model);
  });

  it('prepends the extraction system role for invoke', async () => {
    const result = await service.invoke({ prompt: '整理这段需求' });

    expect(result).toEqual({ content: 'invoke:2' });

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect((messages[0] as SystemMessage).content).toBe(REQUIREMENT_SYSTEM_PROMPT);
    expect((messages[0] as SystemMessage).content).toContain('action');
    expect((messages[0] as SystemMessage).content).toContain('constraints');
    expect((messages[0] as SystemMessage).content).toContain('entities');
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect((messages[1] as HumanMessage).content).toContain('整理这段需求');
  });

  it('renders requirement prompt preview without invoking the model', async () => {
    const result = await service.promptPreview({ input: TEST_INPUT });

    expect(result).toEqual({
      messages: [
        {
          type: 'system',
          content: REQUIREMENT_SYSTEM_PROMPT,
        },
        {
          type: 'human',
          content: expect.stringContaining(TEST_INPUT),
        },
      ],
    });
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it('formats requirement prompt before invoking the model', async () => {
    const result = await service.promptToModel({ input: TEST_INPUT });

    expect(result).toEqual({ content: 'invoke:2' });

    const [messages] = model.invoke.mock.calls[0];
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect((messages[0] as SystemMessage).content).toBe(REQUIREMENT_SYSTEM_PROMPT);
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect((messages[1] as HumanMessage).content).toContain(TEST_INPUT);
  });

  it('writes streaming chunks as server-sent events', async () => {
    const { response, getBody } = createResponse();

    await service.stream({ prompt: '输出结构化摘要' }, response);

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(response.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(getBody()).toContain('data: {"content":"chunk:2:1"}');
    expect(getBody()).toContain('data: {"content":"chunk:2"}');
  });

  it('runs prompts in batch mode', async () => {
    const result = await service.batch({
      prompts: ['需求一', '需求二'],
    });

    expect(result).toEqual({
      results: ['batch:0:2', 'batch:1:2'],
    });
    expect(model.batch).toHaveBeenCalledTimes(1);
  });

  it('runs the requirement chain in invoke mode', async () => {
    const { model, seenMessages } = createRunnableChatModel();
    service = new LlmService(() => model);

    const result = await service.chainInvoke({ input: TEST_INPUT });

    expect(result.content).toContain(`chain:2:`);
    expect(result.content).toContain(TEST_INPUT);
    expect(seenMessages[0][0].content).toBe(REQUIREMENT_SYSTEM_PROMPT);
  });

  it('streams the requirement chain as server-sent events', async () => {
    const { model } = createRunnableChatModel();
    service = new LlmService(() => model);
    const { response, getBody } = createResponse();

    await service.chainStream({ input: TEST_INPUT }, response);

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
    expect(response.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(getBody()).toContain('data: {"content":"chain:2:');
    expect(getBody()).toContain(TEST_INPUT);
  });

  it('runs the requirement chain in batch mode', async () => {
    const { model } = createRunnableChatModel();
    service = new LlmService(() => model);

    const result = await service.chainBatch({ inputs: [TEST_INPUT, '用户登录时必须输入验证码'] });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toContain(TEST_INPUT);
    expect(result.results[1]).toContain('用户登录时必须输入验证码');
  });

  it('binds basic tools before invoking the requirement model', async () => {
    const toolModel = new FakeToolChatModel([
      new AIMessage({
        content: 'tool-bind-ready',
        tool_calls: [
          {
            id: 'call_entity',
            name: 'lookup_entity_definition',
            args: { entity: 'phone_number' },
            type: 'tool_call',
          },
        ],
      }),
    ]);
    service = new LlmService(() => toolModel);

    const result = await service.toolBind({ input: 'User registration must bind a phone number.' });

    expect(toolModel.bindTools).toHaveBeenCalledWith(basicTools);
    expect(result).toEqual({
      content: 'tool-bind-ready',
      toolCalls: [
        {
          id: 'call_entity',
          name: 'lookup_entity_definition',
          args: { entity: 'phone_number' },
        },
      ],
    });
  });

  it('executes requested tools and returns their results to the model', async () => {
    const toolModel = new FakeToolChatModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_constraint',
            name: 'check_constraint_validity',
            args: { constraint: 'password must be at least 8 characters' },
            type: 'tool_call',
          },
          {
            id: 'call_entity',
            name: 'lookup_entity_definition',
            args: { entity: 'phone_number' },
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage('tool-loop:done'),
    ]);
    service = new LlmService(() => toolModel);

    const result = await service.toolLoop({ input: 'User registration must bind a phone number.' });

    expect(toolModel.bindTools).toHaveBeenCalledWith(basicTools);
    expect(toolModel.invoke).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('tool-loop:done');
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        id: 'call_constraint',
        name: 'check_constraint_validity',
        content: expect.stringContaining('"valid":true'),
      }),
      expect.objectContaining({
        id: 'call_entity',
        name: 'lookup_entity_definition',
        content: expect.stringContaining('user contact number'),
      }),
    ]);

    const secondInvokeMessages = toolModel.seenMessages[1];
    const toolMessages = secondInvokeMessages.filter((message) => message instanceof ToolMessage) as ToolMessage[];
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0].tool_call_id).toBe('call_constraint');
    expect(toolMessages[1].tool_call_id).toBe('call_entity');
  });
});
