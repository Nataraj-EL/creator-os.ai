import test from 'node:test';
import assert from 'node:assert';
import { 
  RouteRegistry, 
  MiddlewareRegistry, 
  InMemoryRateLimiter, 
  DefaultResponseSerializer, 
  APIGatewayRuntime, 
  featureFlags, 
  APIRequest, 
  APIResponse 
} from '../index';

test('API Gateway Runtime Test Suite', async (t) => {

  const routeRegistry = new RouteRegistry();
  const middlewareRegistry = new MiddlewareRegistry();
  const rateLimiter = new InMemoryRateLimiter();
  const serializer = new DefaultResponseSerializer();
  const runtime = new APIGatewayRuntime(routeRegistry, middlewareRegistry, rateLimiter);

  await t.test('1. Route matching and duplicate checks', () => {
    routeRegistry.clear();

    routeRegistry.register({
      method: 'GET',
      path: '/v1/agents',
      handler: async () => ({ status: 200, payload: [] })
    });

    // Check duplicate throws error
    assert.throws(() => {
      routeRegistry.register({
        method: 'GET',
        path: '/v1/agents',
        handler: async () => ({ status: 200, payload: [] })
      });
    }, /Route duplicate registration/);

    // Param path route register
    routeRegistry.register({
      method: 'GET',
      path: '/v1/agents/:id',
      handler: async () => ({ status: 200 })
    });

    const matched = routeRegistry.match('GET', '/v1/agents/agent-123');
    assert.ok(matched);
    assert.strictEqual(matched.params.id, 'agent-123');

    const unmatched = routeRegistry.match('GET', '/v1/unknown');
    assert.strictEqual(unmatched, null);
  });

  await t.test('2. Middleware priority ordering and short-circuit execution', async () => {
    featureFlags.API_RUNTIME = true;
    routeRegistry.clear();
    middlewareRegistry.clear();

    routeRegistry.register({
      method: 'POST',
      path: '/v1/workflows',
      handler: async () => ({ status: 200, payload: 'workflow-ran' })
    });

    const executionOrder: string[] = [];

    // Low priority middleware
    middlewareRegistry.register(async (req, ctx, next) => {
      executionOrder.push('low');
      return next();
    }, 10);

    // High priority middleware
    middlewareRegistry.register(async (req, ctx, next) => {
      executionOrder.push('high');
      return next();
    }, 100);

    const request: APIRequest = {
      params: {}, query: {}, headers: {}, cookies: {}, body: {}
    };

    await runtime.handleRequest('POST', '/v1/workflows', request);
    
    // Confirms priority order: high (100) runs before low (10)
    assert.deepStrictEqual(executionOrder, ['high', 'low']);

    // Check middleware short-circuit (e.g. auth failed)
    middlewareRegistry.clear();
    middlewareRegistry.register(async () => {
      return { status: 401, error: { code: 'UNAUTHORIZED', message: 'Auth failed' } };
    }, 50);

    const res = await runtime.handleRequest('POST', '/v1/workflows', request);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.error?.code, 'UNAUTHORIZED');

    featureFlags.API_RUNTIME = false;
  });

  await t.test('3. APIContext immutability checks', async () => {
    featureFlags.API_RUNTIME = true;
    routeRegistry.clear();
    middlewareRegistry.clear();

    let contextFrozen = false;

    routeRegistry.register({
      method: 'GET',
      path: '/v1/memory',
      handler: async (req, ctx) => {
        contextFrozen = Object.isFrozen(ctx);
        assert.throws(() => {
          (ctx as any).requestId = 'new-id';
        });
        return { status: 200 };
      }
    });

    const request: APIRequest = {
      params: {}, query: {}, headers: {}, cookies: {}, body: {}
    };

    await runtime.handleRequest('GET', '/v1/memory', request);
    assert.strictEqual(contextFrozen, true);

    featureFlags.API_RUNTIME = false;
  });

  await t.test('4. Response serialization JSON and SSE formats', () => {
    // JSON response
    const jsonRes: APIResponse = {
      status: 200,
      payload: { ok: true }
    };
    const jsonStr = serializer.serializeJSON(jsonRes);
    assert.strictEqual(jsonStr, JSON.stringify({ data: { ok: true } }));

    // Error response
    const errRes: APIResponse = {
      status: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid host' }
    };
    const errStr = serializer.serializeJSON(errRes);
    assert.strictEqual(errStr, JSON.stringify({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid host' }
    }));

    // SSE chunk check
    const chunk = serializer.serializeSSE('token', { text: 'hello' }, 'msg-1');
    assert.strictEqual(chunk, "event: token\ndata: {\"text\":\"hello\"}\nid: msg-1\n\n");
  });

  await t.test('5. Idempotency checks', async () => {
    featureFlags.API_RUNTIME = true;
    routeRegistry.clear();
    middlewareRegistry.clear();
    runtime.clearIdempotencyCache();

    let handlerCalls = 0;

    routeRegistry.register({
      method: 'POST',
      path: '/v1/tools',
      handler: async () => {
        handlerCalls++;
        return { status: 200, payload: 'tool-executed' };
      }
    });

    const request: APIRequest = {
      params: {},
      query: {},
      headers: { 'Idempotency-Key': 'key-abc' },
      cookies: {},
      body: {}
    };

    // First request
    const res1 = await runtime.handleRequest('POST', '/v1/tools', request);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(handlerCalls, 1);

    // Second request with same idempotency key (should return cached response, not invoking handler)
    const res2 = await runtime.handleRequest('POST', '/v1/tools', request);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.payload, 'tool-executed');
    assert.strictEqual(handlerCalls, 1);

    featureFlags.API_RUNTIME = false;
  });

  await t.test('6. Rate limiting window blockages', async () => {
    featureFlags.API_RUNTIME = true;
    routeRegistry.clear();
    middlewareRegistry.clear();
    rateLimiter.clear();

    routeRegistry.register({
      method: 'GET',
      path: '/v1/plugins',
      handler: async () => ({ status: 200 })
    });

    // Add RateLimit middleware
    middlewareRegistry.register(async (req, ctx, next) => {
      const res = await rateLimiter.limit('client-ip-1', 2, 5000);
      if (!res.allowed) {
        return { status: 429, error: { code: 'RATE_LIMITED', message: 'Too many requests' } };
      }
      return next();
    }, 90);

    const request: APIRequest = {
      params: {}, query: {}, headers: {}, cookies: {}, body: {}
    };

    const r1 = await runtime.handleRequest('GET', '/v1/plugins', request);
    const r2 = await runtime.handleRequest('GET', '/v1/plugins', request);
    const r3 = await runtime.handleRequest('GET', '/v1/plugins', request);

    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r3.status, 429); // Blocked by rate limiter

    featureFlags.API_RUNTIME = false;
  });

  await t.test('7. OpenAPI v3 dynamic schema checks', () => {
    routeRegistry.clear();

    routeRegistry.register({
      method: 'POST',
      path: '/v1/agents/:id',
      summary: 'Register agent',
      tags: ['agents'],
      validationSchema: {
        params: { id: { type: 'string', required: true } },
        body: { name: { type: 'string', required: true } }
      },
      handler: async () => ({ status: 200 })
    });

    const doc = routeRegistry.generateOpenAPI();
    assert.strictEqual(doc.openapi, '3.0.0');
    assert.ok(doc.paths['/v1/agents/{id}']);
    assert.ok(doc.paths['/v1/agents/{id}'].post);
    assert.strictEqual(doc.paths['/v1/agents/{id}'].post.tags[0], 'agents');
  });

  await t.test('8. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.API_RUNTIME, false);
    assert.strictEqual(featureFlags.API_STREAMING, false);
    assert.strictEqual(featureFlags.API_OPENAPI, false);
  });

});
