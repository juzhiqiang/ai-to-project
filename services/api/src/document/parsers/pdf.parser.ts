import * as fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import { DocumentParser } from './parser.interface';

export class PdfParser implements DocumentParser {
  async parse(filePath: string): Promise<string> {
    const dataBuffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: dataBuffer });

    try {
      const data = await parser.getText();
      return data.text;
    } finally {
      await parser.destroy();
    }
  }
}
