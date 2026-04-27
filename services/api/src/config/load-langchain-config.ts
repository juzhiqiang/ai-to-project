import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

export interface LangChainConfig {
  llm: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  retrieval: Record<string, unknown>;
  tools: Record<string, unknown>;
  features: Record<string, unknown>;
}

const configFilePath = join(process.cwd(), 'config', 'langchain.yaml');
const requiredLlmFields = ['provider', 'model', 'temperature', 'maxTokens'] as const;

export function loadLangChainConfig(filePath = configFilePath): LangChainConfig {
  const fileContent = readFileSync(filePath, 'utf8');
  const parsed = yaml.load(fileContent) as Partial<LangChainConfig> | undefined;
  const config = parsed ?? {};

  for (const field of requiredLlmFields) {
    const value = config.llm?.[field];

    if (value === undefined || value === null || value === '') {
      throw new Error(`config.langchain.llm.${field} is required`);
    }
  }

  return {
    llm: {
      provider: config.llm.provider,
      model: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
    },
    retrieval: config.retrieval ?? {},
    tools: config.tools ?? {},
    features: config.features ?? {},
  };
}
