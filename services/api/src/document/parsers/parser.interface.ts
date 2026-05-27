export interface DocumentParser {
  parse(filePath: string): Promise<string>;
}
