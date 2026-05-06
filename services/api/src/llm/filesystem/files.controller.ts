import { Body, Controller, Post } from '@nestjs/common';
import { FilesystemService } from './filesystem.service';

interface FileChatDto {
  input: string;
}

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Post('file-chat')
  fileChat(@Body() body: FileChatDto) {
    return this.filesystemService.fileChat(body.input);
  }
}
