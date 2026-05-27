import * as mammoth from 'mammoth';
import { DocumentParser } from './parser.interface';

export class DocxParser implements DocumentParser {
  async parse(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
}
