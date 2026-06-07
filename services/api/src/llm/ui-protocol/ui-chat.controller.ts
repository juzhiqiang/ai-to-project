import { Body, Controller, Post } from '@nestjs/common';
import { UIActionService } from './ui-action.service';
import { UIResponseService } from './ui-response.service';
import type { UIAction } from './ui-schemas';

interface UIChatDto {
  sessionId: string;
  input: string;
  history?: string[];
  context?: Record<string, unknown>;
}

interface UIActionDto {
  sessionId: string;
  action: UIAction;
}

/**
 * UI 聊天入口：
 * - chat：把自然语言输入转成结构化 UI 响应
 * - action：处理前端组件事件并返回下一步 UI
 */
@Controller('api/ui-chat')
export class UIChatController {
  constructor(
    private readonly uiResponseService: UIResponseService,
    private readonly uiActionService: UIActionService,
  ) {}

  /** POST /api/ui-chat/chat：模型驱动的 UI 响应生成。 */
  @Post('chat')
  chat(@Body() body: UIChatDto) {
    return this.uiResponseService.generateUIResponse(
      body.input,
      body.history,
      { ...(body.context ?? {}), sessionId: body.sessionId },
    );
  }

  /** POST /api/ui-chat/action：前端组件动作回传后的状态推进。 */
  @Post('action')
  action(@Body() body: UIActionDto) {
    return this.uiActionService.handleAction(body.action, { sessionId: body.sessionId });
  }
}
