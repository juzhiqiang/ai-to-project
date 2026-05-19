import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserIdGuard } from '../auth/user-id.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConversationService } from './conversation.service';
import { MessageService } from './message.service';
import { ConversationChatService } from './conversation-chat.service';

interface CreateConversationDto {
  title?: string;
}

interface ChatDto {
  input: string;
}

@UseGuards(UserIdGuard)
@Controller('api/conversations')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly chatService: ConversationChatService,
  ) {}

  /** POST / — 创建会话 */
  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateConversationDto) {
    return this.conversationService.create(userId, body.title);
  }

  /** GET / — 获取当前用户的全部会话列表 */
  @Get()
  findAll(@CurrentUser() userId: string) {
    return this.conversationService.findByUser(userId);
  }

  /** GET /:id/messages — 获取指定会话的消息历史 */
  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @CurrentUser() userId: string) {
    // 权限校验：确保会话属于当前用户
    await this.conversationService.findById(id, userId);
    const messages = await this.messageService.getHistory(id);
    return { conversationId: id, messages };
  }

  /** POST /:id/chat — 在指定会话中发送消息（RunnableWithMessageHistory 持久化） */
  @Post(':id/chat')
  async chat(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Body() body: ChatDto,
    @Res({ passthrough: true }) _res: Response,
  ) {
    // 权限校验
    await this.conversationService.findById(id, userId);
    return this.chatService.chat(id, body.input);
  }

  /** DELETE /:id — 删除会话（含级联消息） */
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.conversationService.delete(id, userId);
  }
}
