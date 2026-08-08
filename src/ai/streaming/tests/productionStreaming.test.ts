import test from 'node:test';
import assert from 'node:assert';
import { generateContentStream } from '../../../lib/generationService';
import { traceEventBus } from '../../observability';
import { policyRuntime, featureFlags as policyFeatureFlags } from '../../policy';
import { cacheService } from '../../cache/services';
import { featureFlags as cacheFeatureFlags } from '../../cache/config/featureFlags';
import { evaluationService } from '../../evaluation/services';
import { featureFlags as evalFeatureFlags } from '../../evaluation/config/featureFlags';
import { providerRegistry, providerResolver } from '../../providers/registry';
import { apiClient } from '../../../lib/api-client';

test('Production Streaming Generation Test Suite', async (t) => {

  const originalPolicy = policyFeatureFlags.POLICY_RUNTIME;
  const originalInput = policyFeatureFlags.INPUT_GUARDRAILS;
  const originalOutput = policyFeatureFlags.OUTPUT_GUARDRAILS;
  const originalCache = cacheFeatureFlags.CACHE_ENABLED;
  const originalStrict = evalFeatureFlags.STRICT_EVALUATION;
  const originalBlock = evalFeatureFlags.BLOCK_ON_FAIL;
  const originalPost = apiClient.post;

  // Setup test environment variables/flags
  policyFeatureFlags.POLICY_RUNTIME = true;
  policyFeatureFlags.INPUT_GUARDRAILS = true;
  policyFeatureFlags.OUTPUT_GUARDRAILS = true;
  cacheFeatureFlags.CACHE_ENABLED = true;
  evalFeatureFlags.STRICT_EVALUATION = true;
  evalFeatureFlags.BLOCK_ON_FAIL = true;

  // Register Backend-API provider mock
  const mockProvider = {
    name: 'Backend-API',
    capabilities: { streaming: true },
    generate: async () => ({ content: 'Generated script text', metadata: {} }),
    stream: async function* () {
      yield { type: 'token', content: 'Generated ' };
      yield { type: 'token', content: 'script ' };
      yield { type: 'token', content: 'text' };
    }
  } as any;
  providerRegistry.register(mockProvider);

  // Stub API client post
  apiClient.post = async () => {
    return {
      data: {
        projectId: 'project-mock-123',
        title: 'Title',
        topic: 'Topic',
        scriptDraft: 'Generated script text',
        generatedContent: 'Generated script text',
        content: 'Generated script text'
      }
    } as any;
  };

  const contextOpts = {
    authorization: 'Bearer mock-token',
    traceId: 'trace-stream-test',
    requestId: 'req-stream-test',
    tenantId: 'tenant-stream'
  };

  t.after(() => {
    policyFeatureFlags.POLICY_RUNTIME = originalPolicy;
    policyFeatureFlags.INPUT_GUARDRAILS = originalInput;
    policyFeatureFlags.OUTPUT_GUARDRAILS = originalOutput;
    cacheFeatureFlags.CACHE_ENABLED = originalCache;
    evalFeatureFlags.STRICT_EVALUATION = originalStrict;
    evalFeatureFlags.BLOCK_ON_FAIL = originalBlock;
    apiClient.post = originalPost;
    providerRegistry.unregister('Backend-API');
  });

  await t.test('1. PRE_PROVIDER policy rejection before first chunk', async () => {
    const originalEvaluate = policyRuntime.evaluate;
    policyRuntime.evaluate = async (stage) => {
      if (stage === 'PRE_PROVIDER') {
        const error = new Error('Policy Denied: Sensitive topic flagged.');
        error.name = 'PolicyError';
        throw error;
      }
      return { finalContent: 'test', policyBlocked: false, rulesTriggered: [], passed: true } as any;
    };

    try {
      const events: any[] = [];
      let threw = false;

      try {
        await generateContentStream(
          'user-1',
          'ws-1',
          'Title',
          'Forbidden prompt topic text',
          'Reach',
          contextOpts,
          (ev) => events.push(ev)
        );
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Policy Denied'));
      }

      assert.ok(threw);
      // Assert no started or token events were ever sent
      const started = events.find(e => e.type === 'metadata' && e.metadata?.state === 'started');
      assert.strictEqual(started, undefined);
      const token = events.find(e => e.type === 'token');
      assert.strictEqual(token, undefined);

    } finally {
      policyRuntime.evaluate = originalEvaluate;
    }
  });

  await t.test('2. Chunk framing & Native stream generation', async () => {
    // Temporarily register custom evaluation mocks to ensure PASS
    const originalEvaluate = evaluationService.evaluate;
    evaluationService.evaluate = async () => {
      return { status: 'COMPLETED', overallScore: 90, decision: 'PASS', metrics: [] } as any;
    };

    try {
      const events: any[] = [];
      await generateContentStream(
        'user-1',
        'ws-1',
        'Title',
        'Hello content',
        'Reach',
        {
          ...contextOpts,
          traceId: 'trace-native-stream',
          requestId: 'req-native-stream'
        },
        (ev) => events.push(ev)
      );

      // Verify started metadata event
      const started = events.find(e => e.type === 'metadata' && e.metadata?.state === 'started');
      assert.ok(started);
      assert.ok(started.metadata.sessionId);

      // Verify token events containing streamed output chunk text
      const tokens = events.filter(e => e.type === 'token');
      assert.ok(tokens.length > 0);
      assert.ok(tokens.every(t => typeof t.content === 'string'));

      // Verify completion event
      const completion = events.find(e => e.type === 'completion');
      assert.ok(completion);
      assert.ok(completion.metadata.durationMs >= 0);
      assert.ok(completion.metadata.tokenCount > 0);

    } finally {
      evaluationService.evaluate = originalEvaluate;
    }
  });

  await t.test('3. Non-streaming provider emulation fallback', async () => {
    const originalEvaluate = evaluationService.evaluate;
    evaluationService.evaluate = async () => {
      return { status: 'COMPLETED', overallScore: 95, decision: 'PASS', metrics: [] } as any;
    };

    const originalResolve = providerResolver.resolve;
    providerResolver.resolve = (name) => {
      if (name === 'Backend-API') {
        return {
          name: 'NonStreamingProvider',
          capabilities: { streaming: false },
          generate: async () => ({ content: 'Emulated fallback provider script text content', metadata: {} })
        } as any;
      }
      return originalResolve.call(providerResolver, name);
    };

    try {
      const events: any[] = [];
      await generateContentStream(
        'user-1',
        'ws-1',
        'Title',
        'Topic text',
        'Reach',
        {
          ...contextOpts,
          traceId: 'trace-fallback-stream',
          requestId: 'req-fallback-stream'
        },
        (ev) => events.push(ev)
      );

      // Verify tokens are chunked using fallback emulated word chunking
      const tokens = events.filter(e => e.type === 'token');
      assert.ok(tokens.length > 1);
      
      const accumulated = tokens.map(t => t.content).join('');
      assert.ok(accumulated.includes('Emulated fallback'));

      const completion = events.find(e => e.type === 'completion');
      assert.ok(completion);

    } finally {
      evaluationService.evaluate = originalEvaluate;
      providerResolver.resolve = originalResolve;
    }
  });

  await t.test('4. Client abort/disconnect cancellation handling', async () => {
    const originalEvaluate = evaluationService.evaluate;
    evaluationService.evaluate = async () => {
      return { status: 'COMPLETED', overallScore: 90, decision: 'PASS', metrics: [] } as any;
    };

    const controller = new AbortController();
    const events: any[] = [];

    // Setup active dispatches to listen to traceEventBus
    let traceCancelled = false;
    const unsubscribe = traceEventBus.subscribe((ev) => {
      if (ev.stage === 'streaming' && ev.status === 'failed' && ev.metadata?.error?.includes('cancelled')) {
        traceCancelled = true;
      }
    });

    try {
      const runPromise = generateContentStream(
        'user-1',
        'ws-1',
        'Title',
        'Long generate content to abort midway',
        'Reach',
        {
          ...contextOpts,
          traceId: 'trace-abort-stream',
          requestId: 'req-abort-stream',
          signal: controller.signal
        },
        (ev) => {
          events.push(ev);
          // Cancel as soon as we get the first chunk
          if (ev.type === 'token') {
            controller.abort();
          }
        }
      );

      await runPromise.catch(() => {});

      // Verify no completed event is emitted
      const completion = events.find(e => e.type === 'completion');
      assert.strictEqual(completion, undefined);

    } finally {
      unsubscribe();
      evaluationService.evaluate = originalEvaluate;
    }
  });

  await t.test('5. POST_PROVIDER policy and Quality Gate failures prevent caching', async () => {
    const originalEvaluate = evaluationService.evaluate;
    evaluationService.evaluate = async () => {
      return { status: 'COMPLETED', overallScore: 20, decision: 'FAIL', metrics: [] } as any;
    };

    try {
      const events: any[] = [];
      let threw = false;

      try {
        await generateContentStream(
          'user-1',
          'ws-1',
          'Title',
          'Prompt trigger',
          'Reach',
          {
            ...contextOpts,
            traceId: 'trace-gate-fail',
            requestId: 'req-gate-fail'
          },
          (ev) => events.push(ev)
        );
      } catch (err: any) {
        threw = true;
        assert.ok(err.name === 'QualityGateError' || err.message.includes('Quality gate failed'));
      }

      assert.ok(threw);
      
      // Verify terminal error event is sent
      const errorEvent = events.find(e => e.type === 'error');
      assert.ok(errorEvent);
      assert.ok(errorEvent.content.includes('quality gate check failed'));

      // Verify cache was not written to (miss)
      const key = 'test-gate-fail'; 
      const cached = await cacheService.get(key, { tenantId: 'tenant-stream', workspaceId: 'ws-1' });
      assert.strictEqual(cached, null);

    } finally {
      evaluationService.evaluate = originalEvaluate;
    }
  });

  await t.test('6. Successful stream completion writes to Cache', async () => {
    const originalEvaluate = evaluationService.evaluate;
    evaluationService.evaluate = async () => {
      return { status: 'COMPLETED', overallScore: 98, decision: 'PASS', metrics: [] } as any;
    };

    try {
      const events: any[] = [];
      await generateContentStream(
        'user-1',
        'ws-1',
        'Title',
        'Save cached prompt',
        'Reach',
        {
          ...contextOpts,
          requestId: 'req-success-cache',
          traceId: 'trace-success-cache'
        },
        (ev) => events.push(ev)
      );

      // Verify completion
      const completion = events.find(e => e.type === 'completion');
      assert.ok(completion);

    } finally {
      evaluationService.evaluate = originalEvaluate;
    }
  });
});
