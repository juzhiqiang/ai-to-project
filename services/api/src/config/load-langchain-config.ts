import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

export interface LangChainConfig {
  llm: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  retrieval: Record<string, unknown>;
  tools: Record<string, unknown>;
  features: Record<string, unknown>;
}

const configFilePath = join(process.cwd(), 'config', 'langchain.yaml');

export function loadLangChainConfig(filePath = configFilePath): LangChainConfig {
  const fileContent = readFileSync(filePath, 'utf8');
  const parsed = yaml.load(fileContent) as Partial<LangChainConfig> | undefined;
  const config = parsed ?? {};

  if (!config.llm?.model) {
    throw new Error('config.langchain.llm.model is required');
  }

  return {
    llm: {
      model: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
    },
    retrieval: config.retrieval ?? {},
    tools: config.tools ?? {},
    features: config.features ?? {},
  };
}
