import * as fs from 'fs/promises';
import { DocumentParser } from './parser.interface';

export class TextParser implements DocumentParser {
  async parse(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('utf-8');
  }
}
