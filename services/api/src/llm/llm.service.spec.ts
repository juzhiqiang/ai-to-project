import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from './llm.service';
import type { ChatModelLike } from './model.factory';

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
    expect((messages[0] as SystemMessage).content).toBe('需求结构化抽取助手');
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect((messages[1] as HumanMessage).content).toBe('整理这段需求');
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
});
