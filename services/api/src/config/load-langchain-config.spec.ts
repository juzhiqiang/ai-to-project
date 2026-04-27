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
        '  provider: openai',
        '  model: ep-wle31i-1770351442334904533',
        '  temperature: 0',
        '  maxTokens: 4096',
        'retrieval:',
        '  enabled: true',
        '  topK: 5',
        'tools:',
        '  enableConstraintCheck: true',
        '  enableEntityLookup: true',
        'features:',
        '  enableStructuredOutput: true',
        '  enableStreaming: true',
      ].join('\n'),
      'utf8',
    );

    const config = loadLangChainConfig();

    expect(config).toEqual({
      llm: {
        provider: 'openai',
        model: 'ep-wle31i-1770351442334904533',
        temperature: 0,
        maxTokens: 4096,
      },
      retrieval: {
        enabled: true,
        topK: 5,
      },
      tools: {
        enableConstraintCheck: true,
        enableEntityLookup: true,
      },
      features: {
        enableStructuredOutput: true,
        enableStreaming: true,
      },
    });
  });

  it.each([
    ['provider', ['llm:', '  model: test-model', '  temperature: 0', '  maxTokens: 4096']],
    ['model', ['llm:', '  provider: openai', '  temperature: 0', '  maxTokens: 4096']],
    ['temperature', ['llm:', '  provider: openai', '  model: test-model', '  maxTokens: 4096']],
    ['maxTokens', ['llm:', '  provider: openai', '  model: test-model', '  temperature: 0']],
  ])('throws when required llm.%s is missing', (field, lines) => {
    writeFileSync(
      configPath,
      [...lines, 'retrieval: {}', 'tools: {}', 'features: {}'].join('\n'),
      'utf8',
    );

    expect(() => loadLangChainConfig()).toThrow(`config.langchain.llm.${field} is required`);
  });
});
