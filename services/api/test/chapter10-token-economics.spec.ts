import {
  estimateGraphNodeCost,
  estimateTextTokens,
  getModelPricing,
} from '../src/llm/cost/token-estimator';

describe('chapter 10 token economics estimator', () => {
  it('returns zero tokens for empty values', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens(null as unknown as string)).toBe(0);
    expect(estimateTextTokens(undefined as unknown as string)).toBe(0);
  });

  it('counts Chinese text as non-zero token usage', () => {
    expect(estimateTextTokens('需求分析，包含中文标点。')).toBeGreaterThan(0);
  });

  it('estimates English text at roughly one token per four characters', () => {
    expect(estimateTextTokens('abcdefghijklmnop')).toBe(4);
    expect(estimateTextTokens('abcde')).toBe(2);
  });

  it('falls back unknown model pricing to gpt-4o-mini', () => {
    expect(getModelPricing('unknown-model')).toEqual(getModelPricing('gpt-4o-mini'));
  });

  it('estimates higher cost when tool schemas are included', () => {
    const baseInput = {
      nodeName: 'supervisor',
      modelName: 'gpt-4o-mini',
      systemPrompt: 'Route the requirement to experts.',
      messages: ['Analyze a CRM requirement.'],
      outputText: 'Use functional and risk experts.',
    };

    const withoutTools = estimateGraphNodeCost(baseInput);
    const withTools = estimateGraphNodeCost({
      ...baseInput,
      toolSchemas: [
        {
          name: 'handoff_to_functional_expert',
          description: 'Transfer analysis to the functional expert.',
          parameters: { type: 'object', properties: { reason: { type: 'string' } } },
        },
      ],
    });

    expect(withTools.inputTokens).toBeGreaterThan(withoutTools.inputTokens);
    expect(withTools.estimatedCostUsd).toBeGreaterThan(withoutTools.estimatedCostUsd);
  });

  it('charges output tokens with the model output price', () => {
    const result = estimateGraphNodeCost({
      nodeName: 'aggregator',
      modelName: 'gpt-4o-mini',
      systemPrompt: '',
      messages: [],
      outputText: 'abcdefghijklmnop',
    });

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(4);
    expect(result.estimatedCostUsd).toBe((4 * getModelPricing('gpt-4o-mini').output) / 1_000_000);
  });
});
