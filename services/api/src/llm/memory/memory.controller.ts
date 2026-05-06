import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { RunnableMemoryService } from './runnable-memory.service';

interface MemoryChatDto {
  sessionId: string;
  input: string;
}

interface MemorySessionDto {
  sessionId?: string;
}

@Controller('api/memory')
export class MemoryController {
  constructor(private readonly memoryService: RunnableMemoryService) {}

  @Post('chat')
  chat(@Body() body: MemoryChatDto) {
    return this.memoryService.chat(body.sessionId, body.input);
  }

  @Get('history')
  async history(@Query('sessionId') querySessionId?: string, @Body() body?: MemorySessionDto) {
    const sessionId = getSessionId(querySessionId, body);
    const messages = await this.memoryService.getHistory(sessionId);

    return {
      sessionId,
      messages,
    };
  }

  @Delete('clear')
  async clear(@Query('sessionId') querySessionId?: string, @Body() body?: MemorySessionDto) {
    const sessionId = getSessionId(querySessionId, body);
    await this.memoryService.clearSession(sessionId);

    return {
      sessionId,
      cleared: true,
    };
  }
}

function getSessionId(querySessionId?: string, body?: MemorySessionDto) {
  return querySessionId ?? body?.sessionId ?? '';
}
