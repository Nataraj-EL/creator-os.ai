import test from 'node:test';
import assert from 'node:assert';
import { evaluationService } from '../services';
import { EvaluationStage, EvaluationStatus } from '../types';
import { featureFlags } from '../config/featureFlags';

// Native fetch mock helper
const originalFetch = global.fetch;

function mockFetchResponse(status: number, responseText: string, ok: boolean = true) {
  global.fetch = (async (url: string, options: any) => {
    return {
      ok,
      status,
      text: async () => responseText,
      json: async () => JSON.parse(responseText)
    } as Response;
  }) as any;
}

function restoreFetch() {
  global.fetch = originalFetch;
}

test('AI Evaluation Platform Suite', async (t) => {
  
  await t.test('1. Feature Flag Disabled - should skip evaluation cleanly', async () => {
    // Ensure flags are false
    featureFlags.EVAL_ENABLED = false;
    featureFlags.GENERATION_EVAL = false;

    const context = {
      requestId: 'test-req-1',
      creatorId: 'creator-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'Test script content to analyze.'
      }
    };

    const result = await evaluationService.evaluate(context);
    assert.strictEqual(result.status, EvaluationStatus.SKIPPED);
    assert.strictEqual(result.overallScore, 0);
    assert.strictEqual(result.metrics.length, 0);
    assert.strictEqual(result.latencyMs, 0);
  });

  await t.test('2. Valid Evaluation - should score all metrics and return completed status', async () => {
    // Enable feature flags
    featureFlags.EVAL_ENABLED = true;
    featureFlags.GENERATION_EVAL = true;

    // Set temp api keys to bypass key validation
    process.env.GEMINI_API_KEY = 'test-mock-api-key';

    const mockResponse = {
      relevance: { score: 9, reason: 'Highly aligned' },
      faithfulness: { score: 8, reason: 'Accurate points' },
      creatorVoice: { score: 7, reason: 'Strong tone match' },
      platformSuitability: { score: 9, reason: 'Perfect for YouTube Reels' },
      engagement: { score: 8, reason: 'Good hook' },
      readability: { score: 9, reason: 'Simple syntax' },
      actionability: { score: 8, reason: 'Clear CTA' },
      overallScore: 85,
      confidence: 0.95,
      reasoning: 'The script performs strongly across all criteria.'
    };

    const mockGeminiResponse = {
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(mockResponse) }]
        }
      }]
    };

    mockFetchResponse(200, JSON.stringify(mockGeminiResponse));

    const context = {
      requestId: 'test-req-2',
      creatorId: 'creator-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'We are demonstrating CreatorOS features.'
      }
    };

    const result = await evaluationService.evaluate(context);
    
    assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
    assert.strictEqual(result.overallScore, 85);
    assert.strictEqual(result.metrics.length, 7);
    
    // Test a specific metric
    const relevanceMetric = result.metrics.find(m => m.metricId === 'relevance');
    assert.ok(relevanceMetric);
    assert.strictEqual(relevanceMetric.score, 90); // 9 * 10
    assert.strictEqual(relevanceMetric.status, 'pass');
    assert.strictEqual(relevanceMetric.confidence, 0.95);
    assert.strictEqual(relevanceMetric.reason, 'Highly aligned');

    // Test metadata inclusion
    assert.strictEqual(result.context.metadata?.judgeModel, 'gemini-1.5-pro');
    assert.strictEqual(result.context.metadata?.evaluationVersion, 'v1');
    assert.strictEqual(result.context.metadata?.judgePromptVersion, '1.0.0');

    restoreFetch();
  });

  await t.test('3. Invalid JSON Response - should retry and then complete if second attempt succeeds', async () => {
    featureFlags.EVAL_ENABLED = true;
    featureFlags.GENERATION_EVAL = true;
    process.env.GEMINI_API_KEY = 'test-mock-api-key';

    const mockSuccessResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              relevance: { score: 8, reason: 'Okay' },
              faithfulness: { score: 8, reason: 'Okay' },
              creatorVoice: { score: 8, reason: 'Okay' },
              platformSuitability: { score: 8, reason: 'Okay' },
              engagement: { score: 8, reason: 'Okay' },
              readability: { score: 8, reason: 'Okay' },
              actionability: { score: 8, reason: 'Okay' },
              overallScore: 80,
              confidence: 0.90,
              reasoning: 'Success after retry'
            })
          }]
        }
      }]
    };

    let callCount = 0;
    global.fetch = (async (url: string, options: any) => {
      callCount++;
      if (callCount === 1) {
        // Return malformed JSON first
        return {
          ok: true,
          status: 200,
          text: async () => 'Malformed JSON text output',
          json: async () => { throw new Error('JSON Parse Error'); }
        } as unknown as Response;
      } else {
        // Return successful response on second try
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(mockSuccessResponse),
          json: async () => mockSuccessResponse
        } as unknown as Response;
      }
    }) as any;

    const context = {
      requestId: 'test-req-3',
      creatorId: 'creator-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'Testing retry capabilities.'
      }
    };

    const result = await evaluationService.evaluate(context);
    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
    assert.strictEqual(result.overallScore, 80);

    restoreFetch();
  });

  await t.test('4. All Retries Fail (Malformed JSON) - should return failed status with ValidationError', async () => {
    featureFlags.EVAL_ENABLED = true;
    featureFlags.GENERATION_EVAL = true;
    process.env.GEMINI_API_KEY = 'test-mock-api-key';

    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        text: async () => 'Totally invalid output',
        json: async () => { throw new Error('Bad format'); }
      } as unknown as Response;
    }) as any;

    const context = {
      requestId: 'test-req-4',
      creatorId: 'creator-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'Content that triggers parser failures.'
      }
    };

    const result = await evaluationService.evaluate(context);
    assert.strictEqual(callCount, 3);
    assert.strictEqual(result.status, EvaluationStatus.FAILED);
    assert.ok(result.errorMessage?.includes('format') || result.errorMessage?.includes('JSON') || result.errorMessage?.includes('ValidationError'));

    restoreFetch();
  });

  await t.test('5. Provider Unavailable (HTTP 500) - should throw/return FAILED status', async () => {
    featureFlags.EVAL_ENABLED = true;
    featureFlags.GENERATION_EVAL = true;
    process.env.GEMINI_API_KEY = 'test-mock-api-key';

    let callCount = 0;
    global.fetch = (async () => {
      callCount++;
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      } as Response;
    }) as any;

    const context = {
      requestId: 'test-req-5',
      creatorId: 'creator-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        generatedContent: 'Test for backend network drop.'
      }
    };

    const result = await evaluationService.evaluate(context);
    assert.strictEqual(callCount, 3);
    assert.strictEqual(result.status, EvaluationStatus.FAILED);
    assert.ok(result.errorMessage?.includes('500') || result.errorMessage?.includes('Upstream'));

    restoreFetch();
  });

  // Cleanup environment variables
  delete process.env.GEMINI_API_KEY;
});
