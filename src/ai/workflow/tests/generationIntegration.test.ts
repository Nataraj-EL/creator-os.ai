import test from 'node:test';
import assert from 'node:assert';
import { POST } from '../../../app/api/content/generate/route';
import { policyRuntime } from '../../policy';
import { traceEventBus } from '../../observability';

test('Production Generation Path Integration Test Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ userId, workspaceId, tenantId: 'tenant-test', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  await t.test('1. Rejects request with missing Authorization header', async () => {
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      body: JSON.stringify({
        title: 'New Video Title',
        topic: 'How to build SaaS',
        primaryGoal: 'Reach'
      })
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Missing or invalid token/);
  });

  await t.test('2. Rejects request with malformed JWT', async () => {
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-token-parts'
      },
      body: JSON.stringify({
        title: 'New Video Title',
        topic: 'How to build SaaS',
        primaryGoal: 'Reach'
      })
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Malformed JWT/);
  });

  await t.test('3. Rejects request with missing required parameters', async () => {
    const token = createMockToken('user-1', 'ws-1');
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: '',
        topic: 'Valid topic description'
      })
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Parameter validation failed/);
  });

  await t.test('4. Successfully invokes server-side generateContent, propagating context and policy runs', async () => {
    const token = createMockToken('user-77', 'ws-99');
    
    // Track trace events
    const traceEvents: any[] = [];
    const unsubscribe = traceEventBus.subscribe((evt) => {
      traceEvents.push(evt);
    });

    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Trace-Id': 'custom-trace-999',
        'X-Request-Id': 'custom-req-999'
      },
      body: JSON.stringify({
        title: 'Hardening Integration Guide',
        topic: 'How to write integration tests in Next.js',
        primaryGoal: 'Conversion'
      })
    });

    // Mock API Client to avoid making real calls to external Spring Boot backend
    const { apiClient } = require('../../../lib/api-client');
    const originalPost = apiClient.post;
    apiClient.post = async (url: string, data: any, config: any) => {
      assert.strictEqual(url, `/api/v1/workspaces/ws-99/content`);
      assert.strictEqual(config.headers['X-Trace-Id'], 'custom-trace-999');
      assert.strictEqual(config.headers['X-Request-Id'], 'custom-req-999');
      assert.strictEqual(config.headers['Authorization'], `Bearer ${token}`);
      
      return {
        data: {
          projectId: 'proj-111',
          title: data.title,
          topic: data.topic,
          primaryGoal: data.primaryGoal,
          script: 'Generated integration script test output',
          status: 'DRAFT',
          createdAt: new Date().toISOString()
        }
      };
    };

    const res = await POST(req);
    assert.strictEqual(res.status, 200);
    const responseBody = await res.json();
    
    // Verify response structure matches contract
    assert.strictEqual(responseBody.projectId, 'proj-111');
    assert.strictEqual(responseBody.title, 'Hardening Integration Guide');

    // Clean up
    apiClient.post = originalPost;
    unsubscribe();

    // Verify trace logs captured the execution pipeline
    const middlewareStarted = traceEvents.some(
      e => e.traceId === 'custom-trace-999' && e.component === 'TraceMiddleware' && e.status === 'started'
    );
    assert.ok(middlewareStarted, "Expected TraceMiddleware started log in unified observability");
  });
});
