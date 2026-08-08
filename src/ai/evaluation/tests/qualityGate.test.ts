import test from 'node:test';
import assert from 'node:assert';
import { POST as postGenerate } from '../../../app/api/content/generate/route';
import { calculateDecision } from '../utils/decision';
import { featureFlags as evalFeatureFlags } from '../config/featureFlags';
import { evaluationThresholds } from '../config/thresholds';
import { LlmJudgeProvider } from '../providers';
import { traceEventBus } from '../../observability';
import { EvaluationStatus, EvaluationStage } from '../types';
import { EvaluationMiddleware, EvaluationRuntimeMiddleware } from '../../middleware/builtins';
import { apiClient } from '../../../lib/api-client';

test('Production Quality Gates & AI Evaluation Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string, extra: Record<string, any> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ userId, workspaceId, tenantId: 'tenant-test', exp: Math.floor(Date.now() / 1000) + 3600, ...extra })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  await t.test('1. Centralized Threshold & Decision Calculation Boundaries', () => {
    // 1.1 Expected metrics all PASS
    const scoresPass = { relevance: 90, grounding: 85, responseQuality: 95, contextUsage: 80, llmJudge: 90 };
    const decPass = calculateDecision(scoresPass, ['relevance', 'grounding', 'responseQuality', 'contextUsage', 'llmJudge']);
    assert.strictEqual(decPass, 'PASS');

    // 1.2 Warn boundary
    const scoresWarn = { relevance: 75, grounding: 85, responseQuality: 95, contextUsage: 80, llmJudge: 90 };
    const decWarn = calculateDecision(scoresWarn, ['relevance', 'grounding', 'responseQuality', 'contextUsage', 'llmJudge']);
    assert.strictEqual(decWarn, 'WARN');

    // 1.3 Fail boundary
    const scoresFail = { relevance: 55, grounding: 85, responseQuality: 95, contextUsage: 80, llmJudge: 90 };
    const decFail = calculateDecision(scoresFail, ['relevance', 'grounding', 'responseQuality', 'contextUsage', 'llmJudge']);
    assert.strictEqual(decFail, 'FAIL');

    // 1.4 Missing expected metric fails check
    const scoresMissing = { relevance: 90, responseQuality: 95 };
    const decMissing = calculateDecision(scoresMissing, ['relevance', 'grounding', 'responseQuality']);
    assert.strictEqual(decMissing, 'FAIL'); // missing 'grounding' fails evaluation!

    // 1.5 Clamped invalid configurations
    assert.ok(evaluationThresholds.relevance.fail >= 0 && evaluationThresholds.relevance.fail <= 100);
    assert.ok(evaluationThresholds.llmJudge.warn >= 0 && evaluationThresholds.llmJudge.warn <= 100);
  });

  await t.test('2. Quality Gate HTTP Status Code Routing', async () => {
    const originalBlock = evalFeatureFlags.BLOCK_ON_FAIL;
    const originalEval = evalFeatureFlags.EVAL_ENABLED;
    const originalGen = evalFeatureFlags.GENERATION_EVAL;

    evalFeatureFlags.EVAL_ENABLED = true;
    evalFeatureFlags.GENERATION_EVAL = true;
    evalFeatureFlags.BLOCK_ON_FAIL = true;

    const originalPost = apiClient.post;
    apiClient.post = async () => {
      return {
        data: {
          scriptDraft: 'Generated draft script',
          generatedContent: 'Generated draft script',
          content: 'Generated draft script'
        }
      } as any;
    };

    try {
      // Stub the API call or provider mock to return a failing score (<60 relevance)
      const token = createMockToken('user-1', 'ws-allowed', { activeWorkspaceId: 'ws-allowed' });
      
      const req = new Request('http://localhost/api/content/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: 'Quality Violation Draft',
          topic: 'Low score prompt triggering failure',
          workspaceId: 'ws-allowed'
        })
      });

      // Temporarily override evaluate to return a FAIL decision
      const DefaultEvaluationService = require('../services').DefaultEvaluationService;
      const originalEvaluate = DefaultEvaluationService.prototype.evaluate;
      DefaultEvaluationService.prototype.evaluate = async () => {
        return {
          evaluationId: 'eval-mock',
          status: EvaluationStatus.COMPLETED,
          metrics: [
            { metricId: 'relevance', name: 'Relevance', score: 30, weight: 1, confidence: 1, status: 'fail', reason: 'Too low' }
          ],
          overallScore: 30,
          decision: 'FAIL',
          createdAt: new Date().toISOString()
        };
      };

      try {
        const res = await postGenerate(req);
        // intentional quality rejections must be HTTP 422!
        assert.strictEqual(res.status, 422);
        const body = await res.json();
        assert.strictEqual(body.error, 'Content quality gate check failed.');
      } finally {
        DefaultEvaluationService.prototype.evaluate = originalEvaluate;
      }

    } finally {
      evalFeatureFlags.BLOCK_ON_FAIL = originalBlock;
      evalFeatureFlags.EVAL_ENABLED = originalEval;
      evalFeatureFlags.GENERATION_EVAL = originalGen;
      apiClient.post = originalPost;
    }
  });

  await t.test('3. Strict vs Fail-open Evaluator Runtime Failures', async () => {
    const token = createMockToken('user-1', 'ws-allowed', { activeWorkspaceId: 'ws-allowed' });

    const originalPost = apiClient.post;
    apiClient.post = async () => {
      return {
        data: {
          scriptDraft: 'Generated draft script',
          generatedContent: 'Generated draft script',
          content: 'Generated draft script'
        }
      } as any;
    };

    // Mock evaluation service to crash
    const DefaultEvaluationService = require('../services').DefaultEvaluationService;
    const originalEvaluate = DefaultEvaluationService.prototype.evaluate;
    DefaultEvaluationService.prototype.evaluate = async () => {
      return {
        evaluationId: 'eval-mock',
        status: EvaluationStatus.FAILED,
        metrics: [],
        overallScore: 0,
        errorMessage: 'Connection to LLM-Judge timed out',
        createdAt: new Date().toISOString()
      };
    };

    try {
      // 3.1 Strict mode active (STRICT_EVALUATION = true) -> Should block and yield HTTP 500 (sanitized)
      const originalStrict = evalFeatureFlags.STRICT_EVALUATION;
      const originalEval = evalFeatureFlags.EVAL_ENABLED;
      const originalGen = evalFeatureFlags.GENERATION_EVAL;
      evalFeatureFlags.EVAL_ENABLED = true;
      evalFeatureFlags.GENERATION_EVAL = true;
      evalFeatureFlags.STRICT_EVALUATION = true;

      try {
        const req = new Request('http://localhost/api/content/generate', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            title: 'Strict Quality Block Test',
            topic: 'Crash evaluate in strict mode',
            workspaceId: 'ws-allowed'
          })
        });

        const res = await postGenerate(req);
        assert.strictEqual(res.status, 500); // 500 for runtime crash
        const data = await res.json();
        assert.strictEqual(data.error, 'An error occurred during content generation.'); // sanitized!
      } finally {
        evalFeatureFlags.STRICT_EVALUATION = originalStrict;
        evalFeatureFlags.EVAL_ENABLED = originalEval;
        evalFeatureFlags.GENERATION_EVAL = originalGen;
      }

      // 3.2 Default Fail-open mode active (STRICT_EVALUATION = false) -> Should NOT block, yield HTTP 200
      const reqFailOpen = new Request('http://localhost/api/content/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: 'Fail Open Test',
          topic: 'Crash evaluate but pass through safely',
          workspaceId: 'ws-allowed'
        })
      });

      const resFailOpen = await postGenerate(reqFailOpen);
      assert.strictEqual(resFailOpen.status, 200);

    } finally {
      DefaultEvaluationService.prototype.evaluate = originalEvaluate;
      apiClient.post = originalPost;
    }
  });

  await t.test('4. LLM Judge Timeout and Markdown Stripping Sanitation', async () => {
    const provider = new LlmJudgeProvider();
    
    // Set API key to satisfy credentials check
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'mock-api-key-value';

    // Stub fetch to return a JSON inside a markdown wrapper
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: '```json\n{\n  "relevance": {"score": 9.5, "confidence": 0.95, "reason": "Good"},\n  "faithfulness": {"score": 8.0, "confidence": 0.90, "reason": "Valid"},\n  "creatorVoice": {"score": 9.0, "confidence": 0.85, "reason": "Good"},\n  "platformSuitability": {"score": 8.5, "confidence": 0.90, "reason": "Valid"},\n  "engagement": {"score": 9.0, "confidence": 0.88, "reason": "Good"},\n  "readability": {"score": 7.5, "confidence": 0.80, "reason": "Readable"},\n  "actionability": {"score": 8.0, "confidence": 0.85, "reason": "Strong"},\n  "overallScore": 9.0\n}\n```'
              }]
            }
          }]
        })
      } as any;
    };

    try {
      const mockContext = {
        requestId: 'req-clean',
        creatorId: 'u-1',
        stage: EvaluationStage.GENERATION,
        provider: 'Gemini',
        model: 'gemini-1.5-pro',
        metadata: {
          inputPrompt: 'topic test',
          generatedContent: 'Valid content text to evaluate'
        }
      };

      const result = await provider.execute(mockContext);
      assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(result.overallScore, 90); // scaled correctly!
      
      const relevanceMetric = result.metrics.find(m => m.metricId === 'relevance');
      assert.strictEqual(relevanceMetric?.score, 95); // 9.5 scaled to 95!

    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.GEMINI_API_KEY = originalApiKey;
      else delete process.env.GEMINI_API_KEY;
    }
  });

  await t.test('5. Telemetry & Decision Event Bus Propagation', async () => {
    let traceReceived = false;
    let decisionLogged: string | undefined = undefined;

    const listener = (event: any) => {
      if (event.component === 'EvaluationService' && event.status === 'completed') {
        traceReceived = true;
        decisionLogged = event.metadata?.decision;
      }
    };

    traceEventBus.subscribe(listener);

    const originalEval = evalFeatureFlags.EVAL_ENABLED;
    const originalGen = evalFeatureFlags.GENERATION_EVAL;

    evalFeatureFlags.EVAL_ENABLED = true;
    evalFeatureFlags.GENERATION_EVAL = true;

    try {
      const DefaultEvaluationService = require('../services').DefaultEvaluationService;
      const service = new DefaultEvaluationService();

      // Force evaluate run with a fake pass context
      const mockContext = {
        requestId: 'req-telemetry',
        creatorId: 'u-1',
        stage: EvaluationStage.GENERATION,
        provider: 'Custom-Rules',
        model: 'local-rules',
        metadata: {
          inputPrompt: 'topic',
          generatedContent: 'Length test longer than fifty characters to pass length metric constraints'
        }
      };

      await service.evaluate(mockContext);
      assert.strictEqual(traceReceived, true);
      assert.strictEqual(decisionLogged, 'PASS');
    } finally {
      evalFeatureFlags.EVAL_ENABLED = originalEval;
      evalFeatureFlags.GENERATION_EVAL = originalGen;
    }
  });

  await t.test('6. Duplicate Evaluation Bypass Protection', async () => {
    const evalServiceMock: any = {
      evaluate: async (ctx: any) => {
        return { status: 'COMPLETED', decision: 'PASS', metrics: [], overallScore: 100 } as any;
      }
    };

    const middleware = new EvaluationMiddleware(evalServiceMock);
    const runtimeMiddleware = new EvaluationRuntimeMiddleware();

    const mockCtx: any = {
      requestId: 'req-dup',
      traceId: 'trace-dup',
      stage: 'GENERATION',
      metadata: {}
    };

    const mockReq: any = { provider: 'gemini', model: 'gemini' };
    const mockRes: any = { content: 'test text content output' };

    // Primary middleware runs and sets context.metadata.evaluationCompleted = true
    await middleware.after(mockCtx, mockReq, mockRes);
    assert.strictEqual(mockCtx.metadata.evaluationCompleted, true);

    // Call dynamic runner suite: it should detect evaluationCompleted and return early (no-op)
    const oldRunSuite = (runtimeMiddleware as any).evaluationRunner;
    let runSuiteCalled = false;
    // Replace runner
    const mockRunner = {
      runSuite: async () => {
        runSuiteCalled = true;
        return { suiteId: '1' } as any;
      }
    };
    (runtimeMiddleware as any).evaluationRunner = mockRunner;

    try {
      await runtimeMiddleware.after(mockCtx, mockReq, mockRes);
      assert.strictEqual(runSuiteCalled, false); // Bypassed and did not execute duplicate run!
    } finally {
      (runtimeMiddleware as any).evaluationRunner = oldRunSuite;
    }
  });
});
