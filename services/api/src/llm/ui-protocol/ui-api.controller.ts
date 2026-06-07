import { Body, Controller, Post } from '@nestjs/common';
import { UIActionHandler } from './ui-action.handler';
import type { UIAction } from './ui-schemas';

interface UIApiActionDto {
  sessionId: string;
  action: UIAction;
}

@Controller('api/ui-api')
export class UIApiController {
  constructor(private readonly uiActionHandler: UIActionHandler) {}

  /** POST /api/ui-api/action：6.1 交互闭环动作入口。 */
  @Post('action')
  action(@Body() body: UIApiActionDto) {
    return this.uiActionHandler.handle(body.action, { sessionId: body.sessionId });
  }
}
