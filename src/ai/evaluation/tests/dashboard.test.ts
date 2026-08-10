import test from 'node:test';
import assert from 'node:assert';
import { GET as getEvaluations } from '../../../app/api/evaluation/route';
import { PostgresEvaluationRepository, InMemoryEvaluationRepository } from '../storage/postgresEvaluationRepository';
import { EvaluationRepositoryFactory } from '../storage/repositoryFactory';
import { EvaluationResult, EvaluationStatus, EvaluationStage } from '../types';

test('Evaluation Dashboard & API Boundary Test Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string, extra: Record<string, any> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      userId,
      workspaceId,
      tenantId: 'tenant-a',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...extra
    })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  const sampleResult: EvaluationResult = {
    evaluationId: 'eval-runtime-test123',
    context: {
      requestId: 'req-prod-001',
      creatorId: 'user-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        inputPrompt: 'Write a script hook.',
        generatedContent: 'Here is a finance content draft',
        tenantId: 'tenant-a',
        workspaceId: 'ws-allowed',
        tokenUsage: { prompt: 100, completion: 150, total: 250 },
        estimatedCost: 0.0001
      }
    },
    status: EvaluationStatus.COMPLETED,
    metrics: [
      { metricId: 'relevance', name: 'Relevance', score: 85, weight: 1, confidence: 0.9, status: 'pass', reason: 'Directly on topic.' }
    ],
    overallScore: 85,
    decision: 'PASS',
    latencyMs: 820,
    createdAt: new Date().toISOString()
  };

  const pfSampleResult: EvaluationResult = {
    evaluationId: 'eval-pf-run-test456',
    context: {
      requestId: 'req-pf-test456',
      creatorId: 'eval-system-user',
      stage: EvaluationStage.GENERATION,
      provider: 'mock',
      model: 'mock-model',
      metadata: {
        datasetVersion: '1.0.0',
        passCount: 2,
        failCount: 0,
        totalCount: 2,
        failedCases: [],
        tenantId: 'tenant-a',
        workspaceId: 'ws-allowed',
        tokenUsage: { prompt: 200, completion: 300, total: 500 },
        estimatedCost: 0.0
      }
    },
    status: EvaluationStatus.COMPLETED,
    metrics: [],
    overallScore: 100,
    decision: 'PASS',
    latencyMs: 150,
    createdAt: new Date().toISOString()
  };

  await t.test('1. API authentication & RBAC protection', async () => {
    // 1.1 Missing token
    const req1 = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', { method: 'GET' });
    const res1 = await getEvaluations(req1);
    assert.strictEqual(res1.status, 401);

    // 1.2 Malformed token
    const req2 = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid-jwt' }
    });
    const res2 = await getEvaluations(req2);
    assert.strictEqual(res2.status, 401);
  });

  await t.test('2. Tenant and workspace IDOR boundary verification', async () => {
    // Allow workspace access to 'ws-allowed' but query 'ws-forbidden'
    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-forbidden', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Inconsistent workspace authorization/);
  });

  await t.test('3. Repository fallback mechanics & initialization resilience', async () => {
    const invalidRepo = new PostgresEvaluationRepository('invalid_connection_string');
    await invalidRepo.initialize();
    
    // Invalid connection string should fall back to memory store instead of crashing
    assert.ok((invalidRepo as any).fallback instanceof InMemoryEvaluationRepository);

    // Try saving record through fallback repository path
    await invalidRepo.save(sampleResult);
    const fetched = await invalidRepo.getById('eval-runtime-test123', 'tenant-a', 'ws-allowed');
    assert.ok(fetched);
    assert.strictEqual(fetched.overallScore, 85);
  });

  await t.test('4. API Sanitization safeguards', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    await memoryRepo.save(sampleResult);
    await memoryRepo.save(pfSampleResult);
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 200);

    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.strictEqual(list.length, 2);

    const sanitized = list.find((item: any) => item.evaluationId === 'eval-runtime-test123');
    assert.ok(sanitized);
    // Verified: critical metrics, scores, decision, tokens, latency, cost map cleanly
    assert.strictEqual(sanitized.decision, 'PASS');
    assert.strictEqual(sanitized.overallScore, 85);
    assert.strictEqual(sanitized.latencyMs, 820);
    assert.strictEqual(sanitized.tokenUsage.total, 250);
    assert.strictEqual(sanitized.estimatedCost, 0.0001);

    // VERIFY PROMPT AND GENERATED CONTENT ARE SECURELY STRIPPED AND REMOVED
    const responseString = JSON.stringify(sanitized);
    assert.ok(!responseString.includes('inputPrompt'));
    assert.ok(!responseString.includes('generatedContent'));
    assert.ok(!responseString.includes('Write a script hook'));
    assert.ok(!responseString.includes('Here is a finance content draft'));
  });

  await t.test('5. Promptfoo regression display & source segregation mapping', async () => {
    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const res = await getEvaluations(req);
    const list = await res.json();

    const pfRecord = list.find((item: any) => item.evaluationId === 'eval-pf-run-test456');
    assert.ok(pfRecord);
    assert.strictEqual(pfRecord.source, 'promptfoo');
    assert.strictEqual(pfRecord.overallScore, 100);
    assert.strictEqual(pfRecord.estimatedCost, 0.0);

    const runtimeRecord = list.find((item: any) => item.evaluationId === 'eval-runtime-test123');
    assert.ok(runtimeRecord);
    assert.strictEqual(runtimeRecord.source, 'runtime');
  });

  await t.test('6. Integration: Generate -> Evaluate -> Persist -> GET /api/evaluation', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    
    const testEvalResult: EvaluationResult = {
      evaluationId: 'eval-integration-test-999',
      context: {
        requestId: 'req-integration-test-999',
        creatorId: 'user-1',
        stage: EvaluationStage.GENERATION,
        provider: 'LLM-Judge',
        model: 'gemini-1.5-pro',
        metadata: {
          inputPrompt: 'Integration Prompt',
          generatedContent: 'Integration Output Content',
          tenantId: 'tenant-a',
          workspaceId: 'ws-allowed'
        }
      },
      status: EvaluationStatus.COMPLETED,
      metrics: [],
      overallScore: 92,
      decision: 'PASS',
      latencyMs: 120,
      createdAt: new Date().toISOString()
    };
    
    await memoryRepo.save(testEvalResult);

    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    
    const found = list.find((item: any) => item.evaluationId === 'eval-integration-test-999');
    assert.ok(found);
    assert.strictEqual(found.overallScore, 92);
    assert.strictEqual(found.context?.requestId, 'req-integration-test-999');
    assert.strictEqual(found.context?.metadata?.tenantId, undefined); // sensitive stripped
  });

  await t.test('7. Tenant and Workspace Isolation validation in repository & API', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    await memoryRepo.save(sampleResult);

    // Fetch using token from tenant-b
    const tokenB = createMockToken('user-2', 'ws-allowed', { tenantId: 'tenant-b', workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    
    const found = list.find((item: any) => item.evaluationId === 'eval-runtime-test123');
    assert.ok(!found);
  });

  await t.test('8. Robustness: Missing context or metadata normalization verification', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    
    // Save legacy mock result bypassing normal check constraints
    const mockRecord: any = {
      evaluationId: 'eval-legacy-malformed-777',
      context: {
        metadata: {
          tenantId: 'tenant-a',
          workspaceId: 'ws-allowed'
        }
      },
      status: EvaluationStatus.COMPLETED,
      metrics: [],
      overallScore: 80,
      latencyMs: 100,
      createdAt: new Date().toISOString()
    };
    (memoryRepo as any).records.set(mockRecord.evaluationId, mockRecord);
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const response = await getEvaluations(new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }));
    
    assert.strictEqual(response.status, 200);
    const list = await response.json();
    const found = list.find((item: any) => item.evaluationId === 'eval-legacy-malformed-777');
    assert.ok(found);
    assert.strictEqual(found.context?.requestId, 'N/A'); // normalized safely
  });

  await t.test('9. Evaluation Console Flow, Registry Decoupling, Failed Decisions Aggregation', async () => {
    // 9.1 Backend-API generation + default LLM-Judge evaluation provider resolution
    const { evaluationService } = await import('../services');
    const { LlmJudgeProvider } = await import('../providers');
    
    const context: any = {
      requestId: 'req-backend-api-test-111',
      creatorId: 'user-1',
      stage: EvaluationStage.GENERATION,
      provider: 'Backend-API',
      model: 'Backend-LLM',
      metadata: {
        inputPrompt: 'Tell me about anti-gravity',
        generatedContent: 'Antigravity is a concept of creating a place or object that is free from the force of gravity.',
        tenantId: 'tenant-a',
        workspaceId: 'ws-allowed'
      }
    };

    // We stub callLlmWithBackoff to return mock JSON instead of calling Google/Groq APIs directly
    const originalCallLlm = (LlmJudgeProvider.prototype as any).callLlmWithBackoff;
    let resolvedProviderName = '';
    let resolvedModelName = '';
    
    (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async function(provider: string, model: string) {
      resolvedProviderName = provider;
      resolvedModelName = model;
      return {
        text: JSON.stringify({
          relevance: { score: 9, confidence: 0.9, reason: 'Good relevance' },
          faithfulness: { score: 9, confidence: 0.9, reason: 'Good faithfulness' },
          creatorVoice: { score: 9, confidence: 0.9, reason: 'Good creatorVoice' },
          platformSuitability: { score: 9, confidence: 0.9, reason: 'Good platformSuitability' },
          engagement: { score: 9, confidence: 0.9, reason: 'Good engagement' },
          readability: { score: 9, confidence: 0.9, reason: 'Good readability' },
          actionability: { score: 9, confidence: 0.9, reason: 'Good actionability' },
          overallScore: 90
        }),
        resolvedModel: model
      };
    };

    try {
      const result = await evaluationService.evaluate(context);
      
      // Verification: Registry fallback successfully resolved LLM-Judge, which decoupled Backend-API to Gemini/gemini-1.5-pro
      assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(resolvedProviderName, 'Gemini');
      assert.strictEqual(resolvedModelName, 'gemini-1.5-pro');
      assert.strictEqual(result.overallScore, 90);
      assert.strictEqual(result.decision, 'PASS');
      assert.strictEqual(result.context.provider, 'Backend-API');
      assert.strictEqual(result.context.model, 'Backend-LLM');
      
      // 9.2 Evaluation provider failure representation (status FAILED, decision is undefined, overallScore is 0)
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async function() {
        throw new Error('API key missing or rate limit exceeded');
      };
      
      const failedResult = await evaluationService.evaluate(context);
      assert.strictEqual(failedResult.status, EvaluationStatus.FAILED);
      assert.strictEqual(failedResult.overallScore, 0);
      assert.strictEqual(failedResult.decision, undefined);
      assert.ok(failedResult.errorMessage?.includes('API key missing'));
      
      // 9.3 Aggregation & API mapping verification (Failed decision does not map to PASS, is excluded from decision metrics)
      const memoryRepo = new InMemoryEvaluationRepository();
      EvaluationRepositoryFactory.registerRepository(memoryRepo);
      
      // Save 1 passed evaluation and 1 failed evaluation
      await memoryRepo.save(result);
      await memoryRepo.save(failedResult);
      
      const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
      const response = await getEvaluations(new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }));
      
      assert.strictEqual(response.status, 200);
      const list = await response.json();
      
      const cleanPassed = list.find((item: any) => item.evaluationId === result.evaluationId);
      const cleanFailed = list.find((item: any) => item.evaluationId === failedResult.evaluationId);
      
      assert.ok(cleanPassed);
      assert.strictEqual(cleanPassed.decision, 'PASS');
      assert.strictEqual(cleanPassed.status, EvaluationStatus.COMPLETED);
      
      assert.ok(cleanFailed);
      assert.strictEqual(cleanFailed.decision, undefined); // Failed runs should carry undefined/null decision, not pass
      assert.strictEqual(cleanFailed.status, EvaluationStatus.FAILED);
      
    } finally {
      // Restore original function
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = originalCallLlm;
    }
  });

  await t.test('10. LLM-Judge Production Resilience & Credential Failures', async () => {
    const { evaluationService } = await import('../services');
    const { LlmJudgeProvider } = await import('../providers');

    const context: any = {
      requestId: 'req-prod-resilience-1',
      creatorId: 'user-1',
      stage: EvaluationStage.GENERATION,
      provider: 'Backend-API',
      model: 'Backend-LLM',
      metadata: {
        inputPrompt: 'Write a blog post about Vercel',
        generatedContent: 'Vercel is a cloud platform for static sites and Serverless Functions.',
        tenantId: 'tenant-a',
        workspaceId: 'ws-allowed'
      }
    };

    // 10.1 Missing credentials throws AUTHENTICATION_ERROR
    const originalApiKey = process.env.GEMINI_API_KEY;
    const originalGoogleKey = process.env.GOOGLE_API_KEY;
    const originalEvaluatorKey = process.env.EVALUATOR_API_KEY;

    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.EVALUATOR_API_KEY;

    try {
      const res = await evaluationService.evaluate(context);
      assert.strictEqual(res.status, EvaluationStatus.FAILED);
      assert.ok(res.errorMessage?.includes('[CONFIGURATION_ERROR]'), `Expected CONFIGURATION_ERROR prefix, got: ${res.errorMessage}`);
    } finally {
      if (originalApiKey) process.env.GEMINI_API_KEY = originalApiKey;
      if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
      if (originalEvaluatorKey) process.env.EVALUATOR_API_KEY = originalEvaluatorKey;
    }

    // 10.2 Deprecated model fallback resolution (gemini-1.0-pro -> gemini-1.5-flash)
    process.env.GEMINI_API_KEY = 'mock-key-value';
    process.env.EVALUATOR_MODEL = 'gemini-1.0-pro';
    process.env.EVALUATOR_FALLBACK_MODEL = 'gemini-1.5-flash';

    let requestUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init: any) => {
      requestUrls.push(url.toString());
      // Return 200 OK mock response for the fallback model
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                relevance: { score: 9, confidence: 0.9, reason: 'Good' },
                faithfulness: { score: 9, confidence: 0.9, reason: 'Good' },
                creatorVoice: { score: 9, confidence: 0.9, reason: 'Good' },
                platformSuitability: { score: 9, confidence: 0.9, reason: 'Good' },
                engagement: { score: 9, confidence: 0.9, reason: 'Good' },
                readability: { score: 9, confidence: 0.9, reason: 'Good' },
                actionability: { score: 9, confidence: 0.9, reason: 'Good' },
                overallScore: 90
              })
            }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const res = await evaluationService.evaluate(context);
      assert.strictEqual(res.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(res.context.metadata?.judgeModel, 'gemini-1.5-flash');
      assert.ok(requestUrls.some(u => u.includes('/models/gemini-1.5-flash')), `Expected request to use fallback gemini-1.5-flash, urls: ${requestUrls.join(', ')}`);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.EVALUATOR_MODEL;
      delete process.env.EVALUATOR_FALLBACK_MODEL;
      delete process.env.GEMINI_API_KEY;
    }

    // 10.3 Gemini 503 retry and backoff handling with error categorization
    process.env.GEMINI_API_KEY = 'mock-key-value';
    let callCount = 0;
    globalThis.fetch = async (url: any, init: any) => {
      callCount++;
      return new Response('Service Temporarily Unavailable', { status: 503 });
    };

    // We override setTimeout to avoid delays in tests
    const originalSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: any, delay: any) => fn();

    try {
      const res = await evaluationService.evaluate(context);
      assert.strictEqual(res.status, EvaluationStatus.FAILED);
      assert.strictEqual(callCount, 3); // 3 max attempts
      assert.ok(res.errorMessage?.includes('[UPSTREAM_503]'), `Expected UPSTREAM_503 prefix, got: ${res.errorMessage}`);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
      delete process.env.GEMINI_API_KEY;
    }

    // 10.4 Upstream model 404/400 fallback resolution
    process.env.GEMINI_API_KEY = 'mock-key-value';
    process.env.EVALUATOR_MODEL = 'gemini-1.5-pro';
    process.env.EVALUATOR_FALLBACK_MODEL = 'gemini-1.5-flash';

    let fallbackUrls: string[] = [];
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = url.toString();
      fallbackUrls.push(urlStr);
      if (urlStr.includes('/models/gemini-1.5-pro')) {
        return new Response('', { status: 404 }); // Return empty 404 to test fallback
      }
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                relevance: { score: 8, confidence: 0.8, reason: 'Good' },
                faithfulness: { score: 8, confidence: 0.8, reason: 'Good' },
                creatorVoice: { score: 8, confidence: 0.8, reason: 'Good' },
                platformSuitability: { score: 8, confidence: 0.8, reason: 'Good' },
                engagement: { score: 8, confidence: 0.8, reason: 'Good' },
                readability: { score: 8, confidence: 0.8, reason: 'Good' },
                actionability: { score: 8, confidence: 0.8, reason: 'Good' },
                overallScore: 80
              })
            }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const res = await evaluationService.evaluate(context);
      assert.strictEqual(res.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(res.context.metadata?.judgeModel, 'gemini-1.5-flash');
      assert.ok(fallbackUrls.some(u => u.includes('/models/gemini-1.5-pro')), 'Expected initial request to try gemini-1.5-pro');
      assert.ok(fallbackUrls.some(u => u.includes('/models/gemini-1.5-flash')), 'Expected fallback request to try gemini-1.5-flash');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.EVALUATOR_MODEL;
      delete process.env.EVALUATOR_FALLBACK_MODEL;
      delete process.env.GEMINI_API_KEY;
    }

    // 10.5 Primary and fallback models both unavailable -> immediate throw CONFIGURATION_ERROR without retry
    process.env.GEMINI_API_KEY = 'mock-key-value';
    process.env.EVALUATOR_MODEL = 'gemini-1.5-pro';
    process.env.EVALUATOR_FALLBACK_MODEL = 'gemini-1.5-flash';

    let bothUnavailableCalls = 0;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = url.toString();
      bothUnavailableCalls++;
      // Return 404 for both models
      return new Response('', { status: 404 });
    };

    try {
      const res = await evaluationService.evaluate(context);
      assert.strictEqual(res.status, EvaluationStatus.FAILED);
      assert.ok(res.errorMessage?.includes('[CONFIGURATION_ERROR]'), `Expected CONFIGURATION_ERROR prefix, got: ${res.errorMessage}`);
      assert.ok(res.errorMessage?.includes('Fallback model'), `Expected mentions of fallback failure, got: ${res.errorMessage}`);
      assert.strictEqual(bothUnavailableCalls, 4); // 4 candidate models tried in sequence, no repeated 3x retries!
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.EVALUATOR_MODEL;
      delete process.env.EVALUATOR_FALLBACK_MODEL;
      delete process.env.GEMINI_API_KEY;
    }

    // 10.6 ListModels filtering for generateContent
    process.env.GEMINI_API_KEY = 'real-style-api-key'; // Keep it not mock-api-key so listModels is called
    process.env.EVALUATOR_MODEL = 'gemini-nonexistent';
    process.env.EVALUATOR_FALLBACK_MODEL = 'gemini-fallback-nonexistent';

    let listModelsCalls = 0;
    let goodModelCalls = 0;
    let badModelCalls = 0;

    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('/models?key=')) {
        listModelsCalls++;
        return new Response(JSON.stringify({
          models: [
            { name: 'models/gemini-bad-model', supportedMethods: ['embedContent'] },
            { name: 'models/gemini-good-model', supportedMethods: ['generateContent'] }
          ]
        }), { status: 200 });
      }
      if (urlStr.includes('/models/gemini-good-model')) {
        goodModelCalls++;
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  relevance: { score: 8, confidence: 0.8, reason: 'Good' },
                  faithfulness: { score: 8, confidence: 0.8, reason: 'Good' },
                  creatorVoice: { score: 8, confidence: 0.8, reason: 'Good' },
                  platformSuitability: { score: 8, confidence: 0.8, reason: 'Good' },
                  engagement: { score: 8, confidence: 0.8, reason: 'Good' },
                  readability: { score: 8, confidence: 0.8, reason: 'Good' },
                  actionability: { score: 8, confidence: 0.8, reason: 'Good' },
                  overallScore: 80
                })
              }]
            }
          }]
        }), { status: 200 });
      }
      if (urlStr.includes('/models/gemini-bad-model')) {
        badModelCalls++;
      }
      return new Response('', { status: 404 });
    };

    try {
      const res = await evaluationService.evaluate(context);
      assert.strictEqual(res.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(res.context.metadata?.judgeModel, 'gemini-good-model');
      assert.strictEqual(listModelsCalls, 1);
      assert.strictEqual(goodModelCalls, 1);
      assert.strictEqual(badModelCalls, 0); // Must be filtered out and never called!
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.EVALUATOR_MODEL;
      delete process.env.EVALUATOR_FALLBACK_MODEL;
      delete process.env.GEMINI_API_KEY;
    }
  });
});
