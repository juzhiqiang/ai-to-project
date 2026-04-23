import type { Response } from 'express';
import { LlmController } from './llm.controller';
import type { LlmService } from './llm.service';

describe('LlmController', () => {
  const service = {
    invoke: jest.fn(async () => ({ content: 'ok' })),
    stream: jest.fn(async () => undefined),
    batch: jest.fn(async () => ({ results: ['ok'] })),
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
});
