import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLangChainConfig } from './load-langchain-config';

const configPath = join(process.cwd(), 'config', 'langchain.yaml');

describe('loadLangChainConfig', () => {
  let originalContent: string | null = null;

  beforeAll(() => {
    try {
      originalContent = readFileSync(configPath, 'utf8');
    } catch {
      originalContent = null;
    }
  });

  afterEach(() => {
    if (originalContent === null) {
      rmSync(configPath, { force: true });
      return;
    }

    writeFileSync(configPath, originalContent, 'utf8');
  });

  it('loads langchain runtime config from yaml', () => {
    writeFileSync(
      configPath,
      [
        'llm:',
        '  model: gpt-4o-mini',
        '  temperature: 0.2',
        '  maxTokens: 256',
        'retrieval:',
        '  topK: 4',
        'tools:',
        '  extraction: true',
        'features:',
        '  streaming: true',
      ].join('\n'),
      'utf8',
    );

    const config = loadLangChainConfig();

    expect(config).toEqual({
      llm: {
        model: 'gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 256,
      },
      retrieval: {
        topK: 4,
      },
      tools: {
        extraction: true,
      },
      features: {
        streaming: true,
      },
    });
  });

  it('throws when required llm.model is missing', () => {
    writeFileSync(
      configPath,
      ['llm:', '  temperature: 0.2', 'retrieval: {}', 'tools: {}', 'features: {}'].join('\n'),
      'utf8',
    );

    expect(() => loadLangChainConfig()).toThrow('config.langchain.llm.model is required');
  });
});
