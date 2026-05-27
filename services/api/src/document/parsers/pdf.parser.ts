import * as fs from 'fs/promises';
import * as pdf from 'pdf-parse';
import { DocumentParser } from './parser.interface';

export class PdfParser implements DocumentParser {
  async parse(filePath: string): Promise<string> {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  }
}
