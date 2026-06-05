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

@Controller('api/ui-chat')
export class UIChatController {
  constructor(
    private readonly uiResponseService: UIResponseService,
    private readonly uiActionService: UIActionService,
  ) {}

  @Post('chat')
  chat(@Body() body: UIChatDto) {
    return this.uiResponseService.generateUIResponse(
      body.input,
      body.history,
      { ...(body.context ?? {}), sessionId: body.sessionId },
    );
  }

  @Post('action')
  action(@Body() body: UIActionDto) {
    return this.uiActionService.handleAction(body.action, { sessionId: body.sessionId });
  }
}
