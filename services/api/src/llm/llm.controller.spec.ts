import type { Response } from 'express';
import { LlmController } from './llm.controller';
import type { LlmService } from './llm.service';

describe('LlmController', () => {
  const service = {
    invoke: jest.fn(async () => ({ content: 'ok' })),
    stream: jest.fn(async () => undefined),
    batch: jest.fn(async () => ({ results: ['ok'] })),
    promptPreview: jest.fn(async () => ({ messages: [] })),
    promptToModel: jest.fn(async () => ({ content: 'from-prompt' })),
    chainInvoke: jest.fn(async () => ({ content: 'from-chain' })),
    chainStream: jest.fn(async () => undefined),
    chainBatch: jest.fn(async () => ({ results: ['from-chain'] })),
  } as unknown as LlmService;

  const controller = new LlmController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates invoke to the service', async () => {
    await expect(controller.invoke({ prompt: 'hello' })).resolves.toEqual({ content: 'ok' });
    expect(service.invoke).toHaveBeenCalledWith({ prompt: 'hello' });
  });

  it('delegates stream to the service', async () => {
    const response = {} as Response;

    await controller.stream({ prompt: 'hello' }, response);

    expect(service.stream).toHaveBeenCalledWith({ prompt: 'hello' }, response);
  });

  it('delegates batch to the service', async () => {
    await expect(controller.batch({ prompts: ['a'] })).resolves.toEqual({ results: ['ok'] });
    expect(service.batch).toHaveBeenCalledWith({ prompts: ['a'] });
  });

  it('delegates prompt preview to the service', async () => {
    await expect(controller.promptPreview({ input: 'hello' })).resolves.toEqual({ messages: [] });
    expect(service.promptPreview).toHaveBeenCalledWith({ input: 'hello' });
  });

  it('delegates prompt-to-model to the service', async () => {
    await expect(controller.promptToModel({ input: 'hello' })).resolves.toEqual({ content: 'from-prompt' });
    expect(service.promptToModel).toHaveBeenCalledWith({ input: 'hello' });
  });

  it('delegates chain invoke to the service', async () => {
    await expect(controller.chainInvoke({ input: 'hello' })).resolves.toEqual({ content: 'from-chain' });
    expect(service.chainInvoke).toHaveBeenCalledWith({ input: 'hello' });
  });

  it('delegates chain stream to the service', async () => {
    const response = {} as Response;

    await controller.chainStream({ input: 'hello' }, response);

    expect(service.chainStream).toHaveBeenCalledWith({ input: 'hello' }, response);
  });

  it('delegates chain batch to the service', async () => {
    await expect(controller.chainBatch({ inputs: ['hello'] })).resolves.toEqual({ results: ['from-chain'] });
    expect(service.chainBatch).toHaveBeenCalledWith({ inputs: ['hello'] });
  });
});
