import test from 'node:test';
import assert from 'node:assert';
import { GET } from '../../../app/api/health/route';
import { POST } from '../../../app/api/content/generate/route';
import { generationMetrics } from '../services/generationMetrics';
import { traceEventBus } from '../services/traceRuntime';
import { ExponentialBackoffRetryPolicy } from '../../providers/policies';
import { ProviderError } from '../../providers/errors';
import { PolicyError } from '../../policy/types';

test('Production Reliability & Observability Test Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ userId, workspaceId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  await t.test('1. Metric collection and pricing cost tracking', () => {
    generationMetrics.clear();
    generationMetrics.setPricing('mock-pricing-model', { promptPricePer1K: 0.10, completionPricePer1K: 0.20 });

    traceEventBus.publish({
      traceId: 'trace-metric-1',
      requestId: 'req-metric-1',
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'started',
      timestamp: new Date(Date.now() - 100).toISOString()
    } as any);

    traceEventBus.publish({
      traceId: 'trace-metric-1',
      requestId: 'req-metric-1',
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'completed',
      timestamp: new Date().toISOString()
    } as any);

    traceEventBus.publish({
      traceId: 'trace-metric-1',
      requestId: 'req-metric-1',
      stage: 'providers',
      component: 'MockProvider',
      status: 'started',
      timestamp: new Date(Date.now() - 50).toISOString()
    } as any);

    traceEventBus.publish({
      traceId: 'trace-metric-1',
      requestId: 'req-metric-1',
      stage: 'providers',
      component: 'MockProvider',
      status: 'completed',
      timestamp: new Date().toISOString(),
      metadata: {
        model: 'mock-pricing-model',
        usage: {
          promptTokens: 1000,
          completionTokens: 2000
        }
      }
    } as any);

    const summary = generationMetrics.getSummary();
    assert.strictEqual(summary.totalCount, 1);
    assert.strictEqual(summary.successCount, 1);
    assert.strictEqual(summary.totalTokens, 3000);
    // 1000 prompt tokens ($0.10) + 2000 completion tokens ($0.40) = $0.50
    assert.strictEqual(summary.totalCost, 0.50);
  });

  await t.test('2. ExponentialBackoffRetryPolicy transient vs permanent filters', async () => {
    // 2.1 Transient failure retried
    let attempts = 0;
    const retryPolicy = new ExponentialBackoffRetryPolicy(2, 5, 2, true);

    await retryPolicy.execute(async (attempt) => {
      attempts = attempt;
      if (attempt === 0) {
        throw new ProviderError('Connection timed out', 'mock', 'TIMEOUT');
      }
      return 'success';
    });
    assert.strictEqual(attempts, 1);

    // 2.2 Permanent failure (Auth, Validation, Policy) throws immediately without retrying
    attempts = 0;
    await assert.rejects(async () => {
      await retryPolicy.execute(async (attempt) => {
        attempts = attempt;
        throw new ProviderError('Invalid api key', 'mock', 'AUTH_ERROR');
      });
    }, /Invalid api key/);
    assert.strictEqual(attempts, 0);

    // 2.3 PolicyError throws immediately
    attempts = 0;
    await assert.rejects(async () => {
      await retryPolicy.execute(async (attempt) => {
        attempts = attempt;
        throw new PolicyError('block-p1', 'Triggered input guardrail block', 'CRITICAL', 'PRE_PROVIDER');
      });
    }, /Policy Blocked/);
    assert.strictEqual(attempts, 0);
  });

  await t.test('3. Healthcheck diagnostic API handles isolation failures', async () => {
    // Override environment connection strings to cause failure check
    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost:9999/does-not-exist';

    const res = await GET();
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    
    // Status must remain offline/degraded but API resolves 200 (fail-open/isolated)
    assert.ok(data.status === 'degraded' || data.status === 'unhealthy');
    assert.strictEqual(data.components.postgres, 'disconnected');

    process.env.DATABASE_URL = originalDbUrl;
  });

  await t.test('4. Generation route enforces timeout bounds and normalizes internal errors', async () => {
    // Cause timeout by setting GENERATION_TIMEOUT_MS to 5ms
    const originalTimeout = process.env.GENERATION_TIMEOUT_MS;
    process.env.GENERATION_TIMEOUT_MS = '5';

    const token = createMockToken('u-1', 'ws-1');
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Timeout validation',
        topic: 'Verifying timeout cancellation works correctly',
        primaryGoal: 'Reach'
      })
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 504);
    const responseBody = await res.json();
    assert.match(responseBody.error, /Request timed out/);

    process.env.GENERATION_TIMEOUT_MS = originalTimeout;
  });
});
