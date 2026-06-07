import { Module } from '@nestjs/common';
import { CHAT_MODEL_FACTORY, createChatModel } from '../model.factory';
import { UIActionHandler } from './ui-action.handler';
import { UIActionService } from './ui-action.service';
import { UIApiController } from './ui-api.controller';
import { UIChatController } from './ui-chat.controller';
import { UIFlowService } from './ui-flow.service';
import { UIResponseService } from './ui-response.service';

/**
 * UIProtocolModule 独立承载 6.0 的 UI 响应协议能力。
 * 这样后续前端协议演进时，可以只扩展本模块而不污染通用 LLM 控制器。
 */
@Module({
  controllers: [UIChatController, UIApiController],
  providers: [
    UIActionHandler,
    UIActionService,
    UIFlowService,
    UIResponseService,
    {
      provide: CHAT_MODEL_FACTORY,
      useValue: createChatModel,
    },
  ],
  exports: [UIActionHandler, UIActionService, UIFlowService, UIResponseService],
})
export class UIProtocolModule {}
