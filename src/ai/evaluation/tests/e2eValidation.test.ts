import test from 'node:test';
import assert from 'node:assert';
import { POST as postGenerate } from '../../../app/api/content/generate/route';
import { evaluationService } from '../services';
import { PostgresEvaluationRepository, InMemoryEvaluationRepository } from '../storage/postgresEvaluationRepository';
import { EvaluationRepositoryFactory } from '../storage/repositoryFactory';
import { traceEventBus } from '../../observability';
import { providerResolver, providerRegistry } from '../../providers';
import { featureFlags as evalFeatureFlags } from '../config/featureFlags';
import { featureFlags as cacheFeatureFlags } from '../../cache/config/featureFlags';
import { featureFlags as providerFeatureFlags } from '../../providers/config/featureFlags';
import { policyRuntime, featureFlags as policyFeatureFlags } from '../../policy';
import { EvaluationStage, EvaluationStatus, EvaluationResult } from '../types';
import { CachingMiddleware } from '../../cache/middleware/cachingMiddleware';

test('Production E2E Validation & Integration Boundary Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string, extra: Record<string, any> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      userId,
      workspaceId,
      tenantId: 'tenant-e2e',
      exp: Math.floor(Date.now() / 1000) + 3600,
      workspaces: [workspaceId],
      ...extra
    })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  // Mocks setup
  let mockScore = 90;
  const originalEvalGet = (evaluationService as any).registry.get;
  (evaluationService as any).registry.get = (name: string) => {
    return {
      metadata: { name: 'LLM-Judge', supportedStages: [EvaluationStage.GENERATION] },
      execute: async (context: any) => ({
        evaluationId: `eval-mock-${Math.random().toString(36).substring(2, 7)}`,
        context,
        status: EvaluationStatus.COMPLETED,
        metrics: [
          { metricId: 'relevance', name: 'Relevance', score: mockScore, weight: 1, confidence: 0.95, status: mockScore >= 80 ? 'pass' : 'fail', reason: 'Mock evaluation score' }
        ],
        overallScore: mockScore,
        createdAt: new Date().toISOString()
      })
    } as any;
  };

  // Dynamic execution hooks
  let onGenerateHook: (() => void) | null = null;
  let onEvaluateHook: (() => void) | null = null;
  let onSaveHook: ((result: any) => void) | null = null;
  let onPublishHook: ((evt: any) => void) | null = null;

  const originalProviderResolve = providerResolver.resolve;
  providerResolver.resolve = (name: string) => {
    return {
      name: name || 'Backend-API',
      capabilities: { streaming: false },
      generate: async (req: any) => {
        if (onGenerateHook) onGenerateHook();
        return {
          content: 'Premium content script hook for technology topic.',
          model: 'gemini-1.5-pro',
          latencyMs: 80,
          retryCount: 0,
          metadata: { tokenUsage: { prompt: 40, completion: 60, total: 100 } }
        };
      }
    } as any;
  };

  const originalEvaluate = evaluationService.evaluate;
  evaluationService.evaluate = async function(context, config) {
    if (onEvaluateHook) onEvaluateHook();
    return originalEvaluate.call(this, context, config);
  };

  // Resolve active repository inside the default evaluation service
  const activeRepo = (evaluationService as any).repository;
  const originalSave = activeRepo.save;
  activeRepo.save = async function(result: any) {
    if (onSaveHook) onSaveHook(result);
    return originalSave.call(this, result);
  };

  const originalPublish = traceEventBus.publish;
  traceEventBus.publish = function(evtInput) {
    if (onPublishHook) onPublishHook(evtInput);
    return originalPublish.call(this, evtInput);
  };

  // Ensure policy runtime passes mock contents
  const originalPolicyEval = policyRuntime.evaluate;
  policyRuntime.evaluate = async (stage, content, context) => {
    return {
      stage,
      passed: true,
      originalContent: content,
      finalContent: content,
      modified: false,
      policyBlocked: false,
      rulesTriggered: [],
      requestId: context?.requestId || '',
      traceId: context?.traceId || '',
      creatorId: context?.creatorId || '',
      createdAt: new Date().toISOString()
    } as any;
  };

  await t.test('1. Verify pipeline execution order: Auth/RBAC → PRE_POLICY → Memory/Cache → Provider → POST_POLICY → Evaluation/Quality Gate → Persistence/Cache → Telemetry', async () => {
    const originalEvalGate = evalFeatureFlags.EVAL_ENABLED;
    const originalGenEval = evalFeatureFlags.GENERATION_EVAL;
    const originalBlock = evalFeatureFlags.BLOCK_ON_FAIL;
    const originalCache = cacheFeatureFlags.CACHE_ENABLED;
    const originalPolicy = policyFeatureFlags.POLICY_RUNTIME;
    const originalInput = policyFeatureFlags.INPUT_GUARDRAILS;
    const originalOutput = policyFeatureFlags.OUTPUT_GUARDRAILS;
    const originalProviders = providerFeatureFlags.PROVIDERS_ENABLED;

    evalFeatureFlags.EVAL_ENABLED = true;
    evalFeatureFlags.GENERATION_EVAL = true;
    evalFeatureFlags.BLOCK_ON_FAIL = true;
    cacheFeatureFlags.CACHE_ENABLED = true;
    policyFeatureFlags.POLICY_RUNTIME = true;
    policyFeatureFlags.INPUT_GUARDRAILS = true;
    policyFeatureFlags.OUTPUT_GUARDRAILS = true;
    providerFeatureFlags.PROVIDERS_ENABLED = true;
    mockScore = 95;

    const executionOrder: string[] = [];

    // Intercept CachingMiddleware methods to track ordering
    const originalBefore = CachingMiddleware.prototype.before;
    CachingMiddleware.prototype.before = async function(context, request) {
      executionOrder.push('Memory/Cache Check');
      return originalBefore.call(this, context, request);
    };

    const originalAfter = CachingMiddleware.prototype.after;
    CachingMiddleware.prototype.after = async function(context, request, response) {
      const res = await originalAfter.call(this, context, request, response);
      executionOrder.push('Cache Write');
      return res;
    };

    // Configure E2E hooks
    onGenerateHook = () => executionOrder.push('Provider Generation');
    onEvaluateHook = () => executionOrder.push('Evaluation/Quality Gate');
    onSaveHook = () => executionOrder.push('Persistence');
    onPublishHook = (evtInput) => {
      if (evtInput.component === 'TraceMiddleware' && evtInput.status === 'completed') {
        executionOrder.push('Telemetry completed');
      }
    };

    policyRuntime.evaluate = async (stage, content, context) => {
      executionOrder.push(stage === 'PRE_PROVIDER' ? 'PRE_POLICY' : 'POST_POLICY');
      return {
        stage,
        passed: true,
        originalContent: content,
        finalContent: content,
        modified: false,
        policyBlocked: false,
        rulesTriggered: [],
        requestId: context?.requestId || '',
        traceId: context?.traceId || '',
        creatorId: context?.creatorId || '',
        createdAt: new Date().toISOString()
      } as any;
    };

    const token = createMockToken('user-e2e', 'ws-e2e');
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Request-Id': 'req-order-test',
        'X-Trace-Id': 'trace-order-test'
      },
      body: JSON.stringify({
        title: 'Order validation test',
        topic: 'Verification topic details',
        primaryGoal: 'Reach',
        workspaceId: 'ws-e2e',
        stream: false
      })
    });

    try {
      const res = await postGenerate(req);
      assert.strictEqual(res.status, 200);

      // Verify the recorded execution flow matches exactly the runtime sorting order of middlewares
      assert.deepStrictEqual(executionOrder, [
        'Memory/Cache Check',
        'PRE_POLICY',
        'Provider Generation',
        'POST_POLICY',
        'Telemetry completed',
        'Cache Write',
        'Evaluation/Quality Gate',
        'Persistence'
      ]);

    } finally {
      // Restore middleware prototype and hooks
      CachingMiddleware.prototype.before = originalBefore;
      CachingMiddleware.prototype.after = originalAfter;
      policyRuntime.evaluate = originalPolicyEval;
      
      onGenerateHook = null;
      onEvaluateHook = null;
      onSaveHook = null;
      onPublishHook = null;

      evalFeatureFlags.EVAL_ENABLED = originalEvalGate;
      evalFeatureFlags.GENERATION_EVAL = originalGenEval;
      evalFeatureFlags.BLOCK_ON_FAIL = originalBlock;
      cacheFeatureFlags.CACHE_ENABLED = originalCache;
      policyFeatureFlags.POLICY_RUNTIME = originalPolicy;
      policyFeatureFlags.INPUT_GUARDRAILS = originalInput;
      policyFeatureFlags.OUTPUT_GUARDRAILS = originalOutput;
      providerFeatureFlags.PROVIDERS_ENABLED = originalProviders;
    }
  });

  await t.test('2. SSE Streaming path and Quality Gate blocking', async () => {
    const originalEvalGate = evalFeatureFlags.EVAL_ENABLED;
    const originalGenEval = evalFeatureFlags.GENERATION_EVAL;
    const originalBlock = evalFeatureFlags.BLOCK_ON_FAIL;
    const originalProviders = providerFeatureFlags.PROVIDERS_ENABLED;

    evalFeatureFlags.EVAL_ENABLED = true;
    evalFeatureFlags.GENERATION_EVAL = true;
    evalFeatureFlags.BLOCK_ON_FAIL = true;
    providerFeatureFlags.PROVIDERS_ENABLED = true;
    // Set score below threshold to trigger quality gate failure
    mockScore = 40;

    const token = createMockToken('user-e2e', 'ws-e2e');
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Request-Id': 'req-stream-fail',
        'X-Trace-Id': 'trace-stream-fail'
      },
      body: JSON.stringify({
        title: 'E2E Streaming Block Test',
        topic: 'Technology topic outline',
        primaryGoal: 'Reach',
        workspaceId: 'ws-e2e',
        stream: true
      })
    });

    const res = await postGenerate(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Type'), 'text/event-stream');

    const reader = res.body?.getReader();
    assert.ok(reader);

    const decoder = new TextDecoder();
    let receivedChunks = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedChunks += decoder.decode(value);
    }

    // Verify it contains error event because mockScore (40) is below threshold
    assert.ok(receivedChunks.includes('event: error'));
    assert.ok(receivedChunks.includes('Content quality gate check failed.'));

    evalFeatureFlags.EVAL_ENABLED = originalEvalGate;
    evalFeatureFlags.GENERATION_EVAL = originalGenEval;
    evalFeatureFlags.BLOCK_ON_FAIL = originalBlock;
    providerFeatureFlags.PROVIDERS_ENABLED = originalProviders;
  });

  await t.test('3. Security isolation & tenant IDOR validations', async () => {
    const token = createMockToken('user-e2e', 'ws-e2e', { workspaces: ['ws-e2e'] });

    // Attempting cross-workspace access (ws-forbidden is not in token allowed workspaces)
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Malicious Attempt',
        topic: 'Trying to sneak access',
        primaryGoal: 'Reach',
        workspaceId: 'ws-forbidden',
        stream: false
      })
    });

    const res = await postGenerate(req);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Inconsistent workspace authorization/);
  });

  await t.test('4. System resilience fallbacks (Neon/Database connection failure)', async () => {
    // Neon Postgres failure mock: database repository save throws error
    const originalSave = activeRepo.save;
    activeRepo.save = async () => {
      throw new Error('Neon Database connection timed out.');
    };

    const originalEvalGate = evalFeatureFlags.EVAL_ENABLED;
    const originalGenEval = evalFeatureFlags.GENERATION_EVAL;
    const originalProviders = providerFeatureFlags.PROVIDERS_ENABLED;

    evalFeatureFlags.EVAL_ENABLED = true;
    evalFeatureFlags.GENERATION_EVAL = true;
    providerFeatureFlags.PROVIDERS_ENABLED = true;
    mockScore = 95;

    const token = createMockToken('user-e2e', 'ws-e2e');
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Neon Failure Resilience Test',
        topic: 'Standard script topic',
        primaryGoal: 'Reach',
        workspaceId: 'ws-e2e',
        stream: false
      })
    });

    try {
      // The generation should complete successfully (fail-open database persistence log)
      const res = await postGenerate(req);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.strictEqual(body.content, 'Premium content script hook for technology topic.');
    } finally {
      activeRepo.save = originalSave;
      evalFeatureFlags.EVAL_ENABLED = originalEvalGate;
      evalFeatureFlags.GENERATION_EVAL = originalGenEval;
      providerFeatureFlags.PROVIDERS_ENABLED = originalProviders;
    }
  });

  await t.test('5. Valid production-style request with activeWorkspaceId, derived tenantId, missing workspaces list', async () => {
    const originalProviders = providerFeatureFlags.PROVIDERS_ENABLED;
    providerFeatureFlags.PROVIDERS_ENABLED = true;

    // A token modeled exactly like a production JWT token payload (has user id, role, activeWorkspaceId, derived tenantId, and NO workspaces list)
    const createProdToken = (userId: string, activeWorkspaceId: string): string => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({
        id: userId,
        role: 'CREATOR',
        email: 'creator@production.com',
        activeWorkspaceId,
        tenantId: 'production.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64');
      return `${header}.${payload}.signature`;
    };

    const token = createProdToken('prod-user-123', 'ws-prod-456');

    // Case A: Valid authorized request (workspace matches activeWorkspaceId)
    const reqValid = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Production generation title',
        topic: 'Verification topic details',
        primaryGoal: 'Reach',
        workspaceId: 'ws-prod-456',
        stream: false
      })
    });
    const resValid = await postGenerate(reqValid);
    assert.strictEqual(resValid.status, 200);

    // Case B: Unauthorized workspace (request workspace does not match activeWorkspaceId, and workspaces list is empty/missing)
    const reqInvalid = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Production generation title',
        topic: 'Verification topic details',
        primaryGoal: 'Reach',
        workspaceId: 'ws-prod-unauthorized',
        stream: false
      })
    });
    const resInvalid = await postGenerate(reqInvalid);
    assert.strictEqual(resInvalid.status, 403); // Forbidden

    providerFeatureFlags.PROVIDERS_ENABLED = originalProviders;
  });

  await t.test('6. Regression: Content Studio content generation integrity & Promptfoo isolation', async () => {
    const originalProviders = providerFeatureFlags.PROVIDERS_ENABLED;
    providerFeatureFlags.PROVIDERS_ENABLED = true;

    // Stub a mock provider to return specific non-empty content
    const testScriptText = 'Verified regression script content.';
    const mockProv = {
      name: 'Backend-API',
      capabilities: { streaming: false },
      generate: async () => ({
        content: testScriptText,
        model: 'Backend-LLM',
        metadata: { scriptDraft: testScriptText }
      })
    };
    providerRegistry.register(mockProv as any);

    // Track if evaluation executes
    let evalExecuted = false;
    const originalEvaluate = evaluationService.evaluate;
    evaluationService.evaluate = async (ctx) => {
      evalExecuted = true;
      // Return a PASS result, ensuring it does not mutate content
      return { status: 'COMPLETED', overallScore: 90, decision: 'PASS', metrics: [] } as any;
    };

    // Construct mock JWT token
    const createToken = (userId: string, activeWorkspaceId: string): string => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({
        id: userId,
        role: 'CREATOR',
        email: 'creator@regression.com',
        activeWorkspaceId,
        tenantId: 'regression.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64');
      return `${header}.${payload}.signature`;
    };

    const token = createToken('regress-user', 'ws-regress');

    const originalResolve = providerResolver.resolve;
    providerResolver.resolve = () => mockProv as any;

    try {
      // Trigger a standard non-streaming generation
      const req = new Request('http://localhost/api/content/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: 'Regression check title',
          topic: 'Regression topic details',
          primaryGoal: 'Reach',
          workspaceId: 'ws-regress',
          stream: false
        })
      });

      const response = await postGenerate(req);
      assert.strictEqual(response.status, 200);

      const body = await response.json();
      
      // 1. Assert content returned is non-empty and matching the generated provider content
      assert.strictEqual(body.scriptDraft, testScriptText);
      assert.strictEqual(body.content, testScriptText);
      
      // 2. Assert evaluation executed
      assert.ok(evalExecuted);

    } finally {
      providerRegistry.unregister('Backend-API');
      evaluationService.evaluate = originalEvaluate;
      providerResolver.resolve = originalResolve;
      providerFeatureFlags.PROVIDERS_ENABLED = originalProviders;
    }
  });

  // Restore global mocks
  (evaluationService as any).registry.get = originalEvalGet;
  providerResolver.resolve = originalProviderResolve;
  policyRuntime.evaluate = originalPolicyEval;
  evaluationService.evaluate = originalEvaluate;
  activeRepo.save = originalSave;
  traceEventBus.publish = originalPublish;
});
