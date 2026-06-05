import {
  BadRequestException,
  Injectable,
  type PipeTransform,
  UnprocessableEntityException,
} from '@nestjs/common';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const TEXT_EXTENSIONS = new Set(['.txt']);

@Injectable()
export class DocumentFilePipe implements PipeTransform<Express.Multer.File, Express.Multer.File> {
  transform(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      throw new UnprocessableEntityException('文件大小不能超过 10MB');
    }

    const extension = extensionOf(file.originalname);

    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return normalizeTextMime(file, extension);
    }

    if (file.mimetype === 'application/octet-stream') {
      if (MARKDOWN_EXTENSIONS.has(extension)) {
        file.mimetype = 'text/markdown';
        return file;
      }

      if (TEXT_EXTENSIONS.has(extension)) {
        file.mimetype = 'text/plain';
        return file;
      }
    }

    throw new UnprocessableEntityException(`不支持的文件类型: ${file.mimetype}`);
  }
}

function normalizeTextMime(file: Express.Multer.File, extension: string) {
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    file.mimetype = 'text/markdown';
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    file.mimetype = 'text/plain';
  }

  return file;
}

function extensionOf(filename: string) {
  const index = filename.lastIndexOf('.');

  return index >= 0 ? filename.slice(index).toLowerCase() : '';
}
