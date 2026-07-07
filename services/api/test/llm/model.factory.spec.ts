import { normalizeOpenAiBaseUrl } from '../../src/llm/model.factory';

describe('model factory', () => {
  it('normalizes a Sub2API origin into an OpenAI-compatible v1 base URL', () => {
    expect(normalizeOpenAiBaseUrl('http://localhost:8080')).toBe('http://localhost:8080/v1');
  });

  it('keeps an explicit v1 base URL unchanged', () => {
    expect(normalizeOpenAiBaseUrl('http://localhost:8080/v1')).toBe('http://localhost:8080/v1');
  });

  it('removes trailing slashes before normalizing', () => {
    expect(normalizeOpenAiBaseUrl('http://localhost:8080///')).toBe('http://localhost:8080/v1');
  });
});
