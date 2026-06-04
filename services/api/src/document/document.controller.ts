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
  HttpStatus,
  HttpCode,
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
          // 纯文本（txt/md）没有 magic number，file-type 无法识别 → 检测不出时回退到
          // 请求声明的 mimetype 比较；pdf/doc/docx 仍走 magic number 内容校验。
          fallbackToMimetype: true,
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
  @HttpCode(HttpStatus.ACCEPTED)
  async process(@Param('id') id: string, @CurrentUser() userId: string) {
    // 先同步校验文档存在且属于当前用户（立即反馈 404/403）
    await this.documentService.findById(id, userId);

    // 异步触发向量化，立即返回 202 Accepted；处理进度通过 SSE (/api/sse) 推送
    void this.chunkService.chunkDocument(id, userId).catch((err) => {
      console.error(`后台向量化任务失败 doc=${id}:`, err);
    });

    return {
      accepted: true,
      documentId: id,
      message: '文档处理已开始，请通过 /api/sse 监听处理进度',
    };
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
