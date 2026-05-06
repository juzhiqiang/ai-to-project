import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { FilesystemService } from '../../../src/llm/filesystem/filesystem.service';
import type { ChatModelFactory, ChatModelLike } from '../../../src/llm/model.factory';
import { businessTools } from '../../../src/llm/tools/business.tools';

const workspaceRoot = join(process.cwd(), 'workspace');
const orderId = 'EC20240315001';

class FakeBusinessToolChatModel implements ChatModelLike {
  public readonly seenMessages: BaseMessage[][] = [];
  private responseIndex = 0;

  constructor(private readonly responses: AIMessage[]) {}

  public readonly bindTools = jest.fn(() => this);

  public readonly invoke = jest.fn(async (messages: BaseMessage[]) => {
    this.seenMessages.push([...messages]);
    const response = this.responses[this.responseIndex] ?? new AIMessage('done');
    this.responseIndex += 1;
    return response;
  });

  public readonly batch = jest.fn(async () => []);

  public async *stream() {
    yield { content: '' };
  }
}

function resetWorkspace() {
  rmSync(workspaceRoot, { recursive: true, force: true });
  mkdirSync(join(workspaceRoot, 'orders'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'policies'), { recursive: true });
  writeFileSync(
    join(workspaceRoot, 'orders', `${orderId}.json`),
    JSON.stringify({
      orderId,
      productId: 'P-BT-001',
      status: 'delivered',
      receivedDaysAgo: 3,
    }),
    'utf8',
  );
  writeFileSync(join(workspaceRoot, 'policies', 'return-policy.md'), '签收 7 天内且商品完好可退货。', 'utf8');
}

describe('FilesystemService', () => {
  beforeEach(resetWorkspace);

  afterAll(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('executes a full read-read-write tool loop for an e-commerce ticket report', async () => {
    const toolModel = new FakeBusinessToolChatModel([
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_order',
            name: 'query_order',
            args: { orderId },
            type: 'tool_call',
          },
          {
            id: 'call_policy',
            name: 'read_file',
            args: { path: 'policies/return-policy.md' },
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_ticket',
            name: 'write_file',
            args: {
              path: 'tickets/EC20240315001-analysis.md',
              content: '订单 EC20240315001 签收 3 天，符合 7 天退货政策，可进入退货审核。',
            },
            type: 'tool_call',
          },
        ],
      }),
      new AIMessage('已写入退货判断工单。'),
    ]);
    const service = new FilesystemService((() => toolModel) as unknown as ChatModelFactory);

    const result = await service.fileChat('把退货判断结论写入 tickets/EC20240315001-analysis.md');

    expect(toolModel.bindTools).toHaveBeenCalledWith(businessTools);
    expect(toolModel.invoke).toHaveBeenCalledTimes(3);
    expect(result.content).toBe('已写入退货判断工单。');
    expect(result.toolCalls.map((item) => item.name)).toEqual(['query_order', 'read_file', 'write_file']);
    expect(result.toolResults).toEqual([
      expect.objectContaining({ id: 'call_order', name: 'query_order', content: expect.stringContaining(orderId) }),
      expect.objectContaining({
        id: 'call_policy',
        name: 'read_file',
        content: expect.stringContaining('7 天内'),
      }),
      expect.objectContaining({
        id: 'call_ticket',
        name: 'write_file',
        content: expect.stringContaining('"written":true'),
      }),
    ]);
    expect(readFileSync(join(workspaceRoot, 'tickets', 'EC20240315001-analysis.md'), 'utf8')).toContain(
      '符合 7 天退货政策',
    );

    const secondInvokeToolMessages = toolModel.seenMessages[1].filter(
      (message) => message instanceof ToolMessage,
    ) as ToolMessage[];
    expect(secondInvokeToolMessages).toHaveLength(2);
    expect(secondInvokeToolMessages[0].tool_call_id).toBe('call_order');
    expect(secondInvokeToolMessages[1].tool_call_id).toBe('call_policy');
  });

  it('returns the first model response when no tools are requested', async () => {
    const toolModel = new FakeBusinessToolChatModel([new AIMessage('无需调用工具。')]);
    const service = new FilesystemService((() => toolModel) as unknown as ChatModelFactory);

    await expect(service.fileChat('你好')).resolves.toEqual({
      content: '无需调用工具。',
      toolCalls: [],
      toolResults: [],
    });
  });
});
