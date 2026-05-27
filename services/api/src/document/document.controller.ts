import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { ChunkService } from './chunk.service';
import { UserIdGuard } from '../auth/user-id.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(UserIdGuard)
@Controller('api/documents')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly chunkService: ChunkService
  ) { }

  /**
   * 上传文件
   * 限制大小：10MB
   * 限制类型：txt, md, pdf
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          // 支持 text/plain, text/markdown, application/pdf, doc, docx
          fileType: /(text\/plain|text\/markdown|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/,
        })
        .addMaxSizeValidator({
          maxSize: 10 * 1024 * 1024, // 10 MB
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    return this.documentService.upload(userId, file);
  }

  /**
   * 触发文件解析与分块
   */
  @Post(':id/process')
  process(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.chunkService.chunkDocument(id, userId);
  }

  /**
   * 获取当前用户的所有文档列表
   */
  @Get()
  findAll(@CurrentUser() userId: string) {
    return this.documentService.findByUser(userId);
  }

  /**
   * 获取文档详情
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.documentService.findById(id, userId);
  }

  /**
   * 删除文档
   */
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.documentService.delete(id, userId);
  }
}
