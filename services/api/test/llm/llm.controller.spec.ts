import type { Response } from 'express';
import { LlmController } from '../../src/llm/llm.controller';
import type { LlmService } from '../../src/llm/llm.service';
import type { RequirementService } from '../../src/llm/requirement.service';

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
    toolBind: jest.fn(async () => ({ content: 'from-tool-bind', toolCalls: [] })),
    toolLoop: jest.fn(async () => ({ content: 'from-tool-loop', toolCalls: [], toolResults: [] })),
  } as unknown as LlmService;

  const requirementService = {
    extract: jest.fn(async () => ({
      action: ['绑定手机号'],
      constraints: ['必须绑定手机号', '密码至少8位'],
      entities: ['用户注册', '手机号', '密码'],
    })),
  } as unknown as RequirementService;

  const controller = new LlmController(service, requirementService);

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

  it('delegates tool bind to the service', async () => {
    await expect(controller.toolBind({ input: 'hello' })).resolves.toEqual({
      content: 'from-tool-bind',
      toolCalls: [],
    });
    expect(service.toolBind).toHaveBeenCalledWith({ input: 'hello' });
  });

  it('delegates tool loop to the service', async () => {
    await expect(controller.toolLoop({ input: 'hello' })).resolves.toEqual({
      content: 'from-tool-loop',
      toolCalls: [],
      toolResults: [],
    });
    expect(service.toolLoop).toHaveBeenCalledWith({ input: 'hello' });
  });

  it('delegates structured extraction to the requirement service', async () => {
    await expect(controller.structured({ input: 'hello' })).resolves.toEqual({
      action: ['绑定手机号'],
      constraints: ['必须绑定手机号', '密码至少8位'],
      entities: ['用户注册', '手机号', '密码'],
    });
    expect(requirementService.extract).toHaveBeenCalledWith('hello');
  });
});
