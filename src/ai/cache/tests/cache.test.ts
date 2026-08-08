import test from 'node:test';
import assert from 'node:assert';
import { cacheService, DefaultAICache } from '../services';
import { CachingMiddleware } from '../middleware/cachingMiddleware';
import { featureFlags } from '../config/featureFlags';
import { buildCacheKey } from '../utils/key';
import { traceEventBus } from '../../observability';
import { MiddlewareAction, AIResponse } from '../../middleware/types';
import { policyRuntime, featureFlags as policyFeatureFlags } from '../../policy';

test('Production AI Caching & Performance Test Suite', async (t) => {

  await t.test('1. Cache Hit, Miss, and TTL Expirations', async () => {
    const originalEnabled = featureFlags.CACHE_ENABLED;
    featureFlags.CACHE_ENABLED = true;

    try {
      const key = 'test-hit-miss-key';
      const cacheOpts = { tenantId: 'tenant-1', workspaceId: 'ws-1', ttlSeconds: 1 };

      // 1.1 Miss
      await cacheService.delete(key, cacheOpts);
      const val1 = await cacheService.get<string>(key, cacheOpts);
      assert.strictEqual(val1, null);

      // 1.2 Set and Hit
      await cacheService.set(key, 'cached-value', cacheOpts);
      const val2 = await cacheService.get<string>(key, cacheOpts);
      assert.strictEqual(val2, 'cached-value');

      // 1.3 TTL Expiration
      await new Promise(r => setTimeout(r, 1100)); // wait for 1.1s
      const val3 = await cacheService.get<string>(key, cacheOpts);
      assert.strictEqual(val3, null); // expired

    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
    }
  });

  await t.test('2. Tenant and Workspace Scope Isolation Constraints', () => {
    const contextOk = { tenantId: 'tenant-a', workspaceId: 'ws-a', creatorId: 'user-1' };
    const request = { provider: 'Gemini', model: 'gemini-1.5', prompt: 'hello', inputs: {} };

    // 2.1 Success with valid contexts
    const key1 = buildCacheKey(contextOk, request, 'v1');
    assert.ok(key1.includes('tenant-a'));
    assert.ok(key1.includes('ws-a'));

    // 2.2 Reject missing tenant/workspace context
    assert.throws(() => {
      buildCacheKey({ workspaceId: 'ws-a' }, request);
    }, /Invalid tenant\/workspace context/);

    assert.throws(() => {
      buildCacheKey({ tenantId: 'default', workspaceId: 'ws-a' }, request);
    }, /Invalid tenant\/workspace context/);

    assert.throws(() => {
      buildCacheKey({ tenantId: 'tenant-a', workspaceId: 'default' }, request);
    }, /Invalid tenant\/workspace context/);
  });

  await t.test('3. Key Uniqueness under Prompt/Model/Version segments', () => {
    const context = { tenantId: 'tenant-a', workspaceId: 'ws-a', creatorId: 'user-1' };
    const req1 = { provider: 'Gemini', model: 'gemini-1.5', prompt: 'generate text' };
    const req2 = { provider: 'Gemini', model: 'gemini-1.5', prompt: 'generate text', options: { temperature: 0.7 } };
    const req3 = { provider: 'Gemini', model: 'gemini-2.0', prompt: 'generate text' };

    const k1 = buildCacheKey(context, req1, 'v1');
    const k2 = buildCacheKey(context, req2, 'v1');
    const k3 = buildCacheKey(context, req3, 'v1');
    const k4 = buildCacheKey(context, req1, 'v2');

    assert.notStrictEqual(k1, k2); // option hash separation
    assert.notStrictEqual(k1, k3); // model separation
    assert.notStrictEqual(k1, k4); // version separation
  });

  await t.test('4. Caching Disabled State Preservation', async () => {
    const originalEnabled = featureFlags.CACHE_ENABLED;
    featureFlags.CACHE_ENABLED = false;

    try {
      const key = 'test-disabled';
      const cacheOpts = { tenantId: 'tenant-1', workspaceId: 'ws-1' };

      await cacheService.set(key, 'do-not-save', cacheOpts);
      const val = await cacheService.get(key, cacheOpts);
      assert.strictEqual(val, null); // bypasses and returns null when disabled

    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
    }
  });

  await t.test('5. Redis Disconnection Graceful Fallback', async () => {
    // Instantiate a cache service instance with a bad Redis URL
    const badCache = new DefaultAICache('redis://default:wrongpass@127.0.0.1:9999');
    
    const originalEnabled = featureFlags.CACHE_ENABLED;
    featureFlags.CACHE_ENABLED = true;

    try {
      const key = 'test-fallback';
      const cacheOpts = { tenantId: 'tenant-1', workspaceId: 'ws-1' };

      // Cache set should fail-open and complete using memory cache
      await badCache.set(key, 'memory-fallback-success', cacheOpts);
      const val = await badCache.get<string>(key, cacheOpts);
      assert.strictEqual(val, 'memory-fallback-success');

    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
      await badCache.clear();
    }
  });

  await t.test('6. Bounded Memory Cache size cap and pruning', async () => {
    const originalEnabled = featureFlags.CACHE_ENABLED;
    featureFlags.CACHE_ENABLED = true;

    // Create a default cache service with process env REDIS_URL disabled to enforce memory mode
    const badCache = new DefaultAICache();

    try {
      const cacheOpts = { tenantId: 'tenant-1', workspaceId: 'ws-1', ttlSeconds: 3600 };
      
      // Load 1005 items to exceed the 1000 boundary size limit
      for (let i = 0; i < 1005; i++) {
        await badCache.set(`bounded-key-${i}`, `val-${i}`, cacheOpts);
      }

      // Check size boundary: First items should be evicted to cap at 1000
      const oldestVal = await badCache.get('bounded-key-0', cacheOpts);
      assert.strictEqual(oldestVal, null); // evicted

      const newestVal = await badCache.get('bounded-key-1004', cacheOpts);
      assert.strictEqual(newestVal, 'val-1004'); // preserved

    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
      await badCache.clear();
    }
  });

  await t.test('7. Non-cacheable Request Restrictions', async () => {
    const middleware = new CachingMiddleware();
    const mockCtx: any = {
      requestId: 'req-cacheable',
      traceId: 'trace-cacheable',
      creatorId: 'user-1',
      pipeline: 'generation',
      metadata: { tenantId: 't-1', workspaceId: 'ws-1' }
    };

    // 7.1 Non-deterministic request (temp > 0 and no explicit cache flag) is not cached
    const nonDetReq: any = { provider: 'Gemini', model: 'gemini', prompt: 'test', options: { temperature: 0.7 } };
    const act1 = await middleware.before(mockCtx, nonDetReq);
    assert.strictEqual(act1, undefined); // ignored

    // 7.2 Explicitly marked cacheable works even with temp > 0
    const explicitReq: any = { provider: 'Gemini', model: 'gemini', prompt: 'test', options: { temperature: 0.7, cache: true } };
    
    const originalEnabled = featureFlags.CACHE_ENABLED;
    featureFlags.CACHE_ENABLED = true;
    try {
      // Invalidate if key exists to prevent cache hits
      const key = buildCacheKey({ tenantId: 't-1', workspaceId: 'ws-1', creatorId: 'user-1' }, explicitReq);
      await cacheService.delete(key);

      const act2 = await middleware.before(mockCtx, explicitReq);
      assert.strictEqual(act2, undefined); // continues and registers single-flight
      
      // Clean up single flight promise
      await middleware.finally(mockCtx, explicitReq);
    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
    }
  });

  await t.test('8. Cache Hit Middleware Lifecycle and Policy Checks', async () => {
    const middleware = new CachingMiddleware();
    const originalEnabled = featureFlags.CACHE_ENABLED;
    const originalPolicy = policyFeatureFlags.POLICY_RUNTIME;
    const originalOutput = policyFeatureFlags.OUTPUT_GUARDRAILS;

    featureFlags.CACHE_ENABLED = true;
    policyFeatureFlags.POLICY_RUNTIME = true;
    policyFeatureFlags.OUTPUT_GUARDRAILS = true;

    try {
      const mockCtx: any = {
        requestId: 'req-hit-lifecycle',
        traceId: 'trace-hit-lifecycle',
        creatorId: 'user-1',
        pipeline: 'generation',
        metadata: { tenantId: 't-1', workspaceId: 'ws-1' }
      };

      const request: any = { provider: 'Gemini', model: 'gemini', prompt: 'test prompt content', options: { temperature: 0 } };
      const key = buildCacheKey({ tenantId: 't-1', workspaceId: 'ws-1', creatorId: 'user-1' }, request);

      // Write mock result to cache
      const mockResponse: AIResponse = {
        content: 'Clean cached generation text',
        metadata: { cached: true }
      };
      await cacheService.set(key, mockResponse, { tenantId: 't-1', workspaceId: 'ws-1' });

      // Mock policy evaluate to sanitize content
      const originalEvaluate = policyRuntime.evaluate;
      policyRuntime.evaluate = async (stage, content, context) => {
        assert.strictEqual(stage, 'POST_PROVIDER');
        assert.strictEqual(content, 'Clean cached generation text');
        return {
          stage,
          passed: true,
          originalContent: content,
          finalContent: 'Sanitized cached content text',
          modified: true,
          policyBlocked: false,
          rulesTriggered: [],
          requestId: context?.requestId || '',
          traceId: context?.traceId || '',
          creatorId: context?.creatorId || '',
          createdAt: new Date().toISOString()
        } as any;
      };

      try {
        const action = await middleware.before(mockCtx, request);
        assert.strictEqual(action, MiddlewareAction.STOP);
        assert.strictEqual(mockCtx.metadata.cacheHit, true);
        assert.strictEqual(mockCtx.metadata.evaluationCompleted, true);
        
        // Assert content was evaluated and modified
        assert.strictEqual(mockCtx.metadata.response.content, 'Sanitized cached content text');
      } finally {
        policyRuntime.evaluate = originalEvaluate;
      }

    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
      policyFeatureFlags.POLICY_RUNTIME = originalPolicy;
      policyFeatureFlags.OUTPUT_GUARDRAILS = originalOutput;
    }
  });

  await t.test('9. Promise-Coalescing and Cache Stampede Prevention', async () => {
    const middleware = new CachingMiddleware();
    
    const originalEnabled = featureFlags.CACHE_ENABLED;
    featureFlags.CACHE_ENABLED = true;

    try {
      const mockCtx1: any = {
        requestId: 'req-concurrent-1',
        traceId: 'trace-concurrent-1',
        creatorId: 'user-1',
        pipeline: 'generation',
        metadata: { tenantId: 't-1', workspaceId: 'ws-1' }
      };

      const mockCtx2: any = {
        requestId: 'req-concurrent-2',
        traceId: 'trace-concurrent-2',
        creatorId: 'user-1',
        pipeline: 'generation',
        metadata: { tenantId: 't-1', workspaceId: 'ws-1' }
      };

      const request: any = { provider: 'Gemini', model: 'gemini', prompt: 'concurrent stampede prompt', options: { temperature: 0 } };
      
      const key = buildCacheKey({ tenantId: 't-1', workspaceId: 'ws-1', creatorId: 'user-1' }, request);
      await cacheService.delete(key);

      // Trigger Request 1 (will be a cache miss and spawn in-flight single flight promise)
      const act1 = await middleware.before(mockCtx1, request);
      assert.strictEqual(act1, undefined); // continues execution

      // Trigger Request 2 concurrently (should find in-flight promise and return STOP)
      const act2Promise = middleware.before(mockCtx2, request);
      
      // Simulate Request 1 finishing generation and triggering after hook
      const simulatedResponse: AIResponse = {
        content: 'Generated concurrent script output content',
        metadata: {}
      };
      await middleware.after(mockCtx1, request, simulatedResponse);

      // Wait for Request 2 before hook to complete
      const act2 = await act2Promise;
      assert.strictEqual(act2, MiddlewareAction.STOP);
      assert.strictEqual(mockCtx2.metadata.cacheHit, true);
      assert.strictEqual(mockCtx2.metadata.response.content, 'Generated concurrent script output content');

    } finally {
      featureFlags.CACHE_ENABLED = originalEnabled;
    }
  });
});
