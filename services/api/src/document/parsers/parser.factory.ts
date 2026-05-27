import { DocumentParser } from './parser.interface';
import { TextParser } from './text.parser';
import { PdfParser } from './pdf.parser';
import { DocxParser } from './docx.parser';
import { UnsupportedMediaTypeException } from '@nestjs/common';

export class ParserFactory {
  static getParser(mimeType: string): DocumentParser {
    switch (mimeType) {
      case 'text/plain':
      case 'text/markdown':
        return new TextParser();
      case 'application/pdf':
        return new PdfParser();
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return new DocxParser();
      default:
        throw new UnsupportedMediaTypeException(`不支持的文件类型: ${mimeType}`);
    }
  }
}
