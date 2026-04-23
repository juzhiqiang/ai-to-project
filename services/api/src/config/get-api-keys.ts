export interface ApiKeys {
  openAiApiKey: string;
  openAiBaseUrl: string;
  embeddingApiKey: string;
  vectorDbUrl: string;
  vectorDbApiKey: string;
}

const requiredEnvVars = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'EMBEDDING_API_KEY',
  'VECTOR_DB_URL',
  'VECTOR_DB_API_KEY',
] as const;

export function getApiKeys(env: NodeJS.ProcessEnv = process.env): ApiKeys {
  for (const key of requiredEnvVars) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    openAiApiKey: env.OPENAI_API_KEY!,
    openAiBaseUrl: env.OPENAI_BASE_URL!,
    embeddingApiKey: env.EMBEDDING_API_KEY!,
    vectorDbUrl: env.VECTOR_DB_URL!,
    vectorDbApiKey: env.VECTOR_DB_API_KEY!,
  };
}
