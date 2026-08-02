import test from 'node:test';
import assert from 'node:assert';
import { apiClient } from '../../../lib/api-client';
import { generateContent } from '../../../lib/generationService';
import { evaluationService } from '../../evaluation/services';
import { evaluationRegistry } from '../../evaluation/providers';
import { featureFlags } from '../../evaluation/config/featureFlags';
import { EvaluationStatus } from '../../evaluation/types';

test('AI Generation Middleware Integration Suite', async (t) => {
  // Store original methods to restore them after each test
  const originalPost = apiClient.post;
  const originalEvaluate = evaluationService.evaluate;

  // Track original feature flag state
  const originalFlagEnabled = featureFlags.EVAL_ENABLED;
  const originalFlagGen = featureFlags.GENERATION_EVAL;

  t.afterEach(() => {
    apiClient.post = originalPost;
    evaluationService.evaluate = originalEvaluate;
    featureFlags.EVAL_ENABLED = originalFlagEnabled;
    featureFlags.GENERATION_EVAL = originalFlagGen;
  });

  await t.test('1. Unchanged Output & Header Propagation', async () => {
    let capturedConfig: any = null;

    // Stub the backend Axios API call
    apiClient.post = async (url: string, data: any, config: any) => {
      capturedConfig = config;
      return {
        data: {
          projectId: 'proj-123',
          scriptDraft: 'Mocked script draft content.'
        }
      } as any;
    };

    const res = await generateContent('creator-1', 'ws-1', 'Title', 'Topic', 'Goal');

    // Verify response matches backend payload structure
    assert.strictEqual(res.data.projectId, 'proj-123');
    assert.strictEqual(res.data.scriptDraft, 'Mocked script draft content.');

    // Assert request IDs were injected as headers
    assert.ok(capturedConfig);
    assert.ok(capturedConfig.headers['X-Request-Id']);
    assert.ok(capturedConfig.headers['X-Trace-Id']);
  });

  await t.test('2. Evaluation Flag Check - skips when flag is false', async () => {
    featureFlags.EVAL_ENABLED = true;
    featureFlags.GENERATION_EVAL = false;

    let providerCalled = false;
    const defaultProvider = evaluationRegistry.defaultProvider();
    const originalEvaluateProvider = defaultProvider.evaluate;
    
    // Spy on the active provider evaluate call
    defaultProvider.evaluate = async () => {
      providerCalled = true;
      return { status: EvaluationStatus.COMPLETED } as any;
    };

    apiClient.post = async () => ({
      data: { scriptDraft: 'Mock draft' }
    } as any);

    await generateContent('creator-1', 'ws-1', 'Title', 'Topic', 'Goal');
    
    // Give async task loop time to execute
    await new Promise(r => setTimeout(r, 20));
    
    // Restore provider method
    defaultProvider.evaluate = originalEvaluateProvider;

    assert.strictEqual(providerCalled, false);
  });

  await t.test('3. Evaluation Fail-Open - evaluation throws but generation succeeds', async () => {
    featureFlags.EVAL_ENABLED = true;
    featureFlags.GENERATION_EVAL = true;

    // Evaluation throws a fatal runtime exception
    evaluationService.evaluate = async () => {
      throw new Error('LLM Judge API rate limit reached (HTTP 429)');
    };

    apiClient.post = async () => ({
      data: { scriptDraft: 'Important script output draft' }
    } as any);

    // Call generateContent - should run to completion and not bubble the exception
    const res = await generateContent('creator-1', 'ws-1', 'Title', 'Topic', 'Goal');

    // Assert that the script draft still returned successfully
    assert.strictEqual(res.data.scriptDraft, 'Important script output draft');
  });
});
